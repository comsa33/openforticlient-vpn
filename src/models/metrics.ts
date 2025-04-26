/**
 * VPN Connection Metrics interface for storing real-time connection data
 */
export interface VpnConnectionMetrics {
    connectionId: string;
    profileId: string;
    startTime: number;
    endTime: number | null;
    duration: number;
    uploadSpeed: number;
    downloadSpeed: number;
    totalUpload: number;
    totalDownload: number;
    isActive: boolean;
}

/**
 * VPN Connection Historical Data point for graphs
 */
export interface MetricsDataPoint {
    timestamp: number;
    uploadSpeed: number;
    downloadSpeed: number;
}

/**
 * VPN Connection Session for storing complete session details
 */
export interface VpnConnectionSession {
    id: string;
    profileId: string;
    profileName: string;
    host: string;
    startTime: number;
    endTime: number;
    duration: number;
    totalUpload: number;
    totalDownload: number;
    dataPoints: MetricsDataPoint[];
}

/**
 * VPN Connection Metrics Storage
 */
export interface VpnMetricsStorage {
    activeConnection: VpnConnectionMetrics | null;
    historicalSessions: VpnConnectionSession[];
}

/**
 * Default empty metrics storage
 */
export const DEFAULT_METRICS: VpnMetricsStorage = {
    activeConnection: null,
    historicalSessions: []
};

/**
 * Generate a unique connection ID
 */
export function generateConnectionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) {
        return '0 Bytes';
    }
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format speed to human-readable string
 */
export function formatSpeed(bytesPerSecond: number, decimals: number = 2): string {
    if (bytesPerSecond === 0) {
        return '0 B/s';
    }
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format duration to human-readable string (HH:MM:SS)
 */
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
}