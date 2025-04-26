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
    
    // Check if VPN is reconnecting
    if (vpnService.reconnectState === 1) { // ReconnectState.Attempting
        statusBarItem.text = `$(shield) VPN: Reconnecting... (${vpnService.reconnectAttempts})`;
        if (activeProfile) {
            statusBarItem.tooltip = `Attempting to reconnect to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Attempting to reconnect to VPN...";
        }
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    // Check if max retries reached
    else if (vpnService.reconnectState === 2) { // ReconnectState.MaxRetriesReached
        statusBarItem.text = `$(shield) VPN: Reconnect Failed`;
        if (activeProfile) {
            statusBarItem.tooltip = `Failed to reconnect to ${activeProfile.name}. Click to retry.`;
        } else {
            statusBarItem.tooltip = "Failed to reconnect to VPN. Click to retry.";
        }
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    // Standard connecting state
    else if (vpnService.isConnecting) {
        statusBarItem.text = `$(shield) VPN: Connecting...`;
        if (activeProfile) {
            statusBarItem.tooltip = `Connecting to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Connecting to VPN...";
        }
        statusBarItem.backgroundColor = undefined;
    }
    // Connected state
    else if (vpnService.isConnected) {
        statusBarItem.text = `$(shield) VPN: Connected`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        if (activeProfile) {
            statusBarItem.tooltip = `Connected to ${activeProfile.name} (${activeProfile.host})`;
        } else {
            statusBarItem.tooltip = "Connected to VPN";
        }
    }
    // Disconnected state
    else {
        statusBarItem.text = `$(shield) VPN: Disconnected`;
        statusBarItem.backgroundColor = undefined;
        if (activeProfile) {
            statusBarItem.tooltip = `Profile: ${activeProfile.name} (Disconnected)`;
        } else {
            statusBarItem.tooltip = "VPN Disconnected";
        }
    }
    
    // Update context for UI visibility
    vscode.commands.executeCommand('setContext', 'openfortivpn:isReconnecting', vpnService.reconnectState === 1);
    vscode.commands.executeCommand('setContext', 'openfortivpn:maxRetriesReached', vpnService.reconnectState === 2);
}