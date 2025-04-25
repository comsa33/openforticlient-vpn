import * as vscode from 'vscode';
import * as cp from 'child_process';
import { VpnProfile } from '../models/profile';
import { LogService } from './logService';
import { MetricsService } from './metricsService';

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
    private _currentProcess: cp.ChildProcess | null = null;
    private _logger: LogService;
    private _metricsService: MetricsService;
    
    /**
     * Event that fires when VPN connection status changes
     */
    public readonly onStatusChanged: vscode.Event<boolean> = this._onStatusChanged.event;
    
    constructor(context: vscode.ExtensionContext, statusBarItem: vscode.StatusBarItem) {
        this.context = context;
        this._statusBarItem = statusBarItem;
        this._logger = LogService.getInstance();
        this._metricsService = MetricsService.getInstance(context);
        
        // Set initial status
        this.updateStatusBar();
        
        // Start status checking
        setInterval(() => this.checkVPNStatus(), 5000);
        
        this._logger.log('VPN Service initialized');
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
            this._logger.log('VPN is already connected or connecting.', true);
            return false;
        }
        
        this._logger.log(`Connecting to VPN using profile "${profile.name}" (${profile.host}:${profile.port})...`);
        
        // Get saved password for this profile
        let password = await this.context.secrets.get(this.getPasswordKey(profile.id));
        
        // If no saved password, ask for it
        if (!password) {
            this._logger.log('No saved password found, prompting for password...');
            password = await vscode.window.showInputBox({
                prompt: `Enter VPN password for profile "${profile.name}"`,
                password: true
            });
            
            if (!password) {
                this._logger.log('Password entry canceled by user');
                return false; // User canceled
            }
            
            // Ask if user wants to save this password
            const savePassword = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Save this password for future connections?'
            });
            
            if (savePassword === 'Yes') {
                await this.context.secrets.store(this.getPasswordKey(profile.id), password);
                this._logger.log('Password saved for future connections.');
            }
        }
        
        try {
            this._isConnecting = true;
            this.updateStatusBar();
            
            const hostWithPort = profile.port ? `${profile.host}:${profile.port}` : profile.host;
            
            // Start openfortivpn in background mode
            this._logger.log('Starting OpenFortiVPN process in background mode...');
            
            // Prepare sudo and openfortivpn commands
            const sudoCmd = 'sudo';
            const args = ['-S', 'openfortivpn', hostWithPort, '-u', profile.username];
            
            // Create child process
            this._currentProcess = cp.spawn(sudoCmd, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Pass password to stdin securely
            if (this._currentProcess.stdin) {
                this._currentProcess.stdin.write(password + '\n');
                // Securely wipe password from memory
                password = '';
            }
            
            // Process stdout
            if (this._currentProcess.stdout) {
                this._currentProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    this._logger.log(`VPN output: ${output.trim()}`);
                    
                    // Check for successful connection
                    if (output.includes('Tunnel is up and running')) {
                        this._isConnecting = false;
                        this._isConnected = true;
                        this.updateStatusBar();
                        this._logger.log('VPN connection established successfully', true);
                        
                        // Start collecting metrics for this connection
                        this._metricsService.startMetricsCollection(profile);
                        
                        this._onStatusChanged.fire(true);
                    }
                });
            }
            
            // Process stderr
            if (this._currentProcess.stderr) {
                this._currentProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    // Ignore password prompts (already sent via stdin)
                    if (!output.includes('password for') && !output.includes('[sudo]')) {
                        this._logger.log(`VPN error: ${output.trim()}`);
                    }
                });
            }
            
            // Process exit
            this._currentProcess.on('close', (code) => {
                if (code !== 0 && this._isConnecting) {
                    this._isConnecting = false;
                    this.updateStatusBar();
                    this._logger.error(`VPN process exited with code ${code}`, null, true);
                    this._onStatusChanged.fire(false);
                } else if (this._isConnected) {
                    this._isConnected = false;
                    this.updateStatusBar();
                    this._logger.log('VPN connection closed', true);
                    
                    // Stop metrics collection
                    this._metricsService.stopMetricsCollection();
                    
                    this._onStatusChanged.fire(false);
                }
                this._currentProcess = null;
            });
            
            // Process error
            this._currentProcess.on('error', (error) => {
                this._isConnecting = false;
                this.updateStatusBar();
                this._logger.error('Failed to start VPN process', error, true);
                this._onStatusChanged.fire(false);
                this._currentProcess = null;
            });
            
            this._logger.log(`Connecting to VPN using profile "${profile.name}"...`, true);
            
            // Check status after 5 seconds
            setTimeout(() => this.checkVPNStatus(), 5000);
            
            return true;
        } catch (error) {
            this._isConnecting = false;
            this.updateStatusBar();
            this._logger.error(`VPN connection failed`, error, true);
            return false;
        }
    }
    
    /**
     * Disconnect from VPN
     */
    public async disconnect(): Promise<boolean> {
        if (!this._isConnected && !this._isConnecting) {
            this._logger.log('VPN is not connected.', true);
            return false;
        }
        
        this._logger.log('Disconnecting VPN...');
        
        try {
            // Get active profile
            const activeProfile = await vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile');
            
            let password;
            if (activeProfile) {
                // Try to get saved password for active profile
                password = await this.context.secrets.get(this.getPasswordKey(activeProfile.id));
            }
            
            // If no saved password or no active profile, ask for it
            if (!password) {
                this._logger.log('No saved password found for disconnection, prompting for sudo password...');
                password = await vscode.window.showInputBox({
                    prompt: 'Enter sudo password to disconnect VPN',
                    password: true
                });
                
                if (!password) {
                    this._logger.log('Password entry canceled by user');
                    return false; // User canceled
                }
            }
            
            // Execute disconnect command in background
            const sudoCmd = 'sudo';
            const args = ['-S', 'pkill', '-SIGTERM', 'openfortivpn'];
            
            const process = cp.spawn(sudoCmd, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Pass password to stdin
            if (process.stdin) {
                process.stdin.write(password + '\n');
                // Securely wipe password from memory
                password = '';
            }
            
            // Process stdout
            if (process.stdout) {
                process.stdout.on('data', (data) => {
                    this._logger.log(`Disconnect output: ${data.toString().trim()}`);
                });
            }
            
            // Process stderr
            if (process.stderr) {
                process.stderr.on('data', (data) => {
                    const output = data.toString();
                    // Ignore password prompts
                    if (!output.includes('password for') && !output.includes('[sudo]')) {
                        this._logger.log(`Disconnect error: ${output.trim()}`);
                    }
                });
            }
            
            // Wait for process to complete
            await new Promise<void>((resolve) => {
                process.on('close', (code) => {
                    if (code !== 0) {
                        this._logger.error(`Disconnect process exited with code ${code}`);
                    } else {
                        this._logger.log('VPN disconnection command completed successfully');
                    }
                    resolve();
                });
            });
            
            // Clean up current process if still running
            if (this._currentProcess) {
                try {
                    this._currentProcess.kill();
                } catch (err) {
                    this._logger.log(`Error killing current process: ${err}`);
                }
                this._currentProcess = null;
            }
            
            // Stop metrics collection
            await this._metricsService.stopMetricsCollection();
            
            // Update status
            this._isConnected = false;
            this._isConnecting = false;
            this.updateStatusBar();
            
            this._logger.log('OpenFortiVPN has been disconnected.', true);
            
            // Notify status change
            this._onStatusChanged.fire(false);
            
            return true;
        } catch (error) {
            this._logger.error(`Failed to disconnect VPN`, error, true);
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
        this._logger.log(`Password saved for profile "${profile.name}".`, true);
        return true;
    }
    
    /**
     * Clear saved password for a profile
     */
    public async clearPassword(profile: VpnProfile): Promise<void> {
        await this.context.secrets.delete(this.getPasswordKey(profile.id));
        this._logger.log(`Password cleared for profile "${profile.name}".`, true);
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
                    this._logger.log('OpenFortiVPN connection has been lost.', true);
                    
                    // Stop metrics collection on VPN disconnection
                    this._metricsService.stopMetricsCollection();
                    
                    // Notify status change
                    this._onStatusChanged.fire(false);
                }
            } else {
                // If ppp0 interface exists, VPN is connected
                this._isConnecting = false;
                
                if (!this._isConnected) {
                    this._isConnected = true;
                    this.updateStatusBar();
                    this._logger.log('OpenFortiVPN connection has been established.', true);
                    
                    // Get active profile to start metrics collection
                    vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile')
                        .then(profile => {
                            if (profile) {
                                this._metricsService.startMetricsCollection(profile);
                            }
                        }, err => {
                            // Error handling in the same .then() call rather than using .catch()
                            this._logger.error('Error getting active profile for metrics', err);
                        });
                    
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