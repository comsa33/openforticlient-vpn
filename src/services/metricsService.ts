import * as vscode from 'vscode';
import * as cp from 'child_process';
import { 
    VpnConnectionMetrics, 
    VpnConnectionSession, 
    MetricsDataPoint,
    VpnMetricsStorage, 
    DEFAULT_METRICS,
    generateConnectionId,
    formatBytes,
    formatSpeed,
    formatDuration
} from '../models/metrics';
import { VpnProfile } from '../models/profile';
import { LogService } from './logService';

/**
 * Storage key for metrics data
 */
const METRICS_STORAGE_KEY = 'openfortivpn-metrics';

/**
 * Max number of historical sessions to keep
 */
const MAX_HISTORICAL_SESSIONS = 50;

/**
 * Max number of data points per session
 */
const MAX_DATA_POINTS_PER_SESSION = 600; // 10 minutes of 1-second interval data points

/**
 * Service for collecting and managing VPN connection metrics
 */
export class MetricsService {
    private static _instance: MetricsService;
    private _context: vscode.ExtensionContext;
    private _metrics: VpnMetricsStorage;
    private _metricsInterval: NodeJS.Timeout | null = null;
    private _previousBytesUp: number = 0;
    private _previousBytesDown: number = 0;
    private _lastUpdateTime: number = 0;
    private _onMetricsChanged: vscode.EventEmitter<VpnConnectionMetrics | null> = new vscode.EventEmitter<VpnConnectionMetrics | null>();
    private _logger: LogService;
    private _profileManager: any = null; // Will store ProfileManager instance
    
    /**
     * Event that fires when metrics are updated
     */
    public readonly onMetricsChanged: vscode.Event<VpnConnectionMetrics | null> = this._onMetricsChanged.event;
    
