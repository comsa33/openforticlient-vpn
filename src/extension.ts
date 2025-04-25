import * as vscode from 'vscode';
import * as cp from 'child_process';
import { ProfileManager } from './models/profileManager';
import { VpnService } from './services/vpnService';
import { LogService } from './services/logService';
import { MetricsService } from './services/metricsService';
import { createStatusBarItem } from './ui/statusBar';
import { registerProfilesView } from './ui/profilesView';
import { registerMetricsView } from './ui/metricsTreeView';
import { registerCommands } from './commands';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize logging service
    const logger = LogService.getInstance();
    logger.log('OpenFortiVPN Connector has been activated.');
    
    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    
    // Initialize profile manager
    const profileManager = new ProfileManager(context);
    
    // Initialize metrics service
    const metricsService = MetricsService.getInstance(context);
    metricsService.setProfileManager(profileManager);
    
    // Initialize VPN service
    const vpnService = new VpnService(context, statusBarItem);
    
    // Configure status bar item
    createStatusBarItem(statusBarItem, profileManager, vpnService);
    statusBarItem.show();
    
    // Register profile view in activity bar
    registerProfilesView(context, profileManager, vpnService);
        
    // Register metrics view in activity bar (트리 뷰 구현으로 변경)
    registerMetricsView(context, metricsService);
    
    // Register commands
    registerCommands(context, profileManager, vpnService);
    
    // Migrate old settings to profiles if needed
    const hasMigrated = await profileManager.migrateFromSettings();
    if (hasMigrated) {
        logger.log('Existing VPN settings have been migrated to the new profiles system.', true);
    }
    
    // Dispose LogService and MetricsService when extension is deactivated
    context.subscriptions.push({
        dispose: () => {
            logger.dispose();
            MetricsService.getInstance().dispose();
        }
    });
}

/**
 * Deactivate the extension
 */
export function deactivate() {
    const logger = LogService.getInstance();
    logger.log('Deactivating OpenFortiVPN Connector extension...');
    
    // Try to disconnect VPN if connected
    try {
        logger.log('Attempting to terminate any running OpenFortiVPN connections...');
        const child = cp.spawn('sudo', ['-n', 'pkill', '-SIGTERM', 'openfortivpn'], {
            stdio: 'ignore'
        });
        child.unref();
    } catch (error) {
        logger.error('Failed to disconnect VPN during deactivation', error);
    }
}
