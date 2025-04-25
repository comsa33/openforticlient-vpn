import * as vscode from 'vscode';
import { MetricsService } from '../services/metricsService';
import { VpnConnectionSession, formatBytes, formatSpeed, formatDuration } from '../models/metrics';

/**
 * WebviewViewProvider for VPN metrics
 */
export class MetricsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'openfortivpnMetrics';
    private _view?: vscode.WebviewView;
    private _metricsService: MetricsService;
    private _updateInterval: NodeJS.Timeout | null = null;
    
    constructor(private readonly _extensionUri: vscode.Uri) {
        this._metricsService = MetricsService.getInstance();
    }
    
    /**
     * Resolves the webview view
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        
        // Set up event listener for messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'clearMetrics':
                        this._metricsService.clearAllMetrics();
                        break;
                    case 'viewHistorical':
                        this._showHistoricalSession(message.sessionId);
                        break;
                }
            },
            undefined
        );
        
        // Start update interval
        this._startUpdateInterval();
        
        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateView();
                this._startUpdateInterval();
            } else {
                this._stopUpdateInterval();
            }
        });
        
        // Handle disposal
        webviewView.onDidDispose(() => {
            this._stopUpdateInterval();
        });
        
        // Update when metrics change
        this._metricsService.onMetricsChanged(() => {
            this._updateView();
        });
    }
    
    /**
     * Start the update interval
     */
    private _startUpdateInterval(): void {
        if (!this._updateInterval) {
            this._updateInterval = setInterval(() => {
                this._updateView();
            }, 1000);
        }
    }
    
    /**
     * Stop the update interval
     */
    private _stopUpdateInterval(): void {
        if (this._updateInterval) {
            clearInterval(this._updateInterval);
            this._updateInterval = null;
        }
    }
    
    /**
     * Update the view with current metrics
     */
    private _updateView(): void {
        if (this._view) {
            const currentMetrics = this._metricsService.getFormattedMetrics();
            const historicalSessions = this._metricsService.getHistoricalSessions();
            
            this._view.webview.postMessage({
                command: 'updateMetrics',
                metrics: currentMetrics,
                historicalSessions: historicalSessions.map(session => ({
                    id: session.id,
                    profileName: session.profileName,
                    host: session.host,
                    startTime: new Date(session.startTime).toLocaleString(),
                    duration: formatDuration(session.duration),
                    totalUpload: formatBytes(session.totalUpload),
                    totalDownload: formatBytes(session.totalDownload)
                }))
            });
        }
    }
    
    /**
     * Show a historical session detail in a new webview panel
     */
    private _showHistoricalSession(sessionId: string): void {
        const historicalSessions = this._metricsService.getHistoricalSessions();
        const session = historicalSessions.find(s => s.id === sessionId);
        
        if (!session) {
            vscode.window.showErrorMessage('Session not found');
            return;
        }
        
        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'openfortivpnSessionDetail',
            `VPN Session: ${session.profileName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [this._extensionUri]
            }
        );
        
        panel.webview.html = this._getHtmlForSessionDetail(panel.webview, session);
    }
    
    /**
     * Get the HTML for the WebView
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get fonts CSS and Chart.js from CDN
        const fontsCss = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css';
        const chartJsUri = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VPN Metrics</title>
            <link href="${fontsCss}" rel="stylesheet">
            <script src="${chartJsUri}"></script>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    padding: 15px;
                }
                .card {
                    background-color: var(--vscode-editorWidget-background);
                    border-radius: 6px;
                    margin-bottom: 20px;
                    padding: 15px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }
                .card-title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-editor-foreground);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .metrics-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-gap: 15px;
                    margin-bottom: 15px;
                }
                .metric-item {
                    text-align: center;
                    padding: 10px;
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }
                .metric-value {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: var(--vscode-textLink-foreground);
                }
                .metric-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .chart-container {
                    position: relative;
                    height: 200px;
                    width: 100%;
                    margin-top: 20px;
                }
                .no-metrics {
                    text-align: center;
                    padding: 40px 0;
                    color: var(--vscode-descriptionForeground);
                }
                .history-item {
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .history-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .history-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .history-detail {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    padding: 6px 12px;
                    cursor: pointer;
                    font-size: 12px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .status-badge {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                }
                .status-active {
                    background-color: var(--vscode-testing-iconPassed);
                    color: var(--vscode-editor-background);
                }
                .status-inactive {
                    background-color: var(--vscode-descriptionForeground);
                    color: var(--vscode-editor-background);
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: var(--vscode-descriptionForeground);
                }
                .icon {
                    margin-right: 5px;
                }
                .upload {
                    color: var(--vscode-charts-blue);
                }
                .download {
                    color: var(--vscode-charts-green);
                }
                .tabs {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 15px;
                }
                .tab {
                    padding: 8px 15px;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                }
                .tab.active {
                    border-bottom-color: var(--vscode-textLink-foreground);
                    font-weight: bold;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="tabs">
                    <div class="tab active" data-tab="current">Current Connection</div>
                    <div class="tab" data-tab="history">Connection History</div>
                </div>
                
                <div class="tab-content active" id="current-tab">
                    <div id="loading" class="loading">
                        Loading metrics...
                    </div>
                    
                    <div id="no-metrics" class="no-metrics" style="display:none;">
                        <p>No active VPN connection.</p>
                        <p>Connect to a VPN to see real-time metrics.</p>
                    </div>
                    
                    <div id="metrics-container" style="display:none;">
                        <div class="card">
                            <div class="card-title">
                                Connection Status
                                <span id="connection-status" class="status-badge status-active">Active</span>
                            </div>
                            <div class="metrics-grid">
                                <div class="metric-item">
                                    <div class="metric-value" id="duration">00:00:00</div>
                                    <div class="metric-label"><i class="fas fa-clock icon"></i>Connection Time</div>
                                </div>
                                <div class="metric-item">
                                    <div class="metric-value" id="total-data">0 B</div>
                                    <div class="metric-label"><i class="fas fa-exchange-alt icon"></i>Total Data</div>
                                </div>
                            </div>
                            
                            <div class="metrics-grid">
                                <div class="metric-item">
                                    <div class="metric-value upload" id="upload-speed">0 B/s</div>
                                    <div class="metric-label"><i class="fas fa-upload icon upload"></i>Upload Speed</div>
                                </div>
                                <div class="metric-item">
                                    <div class="metric-value download" id="download-speed">0 B/s</div>
                                    <div class="metric-label"><i class="fas fa-download icon download"></i>Download Speed</div>
                                </div>
                            </div>
                            
                            <div class="metrics-grid">
                                <div class="metric-item">
                                    <div class="metric-value upload" id="total-upload">0 B</div>
                                    <div class="metric-label"><i class="fas fa-upload icon upload"></i>Total Upload</div>
                                </div>
                                <div class="metric-item">
                                    <div class="metric-value download" id="total-download">0 B</div>
                                    <div class="metric-label"><i class="fas fa-download icon download"></i>Total Download</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card">
                            <div class="card-title">Network Speed</div>
                            <div class="chart-container">
                                <canvas id="speedChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="tab-content" id="history-tab">
                    <div class="card">
                        <div class="card-title">
                            Connection History
                            <button id="clear-history">Clear History</button>
                        </div>
                        <div id="history-list">
                            <div class="no-metrics">No connection history available.</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                (function() {
                    // Initialize variables
                    const vscode = acquireVsCodeApi();
                    let speedChart = null;
                    let speedData = {
                        labels: [],
                        upload: [],
                        download: []
                    };
                    
                    // Initialize the UI
                    document.addEventListener('DOMContentLoaded', function() {
                        // Tab switching
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.addEventListener('click', () => {
                                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                                
                                tab.classList.add('active');
                                document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
                            });
                        });
                        
                        // Clear history button
                        document.getElementById('clear-history').addEventListener('click', () => {
                            vscode.postMessage({ command: 'clearMetrics' });
                        });
                    });
                    
                    // Create the speed chart
                    function createSpeedChart() {
                        if (!speedChart) {
                            const ctx = document.getElementById('speedChart').getContext('2d');
                            speedChart = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: [],
                                    datasets: [
                                        {
                                            label: 'Upload',
                                            data: [],
                                            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--vscode-charts-blue') || '#75beff',
                                            backgroundColor: 'transparent',
                                            tension: 0.3,
                                            borderWidth: 2
                                        },
                                        {
                                            label: 'Download',
                                            data: [],
                                            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--vscode-charts-green') || '#89d185',
                                            backgroundColor: 'transparent',
                                            tension: 0.3,
                                            borderWidth: 2
                                        }
                                    ]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    animation: {
                                        duration: 0
                                    },
                                    scales: {
                                        x: {
                                            display: true,
                                            grid: {
                                                display: false
                                            },
                                            ticks: {
                                                maxRotation: 0,
                                                autoSkip: true,
                                                maxTicksLimit: 6
                                            }
                                        },
                                        y: {
                                            display: true,
                                            grid: {
                                                color: 'rgba(255, 255, 255, 0.1)'
                                            },
                                            ticks: {
                                                callback: function(value) {
                                                    return formatBytes(value) + '/s';
                                                }
                                            }
                                        }
                                    },
                                    plugins: {
                                        tooltip: {
                                            callbacks: {
                                                label: function(context) {
                                                    let label = context.dataset.label || '';
                                                    if (label) {
                                                        label += ': ';
                                                    }
                                                    label += formatBytes(context.raw) + '/s';
                                                    return label;
                                                }
                                            }
                                        },
                                        legend: {
                                            labels: {
                                                boxWidth: 12
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    
                    // Update the speed chart with new data
                    function updateSpeedChart(uploadSpeed, downloadSpeed) {
                        if (!speedChart) {
                            createSpeedChart();
                        }
                        
                        // Add current time as label
                        const now = new Date();
                        const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                                          now.getMinutes().toString().padStart(2, '0') + ':' + 
                                          now.getSeconds().toString().padStart(2, '0');
                        
                        // Parse speed values (removing units)
                        const parseSpeed = (speedStr) => {
                            const match = speedStr.match(/^([\\d.]+)/);
                            const unit = speedStr.match(/([KMG]B)\\/s$/);
                            const value = parseFloat(match ? match[1] : '0');
                            
                            if (unit) {
                                switch(unit[1]) {
                                    case 'KB': return value * 1024;
                                    case 'MB': return value * 1024 * 1024;
                                    case 'GB': return value * 1024 * 1024 * 1024;
                                    default: return value;
                                }
                            }
                            
                            return value;
                        };
                        
                        // Add data to chart
                        speedData.labels.push(timeString);
                        speedData.upload.push(parseSpeed(uploadSpeed));
                        speedData.download.push(parseSpeed(downloadSpeed));
                        
                        // Keep only the last 60 data points (1 minute)
                        if (speedData.labels.length > 60) {
                            speedData.labels.shift();
                            speedData.upload.shift();
                            speedData.download.shift();
                        }
                        
                        // Update chart data
                        speedChart.data.labels = speedData.labels;
                        speedChart.data.datasets[0].data = speedData.upload;
                        speedChart.data.datasets[1].data = speedData.download;
                        speedChart.update();
                    }
                    
                    // Format bytes to human-readable format
                    function formatBytes(bytes, decimals = 2) {
                        if (bytes === 0) return '0 B';
                        
                        const k = 1024;
                        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
                    }
                    
                    // Update the UI with metrics data
                    function updateUI(metrics) {
                        const noMetricsEl = document.getElementById('no-metrics');
                        const metricsContainerEl = document.getElementById('metrics-container');
                        const loadingEl = document.getElementById('loading');
                        
                        loadingEl.style.display = 'none';
                        
                        if (!metrics) {
                            noMetricsEl.style.display = 'block';
                            metricsContainerEl.style.display = 'none';
                            return;
                        }
                        
                        noMetricsEl.style.display = 'none';
                        metricsContainerEl.style.display = 'block';
                        
                        // Update status
                        const statusEl = document.getElementById('connection-status');
                        if (metrics.isActive) {
                            statusEl.textContent = 'Active';
                            statusEl.className = 'status-badge status-active';
                        } else {
                            statusEl.textContent = 'Inactive';
                            statusEl.className = 'status-badge status-inactive';
                        }
                        
                        // Update metrics values
                        document.getElementById('duration').textContent = metrics.duration || '00:00:00';
                        document.getElementById('upload-speed').textContent = metrics.uploadSpeed || '0 B/s';
                        document.getElementById('download-speed').textContent = metrics.downloadSpeed || '0 B/s';
                        document.getElementById('total-upload').textContent = metrics.totalUpload || '0 B';
                        document.getElementById('total-download').textContent = metrics.totalDownload || '0 B';
                        
                        // Calculate and update total data
                        const totalUploadBytes = parseFloat(metrics.totalUpload) || 0;
                        const totalDownloadBytes = parseFloat(metrics.totalDownload) || 0;
                        document.getElementById('total-data').textContent = formatBytes(totalUploadBytes + totalDownloadBytes);
                        
                        // Update chart
                        updateSpeedChart(metrics.uploadSpeed, metrics.downloadSpeed);
                    }
                    
                    // Update history list
                    function updateHistoryList(sessions) {
                        const historyListEl = document.getElementById('history-list');
                        
                        if (!sessions || sessions.length === 0) {
                            historyListEl.innerHTML = '<div class="no-metrics">No connection history available.</div>';
                            return;
                        }
                        
                        let html = '';
                        sessions.forEach(session => {
                            html += \`
                            <div class="history-item" data-id="\${session.id}">
                                <div class="history-title">\${session.profileName} (\${session.host})</div>
                                <div class="history-detail">
                                    <div><i class="fas fa-calendar-alt icon"></i> \${session.startTime}</div>
                                    <div><i class="fas fa-clock icon"></i> \${session.duration}</div>
                                    <div><i class="fas fa-upload icon upload"></i> \${session.totalUpload}</div>
                                    <div><i class="fas fa-download icon download"></i> \${session.totalDownload}</div>
                                </div>
                            </div>
                            \`;
                        });
                        
                        historyListEl.innerHTML = html;
                        
                        // Add click handlers
                        document.querySelectorAll('.history-item').forEach(item => {
                            item.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'viewHistorical',
                                    sessionId: item.dataset.id
                                });
                            });
                        });
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'updateMetrics':
                                updateUI(message.metrics);
                                updateHistoryList(message.historicalSessions);
                                break;
                        }
                    });
                    
                    // Initial state
                    vscode.postMessage({ command: 'ready' });
                })();
            </script>
        </body>
        </html>`;
    }
    
    /**
     * Get the HTML for the session detail view
     */
    private _getHtmlForSessionDetail(webview: vscode.Webview, session: VpnConnectionSession): string {
        // Get Chart.js from CDN
        const chartJsUri = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
        const fontsCss = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css';
        
        // Prepare data points for chart
        const chartData = {
            labels: session.dataPoints.map(dp => {
                const date = new Date(dp.timestamp);
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
            }),
            upload: session.dataPoints.map(dp => dp.uploadSpeed),
            download: session.dataPoints.map(dp => dp.downloadSpeed)
        };
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VPN Session Details</title>
            <link href="${fontsCss}" rel="stylesheet">
            <script src="${chartJsUri}"></script>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .header {
                    margin-bottom: 20px;
                }
                .title {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                .subtitle {
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 20px;
                }
                .card {
                    background-color: var(--vscode-editorWidget-background);
                    border-radius: 6px;
                    margin-bottom: 20px;
                    padding: 15px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }
                .card-title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-editor-foreground);
                }
                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    grid-gap: 15px;
                    margin-bottom: 15px;
                }
                .metric-item {
                    text-align: center;
                    padding: 10px;
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }
                .metric-value {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: var(--vscode-textLink-foreground);
                }
                .metric-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .chart-container {
                    position: relative;
                    height: 300px;
                    width: 100%;
                    margin-top: 20px;
                }
                .icon {
                    margin-right: 5px;
                }
                .upload {
                    color: var(--vscode-charts-blue);
                }
                .download {
                    color: var(--vscode-charts-green);
                }
                .no-data {
                    text-align: center;
                    padding: 40px 0;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">VPN Session: ${session.profileName}</div>
                <div class="subtitle">
                    <div><i class="fas fa-server icon"></i> Host: ${session.host}</div>
                    <div><i class="fas fa-calendar-alt icon"></i> Date: ${new Date(session.startTime).toLocaleString()}</div>
                    <div><i class="fas fa-clock icon"></i> Duration: ${formatDuration(session.duration)}</div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-title">Connection Summary</div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value upload">${formatBytes(session.totalUpload)}</div>
                        <div class="metric-label"><i class="fas fa-upload icon upload"></i>Total Upload</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value download">${formatBytes(session.totalDownload)}</div>
                        <div class="metric-label"><i class="fas fa-download icon download"></i>Total Download</div>
                    </div>
                </div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value">${formatBytes(session.totalUpload + session.totalDownload)}</div>
                        <div class="metric-label"><i class="fas fa-exchange-alt icon"></i>Total Data</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${formatDuration(session.duration)}</div>
                        <div class="metric-label"><i class="fas fa-clock icon"></i>Connection Time</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-title">Network Speed Over Time</div>
                ${session.dataPoints.length > 0 
                    ? '<div class="chart-container"><canvas id="speedChart"></canvas></div>'
                    : '<div class="no-data">No data points available for this session.</div>'
                }
            </div>
            
            <script>
                // Format bytes to human-readable format
                function formatBytes(bytes, decimals = 2) {
                    if (bytes === 0) return '0 B';
                    
                    const k = 1024;
                    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                    const i = Math.floor(Math.log(bytes) / Math.log(k));
                    
                    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
                }
                
                // Initialize the speed chart
                const chartData = ${JSON.stringify(chartData)};
                
                if (chartData.labels.length > 0) {
                    const ctx = document.getElementById('speedChart').getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: chartData.labels,
                            datasets: [
                                {
                                    label: 'Upload',
                                    data: chartData.upload,
                                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--vscode-charts-blue') || '#75beff',
                                    backgroundColor: 'transparent',
                                    tension: 0.3,
                                    borderWidth: 2
                                },
                                {
                                    label: 'Download',
                                    data: chartData.download,
                                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--vscode-charts-green') || '#89d185',
                                    backgroundColor: 'transparent',
                                    tension: 0.3,
                                    borderWidth: 2
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: {
                                    display: true,
                                    grid: {
                                        display: false
                                    },
                                    ticks: {
                                        maxRotation: 0,
                                        autoSkip: true,
                                        maxTicksLimit: 10
                                    }
                                },
                                y: {
                                    display: true,
                                    grid: {
                                        color: 'rgba(255, 255, 255, 0.1)'
                                    },
                                    ticks: {
                                        callback: function(value) {
                                            return formatBytes(value) + '/s';
                                        }
                                    }
                                }
                            },
                            plugins: {
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            let label = context.dataset.label || '';
                                            if (label) {
                                                label += ': ';
                                            }
                                            label += formatBytes(context.raw) + '/s';
                                            return label;
                                        }
                                    }
                                },
                                legend: {
                                    labels: {
                                        boxWidth: 12
                                    }
                                }
                            }
                        }
                    });
                }
            </script>
        </body>
        </html>`;
    }
    
    /**
     * Register the metrics view provider
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new MetricsViewProvider(context.extensionUri);
        return vscode.window.registerWebviewViewProvider(MetricsViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        });
    }
}