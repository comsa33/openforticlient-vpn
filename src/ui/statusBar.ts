import * as vscode from 'vscode';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from '../services/vpnService';

/**
 * Create and manage the status bar item
 */
export function createStatusBarItem(
    context: vscode.ExtensionContext,
    profileManager: ProfileManager,
    vpnService: VpnService
): vscode.StatusBarItem {
    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'openfortivpn-connector.toggle';
    statusBarItem.tooltip = "Toggle OpenFortiVPN Connection";
    context.subscriptions.push(statusBarItem);
    
    // Update status bar when profiles change
    profileManager.onProfilesChanged(() => {
        updateStatusBar(statusBarItem, profileManager, vpnService);
    });
    
    // Update status bar when VPN status changes
    vpnService.onStatusChanged(() => {
        updateStatusBar(statusBarItem, profileManager, vpnService);
    });
    
    // Initial update
    updateStatusBar(statusBarItem, profileManager, vpnService);
    statusBarItem.show();
    
    return statusBarItem;
}

/**
 * Update the status bar item text and appearance
 */
function updateStatusBar(
    statusBarItem: vscode.StatusBarItem,
    profileManager: ProfileManager,
    vpnService: VpnService
): void {
    const activeProfile = profileManager.getActiveProfile();
    
    if (vpnService.isConnecting) {
        statusBarItem.text = `$(shield) VPN: Connecting...`;
        if (activeProfile) {
            statusBarItem.tooltip = `Connecting to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Connecting to VPN...";
        }
    } else if (vpnService.isConnected) {
        statusBarItem.text = `$(shield) VPN: Connected`;
        if (activeProfile) {
            statusBarItem.tooltip = `Connected to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Connected to VPN";
        }
    } else {
        statusBarItem.text = `$(shield) VPN: Disconnected`;
        if (activeProfile) {
            statusBarItem.tooltip = `Profile: ${activeProfile.name} (Disconnected)`;
        } else {
            statusBarItem.tooltip = "VPN Disconnected";
        }
    }
}