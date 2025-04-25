// src/ui/metricsTreeView.ts
import * as vscode from 'vscode';
import { MetricsService } from '../services/metricsService';
import { LogService } from '../services/logService';
import { formatBytes, formatSpeed, formatDuration } from '../models/metrics';

/**
 * Tree item representing a metrics data point
 */
export class MetricsTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.description = value;
        
        // Set some nice icons
        if (label.includes('Upload')) {
            this.iconPath = new vscode.ThemeIcon('arrow-up');
        } else if (label.includes('Download')) {
            this.iconPath = new vscode.ThemeIcon('arrow-down');
        } else if (label.includes('Duration')) {
            this.iconPath = new vscode.ThemeIcon('clock');
        } else if (label.includes('Status')) {
            this.iconPath = new vscode.ThemeIcon('pulse');
        } else if (label.includes('Total Data')) {
            this.iconPath = new vscode.ThemeIcon('database');
        }
    }
}

/**
 * Tree data provider for metrics
 */
export class MetricsTreeProvider implements vscode.TreeDataProvider<MetricsTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MetricsTreeItem | undefined> = new vscode.EventEmitter<MetricsTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<MetricsTreeItem | undefined> = this._onDidChangeTreeData.event;
    
    private _metricsService: MetricsService;
    private _refreshInterval: NodeJS.Timeout | null = null;
    private _logger: LogService;
    private _lastMetricsStatus: boolean = false; // Track last metrics status
    private _refreshIntervalListener: vscode.Disposable | null = null;

    constructor(metricsService: MetricsService) {
        this._metricsService = metricsService;
        this._logger = LogService.getInstance();
        this._logger.log('MetricsTreeProvider initialized');
        
        // 메트릭 변경 시 트리 갱신
        this._metricsService.onMetricsChanged((metrics) => {
            // ... 기존 코드 유지 ...
        });
        
        // 설정에서 갱신 주기 가져오기
        const refreshInterval = this._getRefreshInterval();
        
        // 주기적 갱신 - 설정된 주기로 설정
        this._refreshInterval = setInterval(() => this.refresh(), refreshInterval * 1000);
        
        // 설정 변경 감지를 위한 리스너 추가
        this._refreshIntervalListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('openfortivpn-connector.metricsRefreshInterval')) {
                this._updateRefreshInterval();
            }
        });
    }
    
    /**
     * 현재 설정된 메트릭 수집 주기(초) 가져오기
     */
    private _getRefreshInterval(): number {
        const config = vscode.workspace.getConfiguration('openfortivpn-connector');
        const interval = config.get<number>('metricsRefreshInterval', 5);
        
        // 1-60초 범위로 제한
        return Math.max(1, Math.min(60, interval));
    }
    
    /**
     * 설정 변경 시 수집 주기 업데이트
     */
    private _updateRefreshInterval(): void {
        const intervalSeconds = this._getRefreshInterval();
        this._logger.log(`Updating metrics view refresh interval to ${intervalSeconds} seconds`);
        
        // 기존 인터벌 중지
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }
        
        // 새 인터벌 시작
        this._refreshInterval = setInterval(() => this.refresh(), intervalSeconds * 1000);
    }
    
    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
    /**
     * Get tree item for a given element
     */
    getTreeItem(element: MetricsTreeItem): vscode.TreeItem {
        return element;
    }
    
    /**
     * Get children elements for a given element
     */
    getChildren(element?: MetricsTreeItem): Thenable<MetricsTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        
        const metrics = this._metricsService.getFormattedMetrics();
        if (!metrics) {
            // Prevent unnecessary log output
            // this._logger.log('No active metrics data available');
            return Promise.resolve([
                new MetricsTreeItem('No active VPN connection', 'Connect to a VPN to see metrics', vscode.TreeItemCollapsibleState.None)
            ]);
        }
        
        // Show current metrics data
        const items = [
            new MetricsTreeItem('Connection Status', metrics.isActive ? 'Active' : 'Inactive', vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Duration', metrics.duration, vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Upload Speed', metrics.uploadSpeed, vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Download Speed', metrics.downloadSpeed, vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Total Upload', metrics.totalUpload, vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Total Download', metrics.totalDownload, vscode.TreeItemCollapsibleState.None),
            new MetricsTreeItem('Total Data', formatBytes(parseInt(metrics.totalUpload) + parseInt(metrics.totalDownload)), vscode.TreeItemCollapsibleState.None)
        ];
        
        // Reduce log output frequency
        // this._logger.log(`Returning ${items.length} metric items`);
        return Promise.resolve(items);
    }
    
    /**
     * Dispose resources
     */
    dispose(): void {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
        
        if (this._refreshIntervalListener) {
            this._refreshIntervalListener.dispose();
            this._refreshIntervalListener = null;
        }
    }
}

/**
 * Register metrics tree view
 */
export function registerMetricsView(context: vscode.ExtensionContext, metricsService: MetricsService): vscode.Disposable {
    const logger = LogService.getInstance();
    logger.log('Registering metrics tree view');
    
    const metricsTreeProvider = new MetricsTreeProvider(metricsService);
    
    // Register tree view
    const treeView = vscode.window.createTreeView('openfortivpnMetrics', {
        treeDataProvider: metricsTreeProvider,
        showCollapseAll: false
    });
    
    // Add clear metrics button to the view title
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.refreshMetrics', () => {
            metricsTreeProvider.refresh();
            logger.log('Metrics view refreshed by user');
        })
    );
    
    // Clean up resources
    context.subscriptions.push({
        dispose: () => {
            metricsTreeProvider.dispose();
            treeView.dispose();
        }
    });
    
    return treeView;
}