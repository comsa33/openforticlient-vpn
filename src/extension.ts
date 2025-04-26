import * as vscode from 'vscode';
import * as cp from 'child_process';
import { ProfileManager } from './models/profileManager';
import { VpnService } from './services/vpnService';
import { LogService } from './services/logService';
import { MetricsService } from './services/metricsService';
import { ScheduleService } from './services/scheduleService';
import { createStatusBarItem } from './ui/statusBar';
import { registerProfilesView } from './ui/profilesView';
import { registerMetricsView } from './ui/metricsTreeView';
import { registerSchedulesView } from './ui/scheduleView';
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
    
    // Initialize schedule service
    const scheduleService = ScheduleService.getInstance(context, profileManager, vpnService);
        
    // Make sure schedules are checked immediately on startup
    setTimeout(() => {
        logger.log('Performing initial schedule check on extension activation');
        
        // Force a schedule check immediately instead of just refreshing the view
        scheduleService['_checkSchedules']().then(() => {
            logger.log('Initial schedule check completed');
        }).catch(err => {
            logger.error('Error during initial schedule check', err);
        });
        
        // Also refresh the UI
        vscode.commands.executeCommand('openfortivpn-connector.refreshSchedules');
    }, 2000);
    
    // Configure status bar item
    createStatusBarItem(statusBarItem, profileManager, vpnService);
    statusBarItem.show();
    
    // Register profile view in activity bar
    registerProfilesView(context, profileManager, vpnService);
        
    // Register metrics view in activity bar
    registerMetricsView(context, metricsService);
    
    // Register schedule view in activity bar
    registerSchedulesView(context, scheduleService, profileManager);
    
    // Register commands
    registerCommands(context, profileManager, vpnService, scheduleService);
    
    // Migrate old settings to profiles if needed
    const hasMigrated = await profileManager.migrateFromSettings();
    if (hasMigrated) {
        logger.log('Existing VPN settings have been migrated to the new profiles system.', true);
    }
    
    // Dispose services when extension is deactivated
    context.subscriptions.push({
        dispose: () => {
            logger.dispose();
            MetricsService.getInstance().dispose();
            scheduleService.dispose();
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