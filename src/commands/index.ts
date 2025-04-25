import * as vscode from 'vscode';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from '../services/vpnService';
import { LogService } from '../services/logService';
import { MetricsService } from '../services/metricsService';
import { registerProfileCommands } from './profileCommands';
import { registerVpnCommands } from './vpnCommands';
import { registerMetricsCommands } from './metricsCommands';

/**
 * Register all commands
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    profileManager: ProfileManager,
    vpnService: VpnService
): void {
    // Register VPN connection commands
    registerVpnCommands(context, profileManager, vpnService);
    
    // Register profile management commands
    registerProfileCommands(context, profileManager, vpnService);
    
    // Register metrics commands
    registerMetricsCommands(context);
    
    // Register log display command
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.showLogs', () => {
            LogService.getInstance().show();
        })
    );
}