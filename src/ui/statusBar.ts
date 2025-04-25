import * as vscode from 'vscode';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from '../services/vpnService';

/**
 * Create and manage the status bar item
 */
export function createStatusBarItem(
    statusBarItem: vscode.StatusBarItem,
    profileManager: ProfileManager,
    vpnService: VpnService
): void {
    // Configure status bar item
    statusBarItem.command = 'openfortivpn-connector.toggle';
    statusBarItem.tooltip = "Toggle OpenFortiVPN Connection";
    
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
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        if (activeProfile) {
            statusBarItem.tooltip = `Connected to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Connected to VPN";
        }
    } else {
        statusBarItem.text = `$(shield) VPN: Disconnected`;
        statusBarItem.backgroundColor = undefined;
        if (activeProfile) {
            statusBarItem.tooltip = `Profile: ${activeProfile.name} (Disconnected)`;
        } else {
            statusBarItem.tooltip = "VPN Disconnected";
        }
    }
}