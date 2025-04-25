import * as vscode from 'vscode';
import * as cp from 'child_process';
import { VpnProfile } from '../models/profile';

/**
 * Password key for SecretStorage
 */
const VPN_PASSWORD_KEY_PREFIX = 'openfortivpn-password-';

/**
 * Service for managing VPN connections
 */
export class VpnService {
    private context: vscode.ExtensionContext;
    private _isConnected: boolean = false;
    private _isConnecting: boolean = false;
    private _statusBarItem: vscode.StatusBarItem;
    private _onStatusChanged: vscode.EventEmitter<boolean> = new vscode.EventEmitter<boolean>();
    
    /**
     * Event that fires when VPN connection status changes
     */
    public readonly onStatusChanged: vscode.Event<boolean> = this._onStatusChanged.event;
    
    constructor(context: vscode.ExtensionContext, statusBarItem: vscode.StatusBarItem) {
        this.context = context;
        this._statusBarItem = statusBarItem;
        
        // Set initial status
        this.updateStatusBar();
        
        // Start status checking
        setInterval(() => this.checkVPNStatus(), 5000);
    }
    
    /**
     * Check if VPN is connected
     */
    public get isConnected(): boolean {
        return this._isConnected;
    }
    
    /**
     * Check if VPN is connecting
     */
    public get isConnecting(): boolean {
        return this._isConnecting;
    }
    
    /**
     * Update the status bar display
     */
    private updateStatusBar(): void {
        if (this._isConnecting) {
            this._statusBarItem.text = "$(shield) VPN: Connecting...";
            this._statusBarItem.backgroundColor = undefined;
        } else if (this._isConnected) {
            this._statusBarItem.text = "$(shield) VPN: Connected";
            this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this._statusBarItem.text = "$(shield) VPN: Disconnected";
            this._statusBarItem.backgroundColor = undefined;
        }
        
        // Update context for command visibility in menus
        vscode.commands.executeCommand('setContext', 'openfortivpn:isConnected', this._isConnected);
    }
    
    /**
     * Get password key for a profile
     */
    private getPasswordKey(profileId: string): string {
        return `${VPN_PASSWORD_KEY_PREFIX}${profileId}`;
    }
    
    /**
     * Connect to VPN using the specified profile
     */
    public async connect(profile: VpnProfile): Promise<boolean> {
        if (this._isConnected || this._isConnecting) {
            vscode.window.showWarningMessage('VPN is already connected or connecting.');
            return false;
        }
        
        // Get saved password for this profile
        let password = await this.context.secrets.get(this.getPasswordKey(profile.id));
        
        // If no saved password, ask for it
        if (!password) {
            password = await vscode.window.showInputBox({
                prompt: `Enter VPN password for profile "${profile.name}"`,
                password: true
            });
            
            if (!password) {
                return false; // User canceled
            }
            
            // Ask if user wants to save this password
            const savePassword = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Save this password for future connections?'
            });
            
            if (savePassword === 'Yes') {
                await this.context.secrets.store(this.getPasswordKey(profile.id), password);
                vscode.window.showInformationMessage('Password saved for future connections.');
            }
        }
        
        try {
            this._isConnecting = true;
            this.updateStatusBar();
            
            const hostWithPort = profile.port ? `${profile.host}:${profile.port}` : profile.host;
            
            // Create terminal
            const terminal = vscode.window.createTerminal('OpenFortiVPN');
            terminal.show();
            
            // Use expect-like approach for automating the password input
            const script = `
echo '${password}' | sudo -S openfortivpn ${hostWithPort} -u ${profile.username}
`;
            
            terminal.sendText(script);
            
            vscode.window.showInformationMessage(`Connecting to VPN using profile "${profile.name}"...`);
            
            // Wait a bit and then check status
            setTimeout(() => this.checkVPNStatus(), 5000);
            
            return true;
        } catch (error) {
            this._isConnecting = false;
            this.updateStatusBar();
            vscode.window.showErrorMessage(`VPN connection failed: ${error}`);
            return false;
        }
    }
    
    /**
     * Disconnect from VPN
     */
    public async disconnect(): Promise<boolean> {
        if (!this._isConnected && !this._isConnecting) {
            vscode.window.showWarningMessage('VPN is not connected.');
            return false;
        }
        
        try {
            // Ask for password (we don't know which profile was used to connect)
            // This could be improved by tracking the active connection profile
            const activeProfile = await vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile');
            
            let password;
            if (activeProfile) {
                // Try to get the saved password for the active profile
                password = await this.context.secrets.get(this.getPasswordKey(activeProfile.id));
            }
            
            // If no saved password or no active profile, ask for it
            if (!password) {
                password = await vscode.window.showInputBox({
                    prompt: 'Enter sudo password to disconnect VPN',
                    password: true
                });
                
                if (!password) {
                    return false; // User canceled
                }
            }
            
            // Create terminal
            const terminal = vscode.window.createTerminal('OpenFortiVPN');
            terminal.show();
            
            // Use echo to pipe password to sudo
            terminal.sendText(`echo '${password}' | sudo -S pkill -SIGTERM openfortivpn`);
            
            // Update status
            this._isConnected = false;
            this._isConnecting = false;
            this.updateStatusBar();
            
            vscode.window.showInformationMessage('OpenFortiVPN has been disconnected.');
            
            // Notify status change
            this._onStatusChanged.fire(false);
            
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to disconnect VPN: ${error}`);
            return false;
        }
    }
    
    /**
     * Save password for a profile
     */
    public async savePassword(profile: VpnProfile): Promise<boolean> {
        const password = await vscode.window.showInputBox({
            prompt: `Enter VPN password for profile "${profile.name}"`,
            password: true
        });
        
        if (!password) {
            return false; // User canceled
        }
        
        await this.context.secrets.store(this.getPasswordKey(profile.id), password);
        vscode.window.showInformationMessage(`Password saved for profile "${profile.name}".`);
        return true;
    }
    
    /**
     * Clear saved password for a profile
     */
    public async clearPassword(profile: VpnProfile): Promise<void> {
        await this.context.secrets.delete(this.getPasswordKey(profile.id));
        vscode.window.showInformationMessage(`Password cleared for profile "${profile.name}".`);
    }
    
    /**
     * Check VPN connection status
     */
    public checkVPNStatus(): void {
        // Command works on macOS and Linux
        const command = 'ip addr show ppp0 2>/dev/null || ifconfig ppp0 2>/dev/null';
        
        cp.exec(command, (error, stdout) => {
            const wasConnected = this._isConnected;
            
            if (error || !stdout) {
                // If ppp0 interface does not exist, VPN is disconnected
                if (this._isConnected) {
                    this._isConnected = false;
                    this._isConnecting = false;
                    this.updateStatusBar();
                    vscode.window.showWarningMessage('OpenFortiVPN connection has been lost.');
                    
                    // Notify status change
                    this._onStatusChanged.fire(false);
                }
            } else {
                // If ppp0 interface exists, VPN is connected
                this._isConnecting = false;
                
                if (!this._isConnected) {
                    this._isConnected = true;
                    this.updateStatusBar();
                    vscode.window.showInformationMessage('OpenFortiVPN connection has been established.');
                    
                    // Notify status change
                    this._onStatusChanged.fire(true);
                }
            }
            
            // Update status bar if needed
            if (wasConnected !== this._isConnected || this._isConnecting) {
                this.updateStatusBar();
            }
        });
    }
}