    private constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._metrics = this._loadMetrics();
        this._logger = LogService.getInstance();
        this._logger.log('Metrics Service initialized');
    }
    
    /**
     * Get the metrics service instance (Singleton pattern)
     */
    public static getInstance(context?: vscode.ExtensionContext): MetricsService {
        if (!MetricsService._instance && context) {
            MetricsService._instance = new MetricsService(context);
        } else if (!MetricsService._instance && !context) {
            throw new Error('MetricsService needs to be initialized with a context first');
        }
        
        return MetricsService._instance;
    }
    
    /**
     * Set the ProfileManager instance
     */
    public setProfileManager(profileManager: any): void {
        this._profileManager = profileManager;
    }
    
    /**
     * Load metrics from storage
     */
    private _loadMetrics(): VpnMetricsStorage {
        const data = this._context.globalState.get<VpnMetricsStorage>(METRICS_STORAGE_KEY);
        return data || { ...DEFAULT_METRICS };
    }
    
    /**
     * Save metrics to storage
     */
    private async _saveMetrics(): Promise<void> {
        await this._context.globalState.update(METRICS_STORAGE_KEY, this._metrics);
    }
    
    /**
     * Get current active connection metrics
     */
    public getActiveMetrics(): VpnConnectionMetrics | null {
        return this._metrics.activeConnection;
    }
    
    /**
     * Get historical connection sessions
     */
    public getHistoricalSessions(): VpnConnectionSession[] {
        return [...this._metrics.historicalSessions];
    }
    
    /**
     * Start collecting metrics for a VPN connection
     */
    public startMetricsCollection(profile: VpnProfile): void {
        // Clear any existing collection interval
        this.stopMetricsCollection();
        
        // Create a new connection metrics object
        const startTime = Date.now();
        const connectionId = generateConnectionId();
        
        this._metrics.activeConnection = {
            connectionId,
            profileId: profile.id,
            startTime,
            endTime: null,
            duration: 0,
            uploadSpeed: 0,
            downloadSpeed: 0,
            totalUpload: 0,
            totalDownload: 0,
            isActive: true
        };
        
        this._previousBytesUp = 0;
        this._previousBytesDown = 0;
        this._lastUpdateTime = startTime;
        
        this._logger.log(`Started metrics collection for VPN connection: ${connectionId}`);
        
        // Start the metrics collection interval
        this._metricsInterval = setInterval(() => this._collectMetrics(), 1000);
        
        // Emit the metrics changed event
        this._onMetricsChanged.fire(this._metrics.activeConnection);
    }
    
    /**
     * Stop collecting metrics and save the session
     */
    public async stopMetricsCollection(): Promise<void> {
        // Clear the metrics collection interval
        if (this._metricsInterval) {
            clearInterval(this._metricsInterval);
            this._metricsInterval = null;
        }
        
        // If there's an active connection, finalize its metrics and save it
        if (this._metrics.activeConnection) {
            const endTime = Date.now();
            const activeConnection = this._metrics.activeConnection;
            
            // Update the active connection metrics
            activeConnection.endTime = endTime;
            activeConnection.duration = (endTime - activeConnection.startTime) / 1000;
            activeConnection.isActive = false;
            
            // Get the profile name and host
            const profileName = await this._getProfileName(activeConnection.profileId);
            const host = await this._getProfileHost(activeConnection.profileId);
            
            // Create a historical session
            const session: VpnConnectionSession = {
                id: activeConnection.connectionId,
                profileId: activeConnection.profileId,
                profileName: profileName || 'Unknown Profile',
                host: host || 'Unknown Host',
                startTime: activeConnection.startTime,
                endTime: activeConnection.endTime,
                duration: activeConnection.duration,
                totalUpload: activeConnection.totalUpload,
                totalDownload: activeConnection.totalDownload,
                dataPoints: [] // This will be populated from the dataPoints cache
            };
            
            // Add to historical sessions (maintaining the maximum limit)
            this._metrics.historicalSessions.unshift(session);
            
            // Keep only the most recent sessions
            if (this._metrics.historicalSessions.length > MAX_HISTORICAL_SESSIONS) {
                this._metrics.historicalSessions = this._metrics.historicalSessions.slice(0, MAX_HISTORICAL_SESSIONS);
            }
            
            // Clear the active connection
            this._metrics.activeConnection = null;
            
            // Save to storage
            await this._saveMetrics();
            
            this._logger.log(`Stopped metrics collection for VPN connection: ${session.id}`);
        }
        
        // Emit the metrics changed event with null to indicate no active connection
        this._onMetricsChanged.fire(null);
    }

    /**
     * Get profile name from profile ID
     */
    private async _getProfileName(profileId: string): Promise<string | undefined> {
        try {
            // First try using command
            if (!this._profileManager) {
                // Try using command
                try {
                    const profiles = await vscode.commands.executeCommand('openfortivpn-connector.getProfiles') as { profiles: VpnProfile[] };
                    if (profiles && 'profiles' in profiles) {
                        const profile = profiles.profiles.find((p: VpnProfile) => p.id === profileId);
                        return profile ? profile.name : undefined;
                    }
                } catch (cmdError) {
                    this._logger.log(`Using command failed, falling back to active profile: ${cmdError}`);
                    // Command failed, continue to active profile check
                }
                
                // Fallback to getting active profile
                const activeProfile = await vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile');
                if (activeProfile && activeProfile.id === profileId) {
                    return activeProfile.name;
                }
                return 'Unknown Profile';
            } else {
                // If profile manager is available, use it directly
                const allProfiles = this._profileManager.getProfiles();
                const profile = allProfiles.profiles.find((p: VpnProfile) => p.id === profileId);
                return profile ? profile.name : 'Unknown Profile';
            }
        } catch (error) {
            this._logger.error('Error getting profile name', error);
            return 'Unknown Profile';
        }
    }

    /**
     * Get profile host from profile ID
     */
    private async _getProfileHost(profileId: string): Promise<string | undefined> {
        try {
            // First try using command
            if (!this._profileManager) {
                // Try using command
                try {
                    const profiles = await vscode.commands.executeCommand('openfortivpn-connector.getProfiles') as { profiles: VpnProfile[] };
                    if (profiles && 'profiles' in profiles) {
                        const profile = profiles.profiles.find((p: VpnProfile) => p.id === profileId);
                        return profile ? profile.host : undefined;
                    }
                } catch (cmdError) {
                    this._logger.log(`Using command failed, falling back to active profile: ${cmdError}`);
                    // Command failed, continue to active profile check
                }
                
                // Fallback to getting active profile
                const activeProfile = await vscode.commands.executeCommand<VpnProfile>('openfortivpn-connector.getActiveProfile');
                if (activeProfile && activeProfile.id === profileId) {
                    return activeProfile.host;
                }
                return 'Unknown Host';
            } else {
                // If profile manager is available, use it directly
                const allProfiles = this._profileManager.getProfiles();
                const profile = allProfiles.profiles.find((p: VpnProfile) => p.id === profileId);
                return profile ? profile.host : 'Unknown Host';
            }
        } catch (error) {
            this._logger.error('Error getting profile host', error);
            return 'Unknown Host';
        }
    }
    
    /**
     * Collect metrics from the VPN interface
     */
    private _collectMetrics(): void {
        if (!this._metrics.activeConnection) {
            return;
        }
        
        // Command to get network statistics - works on Linux and macOS
        const command = 'cat /proc/net/dev 2>/dev/null || netstat -ib 2>/dev/null';
        
        cp.exec(command, (error, stdout) => {
            if (error) {
                this._logger.error('Error collecting network metrics', error);
                return;
            }
            
            try {
                // Parse the output to find the VPN interface (ppp0)
                const lines = stdout.split('\n');
                const pppLine = lines.find(line => 
                    line.includes('ppp0') || 
                    line.match(/\bppp0\b/) || 
                    line.includes('tun0') || 
                    line.match(/\btun0\b/)
                );
                
                if (!pppLine) {
                    // No VPN interface found, might be disconnected
                    return;
                }
                
                // Extract bytes information
                let bytesDown = 0;
                let bytesUp = 0;
                
                if (pppLine.includes('ppp0')) {
                    // Linux format: 
                    // ppp0: 1234 56 78 9 10 11 12 13    1234 56 78 9 10 11 12 13
                    const parts = pppLine.trim().split(/\s+/);
                    bytesDown = parseInt(parts[1], 10) || 0;
                    bytesUp = parseInt(parts[9], 10) || 0;
                } else {
                    // macOS format (more complex, needs more parsing)
                    const parts = pppLine.trim().split(/\s+/);
                    // Find the index containing "Ibytes" and "Obytes"
                    const headerLine = lines[0] || '';
                    const headers = headerLine.trim().split(/\s+/);
                    const ibytesIndex = headers.findIndex(h => h.includes('Ibytes'));
                    const obytesIndex = headers.findIndex(h => h.includes('Obytes'));
                    
                    if (ibytesIndex !== -1 && obytesIndex !== -1) {
                        bytesDown = parseInt(parts[ibytesIndex], 10) || 0;
                        bytesUp = parseInt(parts[obytesIndex], 10) || 0;
                    }
                }
                
                // Skip first reading where we don't have previous values
                if (this._previousBytesUp === 0 && this._previousBytesDown === 0) {
                    this._previousBytesUp = bytesUp;
                    this._previousBytesDown = bytesDown;
                    this._lastUpdateTime = Date.now();
                    return;
                }
                
                // Calculate the time difference in seconds
                const currentTime = Date.now();
                const timeDiff = (currentTime - this._lastUpdateTime) / 1000;
                
                if (timeDiff <= 0) {
                    return; // Avoid division by zero
                }
                
                // Calculate upload and download speeds
                const uploadDiff = Math.max(0, bytesUp - this._previousBytesUp);
                const downloadDiff = Math.max(0, bytesDown - this._previousBytesDown);

                const uploadSpeed = uploadDiff / timeDiff;
                const downloadSpeed = downloadDiff / timeDiff;

                // Update the active connection metrics
                const activeConnection = this._metrics.activeConnection;
                if (!activeConnection) {
                    return; // Skip if no active connection
                }

                activeConnection.uploadSpeed = uploadSpeed;
                activeConnection.downloadSpeed = downloadSpeed;
                activeConnection.totalUpload += uploadDiff;
                activeConnection.totalDownload += downloadDiff;
                activeConnection.duration = (currentTime - activeConnection.startTime) / 1000;

                // Create a data point
                const dataPoint: MetricsDataPoint = {
                    timestamp: currentTime,
                    uploadSpeed,
                    downloadSpeed
                };

                // Find the corresponding session
                const sessionIndex = this._metrics.historicalSessions.findIndex(
                    s => s.id === activeConnection.connectionId
                );

                if (sessionIndex !== -1) {
                    // Add the data point to the session, maintaining the maximum limit
                    const session = this._metrics.historicalSessions[sessionIndex];
                    session.dataPoints.push(dataPoint);
                    
                    if (session.dataPoints.length > MAX_DATA_POINTS_PER_SESSION) {
                        session.dataPoints = session.dataPoints.slice(-MAX_DATA_POINTS_PER_SESSION);
                    }
                    
                    // Update session totals
                    session.totalUpload = activeConnection.totalUpload;
                    session.totalDownload = activeConnection.totalDownload;
                    session.duration = activeConnection.duration;
                    session.endTime = currentTime;
                } else {
                    // Create a new session if it doesn't exist
                    const profileName = 'Unknown Profile'; // We'll update this later
                    const host = 'Unknown Host'; // We'll update this later
                    
                    const newSession: VpnConnectionSession = {
                        id: activeConnection.connectionId,
                        profileId: activeConnection.profileId,
                        profileName,
                        host,
                        startTime: activeConnection.startTime,
                        endTime: currentTime,
                        duration: activeConnection.duration,
                        totalUpload: activeConnection.totalUpload,
                        totalDownload: activeConnection.totalDownload,
                        dataPoints: [dataPoint]
                    };
                    
                    this._metrics.historicalSessions.unshift(newSession);
                    
                    // Keep only the most recent sessions
                    if (this._metrics.historicalSessions.length > MAX_HISTORICAL_SESSIONS) {
                        this._metrics.historicalSessions = this._metrics.historicalSessions.slice(0, MAX_HISTORICAL_SESSIONS);
                    }
                    
                    // Update profile name and host asynchronously
                    this._getProfileName(activeConnection.profileId).then(name => {
                        if (name && this._metrics.historicalSessions.length > 0) {
                            this._metrics.historicalSessions[0].profileName = name;
                        }
                    });
                    
                    this._getProfileHost(activeConnection.profileId).then(host => {
                        if (host && this._metrics.historicalSessions.length > 0) {
                            this._metrics.historicalSessions[0].host = host;
                        }
                    });
                }

                // Save the metrics periodically (every 10 seconds)
                if (Math.floor(activeConnection.duration) % 10 === 0) {
                    this._saveMetrics().catch(err => 
                        this._logger.error('Error saving metrics', err)
                    );
                }
                
                // Update the previous values
                this._previousBytesUp = bytesUp;
                this._previousBytesDown = bytesDown;
                this._lastUpdateTime = currentTime;
                
                // Emit the metrics changed event
                this._onMetricsChanged.fire(activeConnection);
            } catch (err) {
                this._logger.error('Error parsing network metrics', err);
            }
        });
    }
    
    /**
     * Clear all metrics data
     */
    public async clearAllMetrics(): Promise<void> {
        this._metrics = { ...DEFAULT_METRICS };
        await this._saveMetrics();
        this._logger.log('All metrics data has been cleared');
    }
    
    /**
     * Get formatted metrics for display
     */
    public getFormattedMetrics(): {
        uploadSpeed: string;
        downloadSpeed: string;
        totalUpload: string;
        totalDownload: string;
        duration: string;
        isActive: boolean;
    } | null {
        const metrics = this._metrics.activeConnection;
        
        if (!metrics) {
            return null;
        }
        
        return {
            uploadSpeed: formatSpeed(metrics.uploadSpeed),
            downloadSpeed: formatSpeed(metrics.downloadSpeed),
            totalUpload: formatBytes(metrics.totalUpload),
            totalDownload: formatBytes(metrics.totalDownload),
            duration: formatDuration(metrics.duration),
            isActive: metrics.isActive
        };
    }
    
    /**
     * Dispose the metrics service
     */
    public dispose(): void {
        this.stopMetricsCollection();
    }
}