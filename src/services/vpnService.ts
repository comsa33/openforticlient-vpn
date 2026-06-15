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
            // Use isReconnectAttempt=false to allow fetching saved passwords
            this._logger.log('Reconnecting with trusted certificate...', true);
            await this.connect(updatedProfile, false);
            
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
     * Extract the SAML authentication URL from a single line of openfortivpn
     * output. Returns null when the line does not contain an auth URL.
     *
     * openfortivpn prints the URL wrapped in quotes, e.g.
     *   Authenticate at 'https://gw.example.com/remote/saml/start?redirect=1'
     * The previous implementation matched everything up to the next whitespace,
     * which captured the trailing quote (".../redirect=1'"). That broke the
     * `redirect` query parameter, so the gateway ignored it and served its web
     * portal page ("tunnel mode use only / FortiClient required") instead of
     * starting the SAML flow (issue #7).
     *
     * @param text Output to scan (a single line, or the residual buffer).
     * @param requireTerminator When true, only a quote-terminated URL is
     *   accepted. The closing quote proves the URL was received in full, which
     *   lets us safely parse an un-terminated residual buffer without risking a
     *   truncated URL.
     */
    private extractSamlAuthUrl(text: string, requireTerminator: boolean): string | null {
        // Only consider output that looks like an auth prompt to avoid opening
        // unrelated URLs that may appear in logs.
        if (!/authenticate|saml|\/remote\/|please|login/i.test(text)) {
            return null;
        }

        // Preferred form: openfortivpn wraps the URL in quotes. The closing
        // quote guarantees the URL is complete even without a trailing newline.
        const quoted = text.match(/['"]\s*(https?:\/\/[^'"\s]+)\s*['"]/i);
        if (quoted && quoted[1]) {
            return quoted[1];
        }

        // Without a closing quote we cannot tell a complete URL from one that is
        // still streaming in, so a partial buffer must wait for more data.
        if (requireTerminator) {
            return null;
        }

        const match = text.match(/https?:\/\/[^\s]+/i);
        if (!match) {
            return null;
        }

        let url = match[0];
        // Strip wrapping/trailing punctuation that openfortivpn (or a log
        // formatter) may place around the URL: quotes, brackets, angle
        // brackets, and sentence punctuation.
        url = url.replace(/^['"<(\[]+/, '');
        url = url.replace(/['"'`.,;>)\]]+$/, '');

        return url.length > 0 ? url : null;
    }

    /**
     * Open the SAML authentication URL in the browser and guide the user. The
     * URL is opened in the system default browser; when the user already has an
     * identity-provider session there (e.g. Microsoft), the gateway flow can
     * fail, so we also surface the URL with copy/incognito guidance (issue #7).
     */
    private async handleSamlAuthentication(authUrl: string): Promise<void> {
        this._logger.log(`Opening SAML authentication URL in browser: ${authUrl}`, true);

        let opened = false;
        try {
            opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        } catch (err) {
            this._logger.error('Failed to open SAML authentication URL automatically', err, false);
        }

        const copyAction = 'Copy URL';
        const openAction = 'Open Again';
        // Always surface the URL so the user can fall back to copying it,
        // especially when the automatic open failed or an existing identity
        // provider session in the default browser breaks the flow.
        const message = opened
            ? 'SAML sign-in opened in your browser. If authentication fails because ' +
              'you are already signed in (e.g. Microsoft), copy the URL and open it ' +
              'in a private/incognito window instead.'
            : 'Could not open SAML sign-in automatically. Copy the URL and open it ' +
              'in your browser manually.';
        const choice = await vscode.window.showInformationMessage(message, copyAction, openAction);

        if (choice === copyAction) {
            await vscode.env.clipboard.writeText(authUrl);
            vscode.window.showInformationMessage('SAML authentication URL copied to clipboard.');
        } else if (choice === openAction) {
            try {
                await vscode.env.openExternal(vscode.Uri.parse(authUrl));
            } catch (err) {
                this._logger.error('Failed to open SAML authentication URL', err);
            }
        }
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
            
            // Track if we've sent the VPN password
            let vpnPasswordSent = false;

            // SAML auth state: ensure the browser is opened exactly once with a
            // complete URL. stdout arrives in arbitrary chunks, so we buffer it
            // and only parse fully terminated lines to avoid acting on a
            // truncated URL.
            let samlAuthOpened = false;
            let samlStdoutBuffer = '';
            
            // Pass sudo password to stdin immediately (sudo -S reads from stdin right away)
            if (this._currentProcess.stdin && sudoPassword) {
                this._currentProcess.stdin.write(sudoPassword + '\n');
                // Securely wipe sudo password from memory
                sudoPassword = '';
            }
            
            // Process stdout
            if (this._currentProcess.stdout) {
                this._currentProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    this._logger.log(`VPN output: ${output.trim()}`);
                    
                    // Check for VPN password prompt and send password
                    if (!vpnPasswordSent && !useSaml && vpnPassword && 
                        (output.toLowerCase().includes('password:') || output.toLowerCase().includes('vpn account'))) {
                        if (this._currentProcess?.stdin) {
                            this._currentProcess.stdin.write(vpnPassword + '\n');
                            vpnPasswordSent = true;
                            // Securely wipe VPN password from memory
                            vpnPassword = '';
                            this._logger.log('VPN password sent');
                        }
                    }
                    
                    // Check for certificate validation error in stdout
                    if (output.includes('Gateway certificate validation failed') && !this._awaitingCertTrust) {
                        // Try multiple patterns to extract the hash
                        let certHash: string | null = null;
                        
                        // Pattern 1: --trusted-cert followed by hash
                        const trustedCertMatch = output.match(/--trusted-cert\s+([a-f0-9]{64})/i);
                        if (trustedCertMatch && trustedCertMatch[1]) {
                            certHash = trustedCertMatch[1];
                        }
                        
                        // Pattern 2: sha256 digest on same line
                        if (!certHash) {
                            const digestMatch = output.match(/sha256 digest:\s*([a-f0-9]{64})/i);
                            if (digestMatch && digestMatch[1]) {
                                certHash = digestMatch[1];
                            }
                        }
                        
                        // Pattern 3: standalone 64-char hex string (last resort)
                        if (!certHash) {
                            const hexMatch = output.match(/\b([a-f0-9]{64})\b/i);
                            if (hexMatch && hexMatch[1]) {
                                certHash = hexMatch[1];
                            }
                        }
                        
                        if (certHash) {
                            this._pendingCertHash = certHash;
                            this._awaitingCertTrust = true;
                            this._logger.log(`Certificate hash detected: ${this._pendingCertHash}`);
                            this.promptCertificateTrust(profile, isReconnectAttempt);
                        }
                    }
                    
                    // Check for SAML authentication URL and open the browser.
                    // openfortivpn prints the URL wrapped in quotes (e.g.
                    // Authenticate at 'https://.../remote/saml/start?redirect=1').
                    // We must extract it exactly: keeping a trailing quote breaks
                    // the `redirect` parameter and the gateway falls back to its
                    // web portal page instead of starting the SAML flow.
                    if (useSaml && !samlAuthOpened) {
                        samlStdoutBuffer += output;

                        const openSamlAuth = (authUrl: string) => {
                            samlAuthOpened = true;
                            this.handleSamlAuthentication(authUrl).catch(err =>
                                this._logger.error('SAML authentication handling failed', err));
                        };

                        // Primary path: parse fully terminated lines so we never
                        // act on a URL that was split across stdout chunks.
                        let newlineIndex: number;
                        while (!samlAuthOpened && (newlineIndex = samlStdoutBuffer.indexOf('\n')) >= 0) {
                            const line = samlStdoutBuffer.slice(0, newlineIndex);
                            samlStdoutBuffer = samlStdoutBuffer.slice(newlineIndex + 1);

                            const authUrl = this.extractSamlAuthUrl(line, false);
                            if (authUrl) {
                                openSamlAuth(authUrl);
                            }
                        }

                        // Fallback: openfortivpn may print the prompt and then
                        // block on the SAML callback without a trailing newline.
                        // A quote-terminated URL in the residual buffer is known
                        // to be complete, so open it without waiting for '\n'.
                        if (!samlAuthOpened) {
                            const authUrl = this.extractSamlAuthUrl(samlStdoutBuffer, true);
                            if (authUrl) {
                                openSamlAuth(authUrl);
                            }
                        }

                        // Guard against unbounded growth if no newline ever comes.
                        if (samlStdoutBuffer.length > 8192) {
                            samlStdoutBuffer = samlStdoutBuffer.slice(-4096);
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
            // Get saved sudo password (disconnect requires sudo, not VPN password)
            let password = await this.context.secrets.get(SUDO_PASSWORD_KEY);
            
            // If no saved sudo password, ask for it (only for manual disconnects)
            if (!password && isManualDisconnect) {
                this._logger.log('No saved sudo password found for disconnection, prompting...');
                password = await vscode.window.showInputBox({
                    prompt: 'Enter your Mac/Linux system password (for sudo)',
                    password: true,
                    placeHolder: 'System password'
                });
                
                if (!password) {
                    this._logger.log('Password entry canceled by user');
                    return false; // User canceled
                }
                
                // Save sudo password for future use
                const saveSudoPassword = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Save system password for future use?'
                });
                
                if (saveSudoPassword === 'Yes') {
                    await this.context.secrets.store(SUDO_PASSWORD_KEY, password);
                    this._logger.log('System password saved.');
                }
            }
            
            // For auto-disconnect with no saved password, we can't proceed
            if (!password && !isManualDisconnect) {
                this._logger.error('Cannot auto-disconnect: No saved sudo password');
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
                
                // Skip auto-detection of connection if user manually disconnected
                // (ppp0 interface might still exist briefly after disconnect command)
                if (this._lastDisconnectWasManual) {
                    return; // Don't treat as connected if user just disconnected
                }
                
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