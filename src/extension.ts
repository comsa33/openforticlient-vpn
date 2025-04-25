import * as vscode from 'vscode';
import { ProfileManager } from './models/profileManager';
import { VpnService } from './services/vpnService';
import { createStatusBarItem } from './ui/statusBar';
import { registerProfilesView } from './ui/profilesView';
import { registerCommands } from './commands';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('OpenFortiVPN Connector has been activated.');
    
    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);
    
    // Initialize profile manager
    const profileManager = new ProfileManager(context);
    
    // Initialize VPN service
    const vpnService = new VpnService(context, statusBarItem);
    
    // Configure status bar item
    createStatusBarItem(statusBarItem, profileManager, vpnService);
    statusBarItem.show();
    
    // Register profile view in activity bar
    registerProfilesView(context, profileManager, vpnService);
    
    // Register commands
    registerCommands(context, profileManager, vpnService);
    
    // Migrate old settings to profiles if needed
    const hasMigrated = await profileManager.migrateFromSettings();
    if (hasMigrated) {
        vscode.window.showInformationMessage('Existing VPN settings have been migrated to the new profiles system.');
    }
    
    // Register profile explorer view
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'openfortivpnProfiles',
            new (require('./ui/profilesView').ProfilesProvider)(profileManager, vpnService)
        )
    );
}

/**
 * Deactivate the extension
 */
export function deactivate() {
    // This will be called when the extension is deactivated
    // We should disconnect VPN if connected, but we can't access the context here
    try {
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        terminal.sendText('sudo pkill -SIGTERM openfortivpn');
    } catch (error) {
        console.error('Failed to disconnect VPN during deactivation', error);
    }
}