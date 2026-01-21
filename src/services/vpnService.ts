import * as vscode from 'vscode';
import * as cp from 'child_process';
import { VpnProfile } from '../models/profile';
import { ProfileManager } from '../models/profileManager';
import { LogService } from './logService';
import { MetricsService } from './metricsService';

/**
 * Password key for SecretStorage
 */
const VPN_PASSWORD_KEY_PREFIX = 'openfortivpn-password-';
const SUDO_PASSWORD_KEY = 'openfortivpn-sudo-password';

/**
 * VPN Auto-Reconnect States
 */
enum ReconnectState {
    Idle,
    Attempting,
    MaxRetriesReached
}

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
    private _profileManager: ProfileManager | null = null;
    
    // Auto-reconnect properties
    private _reconnectTimer: NodeJS.Timeout | null = null;
    private _reconnectAttempts: number = 0;
    private _reconnectState: ReconnectState = ReconnectState.Idle;
    private _lastConnectedProfile: VpnProfile | null = null;
    private _lastDisconnectWasManual: boolean = false;
    private _configChangeListener: vscode.Disposable | null = null;
    
    // Certificate trust properties
    private _pendingCertHash: string | null = null;
    private _awaitingCertTrust: boolean = false;
    
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
        
        // Listen for configuration changes
        this._configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('openfortivpn-connector.autoReconnect') ||
                e.affectsConfiguration('openfortivpn-connector.autoReconnectMaxRetries') ||
                e.affectsConfiguration('openfortivpn-connector.autoReconnectInterval')) {
                this._logger.log('Auto-reconnect configuration changed');
            }
        });
        
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
     * Get current reconnect state
     */
    public get reconnectState(): ReconnectState {
        return this._reconnectState;
    }

    /**
     * Get current reconnect attempt count
     */
    public get reconnectAttempts(): number {
        return this._reconnectAttempts;
    }
    
    /**
     * Set the profile manager reference for certificate trust updates
     */
    public setProfileManager(profileManager: ProfileManager): void {
        this._profileManager = profileManager;
    }
    
    /**
     * Update the status bar display
     */
    private updateStatusBar(): void {
        if (this._isConnecting) {
            if (this._reconnectState === ReconnectState.Attempting) {
                this._statusBarItem.text = `$(shield) VPN: Reconnecting... (${this._reconnectAttempts})`;
            } else {
                this._statusBarItem.text = "$(shield) VPN: Connecting...";
            }
            this._statusBarItem.backgroundColor = undefined;
        } else if (this._isConnected) {
            this._statusBarItem.text = "$(shield) VPN: Connected";
            this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            if (this._reconnectState === ReconnectState.MaxRetriesReached) {
                this._statusBarItem.text = "$(shield) VPN: Reconnect Failed";
                this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else {
                this._statusBarItem.text = "$(shield) VPN: Disconnected";
                this._statusBarItem.backgroundColor = undefined;
            }
        }
        
        // Update context for command visibility in menus
        vscode.commands.executeCommand('setContext', 'openfortivpn:isConnected', this._isConnected);
        vscode.commands.executeCommand('setContext', 'openfortivpn:isReconnecting', 
            this._reconnectState === ReconnectState.Attempting);
        // Add context for max retries reached state
        vscode.commands.executeCommand('setContext', 'openfortivpn:maxRetriesReached', 
            this._reconnectState === ReconnectState.MaxRetriesReached);
    }
    
    /**
     * Get password key for a profile
     */
    private getPasswordKey(profileId: string): string {
        return `${VPN_PASSWORD_KEY_PREFIX}${profileId}`;
    }
    
    /**
     * Get auto-reconnect configuration
     */
    private getAutoReconnectConfig(): { enabled: boolean, maxRetries: number, interval: number } {
        const config = vscode.workspace.getConfiguration('openfortivpn-connector');
        return {
            enabled: config.get<boolean>('autoReconnect', false),
            maxRetries: config.get<number>('autoReconnectMaxRetries', 3),
            interval: config.get<number>('autoReconnectInterval', 10)
        };
    }
    
    /**
     * Start auto-reconnect process if enabled
     */
    private startAutoReconnect(): void {
        const config = this.getAutoReconnectConfig();
        
        // Only proceed if auto-reconnect is enabled and we have a profile to reconnect to
        if (!config.enabled || !this._lastConnectedProfile || this._lastDisconnectWasManual) {
            if (this._lastDisconnectWasManual) {
                this._logger.log('Auto-reconnect skipped: last disconnect was manual');
            } else if (!config.enabled) {
                this._logger.log('Auto-reconnect is disabled in settings');
            } else if (!this._lastConnectedProfile) {
                this._logger.log('Auto-reconnect skipped: no previous connection profile');
            }
            return;
        }
        
        // If already attempting to reconnect, don't start another attempt
        if (this._reconnectState === ReconnectState.Attempting) {
            return;
        }
        
        // Reset reconnect state
        this._reconnectAttempts = 0;
        this._reconnectState = ReconnectState.Attempting;
        
        this._logger.log(`Auto-reconnect enabled. Will attempt to reconnect ${config.maxRetries} times with ${config.interval}s intervals.`, true);
        
        // Schedule first reconnect attempt
        this.scheduleReconnect(config.interval);
    }
    
    /**
     * Schedule a reconnect attempt
     */
    private scheduleReconnect(intervalSeconds: number): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
        }
        
        this.updateStatusBar();
        
        this._reconnectTimer = setTimeout(() => {
            this.attemptReconnect();
        }, intervalSeconds * 1000);
        
        this._logger.log(`Scheduled reconnect attempt in ${intervalSeconds} seconds`);
    }
    
    /**
     * Attempt to reconnect to VPN
     */
    private async attemptReconnect(): Promise<void> {
        const config = this.getAutoReconnectConfig();
        
        if (!this._lastConnectedProfile) {
            this._reconnectState = ReconnectState.Idle;
            this._logger.error('Cannot reconnect: No previous connection profile');
            return;
        }
        
        // Increment attempt counter
        this._reconnectAttempts++;
        
        this._logger.log(`Auto-reconnect: Attempt ${this._reconnectAttempts} of ${config.maxRetries}`);
        
        // Try to reconnect
        const success = await this.connect(this._lastConnectedProfile, true);
        
        if (success) {
            // Reconnect succeeded
            this._reconnectState = ReconnectState.Idle;
            this._reconnectAttempts = 0;
            this._logger.log('Auto-reconnect: Successfully reconnected to VPN', true);
            
            // Update UI
            this.updateStatusBar();
        } else {
            // Reconnect failed
            if (this._reconnectAttempts >= config.maxRetries) {
                // Max retries reached
                this._reconnectState = ReconnectState.MaxRetriesReached;
                this._logger.error(`Auto-reconnect: Maximum retry attempts (${config.maxRetries}) reached. Giving up.`, null, true);
                
                // Update UI
                this.updateStatusBar();
            } else {
                // Schedule next attempt
                this.scheduleReconnect(config.interval);
            }
        }
    }
    
    /**
     * Stop auto-reconnect process
     */
    private stopAutoReconnect(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        
        if (this._reconnectState !== ReconnectState.Idle) {
            this._logger.log('Auto-reconnect process stopped');
        }
        
        this._reconnectState = ReconnectState.Idle;
        this._reconnectAttempts = 0;
    }
    
    /**
     * Reset auto-reconnect state when manually connecting
     */
    private resetAutoReconnectState(): void {
        this.stopAutoReconnect();
        this._lastDisconnectWasManual = false;
    }
    
    /**
     * Prompt user to trust the certificate and save it to the profile
     */
    private async promptCertificateTrust(profile: VpnProfile, isReconnectAttempt: boolean): Promise<void> {
        if (!this._pendingCertHash) {
            this._awaitingCertTrust = false;
            return;
        }
        
        const certHash = this._pendingCertHash;
        const shortHash = certHash.substring(0, 16) + '...';
        
        this._logger.log(`Prompting user to trust certificate: ${shortHash}`);
        
        // Show trust dialog to user
        const action = await vscode.window.showWarningMessage(
            `The VPN gateway's SSL certificate is not trusted.\n\nDo you want to trust this certificate and save it to your profile?\n\nCertificate SHA256: ${shortHash}`,
            { modal: true },
            'Trust & Connect',
            'View Full Hash',
            'Cancel'
        );
        
        if (action === 'View Full Hash') {
            // Show full hash and ask again
            const secondAction = await vscode.window.showWarningMessage(
                `Full Certificate SHA256 Hash:\n\n${certHash}\n\nDo you want to trust this certificate?`,
                { modal: true },
                'Trust & Connect',
                'Cancel'
            );
            
            if (secondAction === 'Trust & Connect') {
                await this.saveCertificateAndReconnect(profile, certHash, isReconnectAttempt);
            } else {
                this._logger.log('User declined to trust the certificate');
                this.resetCertificateTrustState();
            }
        } else if (action === 'Trust & Connect') {
            await this.saveCertificateAndReconnect(profile, certHash, isReconnectAttempt);
        } else {
            this._logger.log('User declined to trust the certificate');
            this.resetCertificateTrustState();
        }
    }
    
    /**
     * Save the certificate to the profile and reconnect
     */
    private async saveCertificateAndReconnect(profile: VpnProfile, certHash: string, isReconnectAttempt: boolean): Promise<void> {
        if (!this._profileManager) {
            this._logger.error('Cannot save certificate: ProfileManager not available');
            this.resetCertificateTrustState();
            return;
        }
        
        try {
            // Update the profile with the trusted certificate
            const updatedProfile: VpnProfile = {
                ...profile,
                trustedCert: certHash
            };
            
            await this._profileManager.updateProfile(updatedProfile);
            this._logger.log(`Certificate saved to profile "${profile.name}"`, true);
            
            // Reset state
            this.resetCertificateTrustState();
            
            // Kill current process if running
            if (this._currentProcess) {
                try {
                    this._currentProcess.kill();
                } catch (err) {
                    // Ignore
                }
                this._currentProcess = null;
            }
            
            this._isConnecting = false;
            this._isConnected = false;
            
            // Wait a moment before reconnecting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Reconnect with the updated profile
            this._logger.log('Reconnecting with trusted certificate...', true);
            await this.connect(updatedProfile, isReconnectAttempt);
            
        } catch (error) {
            this._logger.error('Failed to save certificate to profile', error);
            this.resetCertificateTrustState();
        }
    }
    
    /**
     * Reset certificate trust state
     */
    private resetCertificateTrustState(): void {
        this._pendingCertHash = null;
        this._awaitingCertTrust = false;
    }
    
    /**
     * Connect to VPN using the specified profile
     * @param profile VPN profile to connect with
     * @param isReconnectAttempt Whether this is a reconnection attempt
     */
    public async connect(profile: VpnProfile, isReconnectAttempt: boolean = false): Promise<boolean> {
        // If already connected or connecting, disconnect first
        if (this._isConnected || this._isConnecting) {
            this._logger.log('VPN is already connected. Disconnecting current connection before connecting to new profile...', !isReconnectAttempt);
            
            // Disconnect current connection
            const disconnected = await this.disconnect(false);
            if (!disconnected) {
            this._logger.error('Failed to disconnect current VPN connection', null, !isReconnectAttempt);
            return false;
            }
            
            // Wait briefly to ensure disconnection is complete
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!isReconnectAttempt) {
            this.resetAutoReconnectState();
        }
        
        this._logger.log(`${isReconnectAttempt ? 'Reconnecting' : 'Connecting'} to VPN using profile \"${profile.name}\" (${profile.host}:${profile.port})...`);
        
        // Check if using SAML login
        const useSaml = profile.useSamlLogin === true;
        if (useSaml) {
            this._logger.log('Using SAML SSO authentication');
        }
        
        // Get saved sudo password
        let sudoPassword = await this.context.secrets.get(SUDO_PASSWORD_KEY);
        
        // If no saved sudo password, ask for it (only for manual connections)
        if (!sudoPassword && !isReconnectAttempt) {
            this._logger.log('No saved sudo password found, prompting...');
            sudoPassword = await vscode.window.showInputBox({
                prompt: 'Enter your Mac/Linux system password (for sudo)',
                password: true,
                placeHolder: 'System password'
            });
            
            if (!sudoPassword) {
                this._logger.log('Sudo password entry canceled by user');
                return false;
            }
            
            // Save sudo password
            const saveSudoPassword = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Save system password for future connections?'
            });
            
            if (saveSudoPassword === 'Yes') {
                await this.context.secrets.store(SUDO_PASSWORD_KEY, sudoPassword);
                this._logger.log('System password saved.');
            }
        }
        
        // VPN password is only needed for non-SAML login
        let vpnPassword: string | undefined = '';
        
        if (!useSaml) {
            // Get saved VPN password for this profile
            vpnPassword = await this.context.secrets.get(this.getPasswordKey(profile.id));
            
            // If no saved VPN password, ask for it (only for manual connections)
            if (!vpnPassword && !isReconnectAttempt) {
                this._logger.log('No saved VPN password found, prompting...');
                vpnPassword = await vscode.window.showInputBox({
                    prompt: `Enter VPN password for profile \"${profile.name}\"`,
                    password: true,
                    placeHolder: 'VPN account password'
                });
                
                if (!vpnPassword) {
                    this._logger.log('VPN password entry canceled by user');
                    return false;
                }
                
                // Ask if user wants to save this password
                const saveVpnPassword = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Save VPN password for future connections?'
                });
                
                if (saveVpnPassword === 'Yes') {
                    await this.context.secrets.store(this.getPasswordKey(profile.id), vpnPassword);
                    this._logger.log('VPN password saved.');
                }
            }
            
            // Cannot proceed with auto-reconnect if passwords are not available
            if ((!sudoPassword || !vpnPassword) && isReconnectAttempt) {
                this._logger.log('Auto-reconnect failed: Missing saved passwords');
                return false;
            }
        } else {
            // For SAML, only sudo password is needed for auto-reconnect
            if (!sudoPassword && isReconnectAttempt) {
                this._logger.log('Auto-reconnect failed: Missing sudo password');
                return false;
            }
        }
        
        try {
            this._isConnecting = true;
            this.updateStatusBar();
            
            const hostWithPort = profile.port ? `${profile.host}:${profile.port}` : profile.host;
            
            // Start openfortivpn in background mode
            this._logger.log(`Starting OpenFortiVPN process in background mode...${isReconnectAttempt ? ' (reconnect attempt)' : ''}`);
            
            // Prepare sudo and openfortivpn commands
            const sudoCmd = 'sudo';
            const args = ['-S', 'openfortivpn', hostWithPort, '-u', profile.username];
            
            // Add trusted certificate if available
            if (profile.trustedCert) {
                args.push('--trusted-cert', profile.trustedCert);
                this._logger.log(`Using trusted certificate: ${profile.trustedCert.substring(0, 16)}...`);
            }
            
            // Add SAML login option if enabled
            if (useSaml) {
                args.push('--saml-login');
                this._logger.log('SAML login mode enabled');
            }
            
            // Create child process
            this._currentProcess = cp.spawn(sudoCmd, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Pass passwords to stdin
            if (this._currentProcess.stdin && sudoPassword) {
                this._currentProcess.stdin.write(sudoPassword + '\n');
                // For non-SAML, also send VPN password
                if (!useSaml && vpnPassword) {
                    this._currentProcess.stdin.write(vpnPassword + '\n');
                }
                // Securely wipe passwords from memory
                sudoPassword = '';
                vpnPassword = '';
            }
            
            // Process stdout
            if (this._currentProcess.stdout) {
                this._currentProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    this._logger.log(`VPN output: ${output.trim()}`);
                    
                    // Check for SAML authentication URL and auto-open browser
                    if (useSaml) {
                        // Look for SAML login URL patterns
                        const urlMatch = output.match(/(https?:\/\/[^\s]+)/i);
                        if (urlMatch && urlMatch[1] && (output.includes('authenticate') || output.includes('login') || output.includes('saml') || output.includes('Please'))) {
                            const authUrl = urlMatch[1];
                            this._logger.log(`Opening SAML authentication URL in browser: ${authUrl}`, true);
                            vscode.env.openExternal(vscode.Uri.parse(authUrl));
                        }
                    }
                    
                    // Check for successful connection
                    if (output.includes('Tunnel is up and running')) {
                        this._isConnecting = false;
                        this._isConnected = true;
                        
                        // Save the connected profile for potential auto-reconnect
                        this._lastConnectedProfile = { ...profile };
                        
                        // Reset reconnect state on successful connection
                        this.stopAutoReconnect();
                        
                        this.updateStatusBar();
                        this._logger.log('VPN connection established successfully', !isReconnectAttempt);
                        
                        // Start collecting metrics for this connection
                        this._metricsService.startMetricsCollection(profile);
                        
                        this._onStatusChanged.fire(true);
                    }
                });
            }
            
            // Process stderr
            if (this._currentProcess.stderr) {
                this._currentProcess.stderr.on('data', async (data) => {
                    const output = data.toString();
                    // Ignore password prompts (already sent via stdin)
                    if (!output.includes('password for') && !output.includes('[sudo]')) {
                        this._logger.log(`VPN error: ${output.trim()}`);
                        
                        // Check for certificate validation error
                        if (output.includes('Gateway certificate validation failed') && !this._awaitingCertTrust) {
                            // Extract the certificate hash from the error message
                            const certHashMatch = output.match(/sha256 digest:\s*([a-f0-9]{64})/i);
                            if (certHashMatch && certHashMatch[1]) {
                                this._pendingCertHash = certHashMatch[1];
                                this._awaitingCertTrust = true;
                                this._logger.log(`Certificate hash detected: ${this._pendingCertHash}`);
                                
                                // Prompt user to trust the certificate
                                await this.promptCertificateTrust(profile, isReconnectAttempt);
                            }
                        }
                    }
                });
            }
            
            // Process exit
            this._currentProcess.on('close', (code) => {
                if (code !== 0 && this._isConnecting) {
                    this._isConnecting = false;
                    this.updateStatusBar();
                    this._logger.error(`VPN process exited with code ${code}`, null, !isReconnectAttempt);
                    this._onStatusChanged.fire(false);
                } else if (this._isConnected) {
                    // Connection was established but then lost
                    this._isConnected = false;
                    this.updateStatusBar();
                    this._logger.log('VPN connection closed', !isReconnectAttempt);
                    
                    // Stop metrics collection
                    this._metricsService.stopMetricsCollection();
                    
                    this._onStatusChanged.fire(false);
                    
                    // Start auto-reconnect if this was an unexpected disconnect
                    if (!this._lastDisconnectWasManual) {
                        this.startAutoReconnect();
                    }
                }
                this._currentProcess = null;
            });
            
            // Process error
            this._currentProcess.on('error', (error) => {
                this._isConnecting = false;
                this.updateStatusBar();
                this._logger.error('Failed to start VPN process', error, !isReconnectAttempt);
                this._onStatusChanged.fire(false);
                this._currentProcess = null;
            });
            
            if (!isReconnectAttempt) {
                this._logger.log(`Connecting to VPN using profile "${profile.name}"...`, true);
            }
            
            // Check status after 5 seconds
            setTimeout(() => this.checkVPNStatus(), 5000);
            
            return true;
        } catch (error) {
            this._isConnecting = false;
            this.updateStatusBar();
            this._logger.error(`VPN connection failed`, error, !isReconnectAttempt);
            return false;
        }
    }
    
    /**
     * Disconnect from VPN
     * @param isManualDisconnect Whether this is a manual disconnect requested by the user
     */
    public async disconnect(isManualDisconnect: boolean = true): Promise<boolean> {
        if (!this._isConnected && !this._isConnecting) {
            this._logger.log('VPN is not connected.', isManualDisconnect);
            return false;
        }
        
        // Set flag for manual disconnect to prevent auto-reconnect
        if (isManualDisconnect) {
            this._lastDisconnectWasManual = true;
            this.stopAutoReconnect();
        }
        
        this._logger.log(`${isManualDisconnect ? 'Manually disconnecting' : 'Disconnecting'} VPN...`);
        
        try {
            // Get active profile
            const activeProfile = await vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile');
            
            let password;
            if (activeProfile) {
                // Try to get saved password for active profile
                password = await this.context.secrets.get(this.getPasswordKey(activeProfile.id));
            }
            
            // If no saved password or no active profile, ask for it (only for manual disconnects)
            if (!password && isManualDisconnect) {
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
            
            // For auto-disconnect with no saved password, we can't proceed
            if (!password && !isManualDisconnect) {
                this._logger.error('Cannot auto-disconnect: No saved password');
                return false;
            }
            
            // Execute disconnect command in background
            const sudoCmd = 'sudo';
            const args = ['-S', 'pkill', '-SIGTERM', 'openfortivpn'];
            
            const process = cp.spawn(sudoCmd, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Pass password to stdin
            if (process.stdin && password) {
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
            
            this._logger.log('OpenFortiVPN has been disconnected.', isManualDisconnect);
            
            // Notify status change
            this._onStatusChanged.fire(false);
            
            return true;
        } catch (error) {
            this._logger.error(`Failed to disconnect VPN`, error, isManualDisconnect);
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
                    
                    // Start auto-reconnect process if applicable
                    if (!this._lastDisconnectWasManual) {
                        this.startAutoReconnect();
                    }
                }
            } else {
                // If ppp0 interface exists, VPN is connected
                this._isConnecting = false;
                
                if (!this._isConnected) {
                    this._isConnected = true;
                    this.updateStatusBar();
                    this._logger.log('OpenFortiVPN connection has been established.', true);
                    
                    const activeMetrics = this._metricsService.getActiveMetrics();
                    if (!activeMetrics || !activeMetrics.isActive) {
                        // Get active profile to start metrics collection
                        vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile')
                            .then(profile => {
                                if (profile) {
                                    this._logger.log('Starting metrics collection from VPN status check');
                                    this._metricsService.startMetricsCollection(profile);
                                    
                                    // Save the connected profile for potential auto-reconnect
                                    this._lastConnectedProfile = { ...profile };
                                }
                            }, err => {
                                this._logger.error('Error getting active profile for metrics', err);
                            });
                    }
                    
                    // Reset reconnect state
                    this.stopAutoReconnect();
                    
                    // Notify status change
                    this._onStatusChanged.fire(true);
                }
            }
            
            // Update status bar if needed
            if (wasConnected !== this._isConnected || this._isConnecting || 
                this._reconnectState === ReconnectState.Attempting) {
                this.updateStatusBar();
            }
        });
    }
    
    /**
     * Manually retry connection after max retries reached
     */
    public async retryConnection(): Promise<boolean> {
        if (this._reconnectState !== ReconnectState.MaxRetriesReached || !this._lastConnectedProfile) {
            return false;
        }
        
        this._logger.log('Manually retrying connection after max retries reached');
        this.resetAutoReconnectState();
        return this.connect(this._lastConnectedProfile);
    }
    
    /**
     * Cancel auto-reconnect process
     */
    public cancelAutoReconnect(): void {
        if (this._reconnectState !== ReconnectState.Attempting && 
            this._reconnectState !== ReconnectState.MaxRetriesReached) {
            return;
        }
        
        this._logger.log('Auto-reconnect process canceled by user', true);
        this._lastDisconnectWasManual = true;
        this.stopAutoReconnect();
        this.updateStatusBar();
    }
    
    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopAutoReconnect();
        
        if (this._configChangeListener) {
            this._configChangeListener.dispose();
            this._configChangeListener = null;
        }
        
        // Attempt to disconnect if connected
        if (this._isConnected || this._isConnecting) {
            this.disconnect(false).catch(err => {
                this._logger.error('Error disconnecting during dispose', err);
            });
        }
    }
}