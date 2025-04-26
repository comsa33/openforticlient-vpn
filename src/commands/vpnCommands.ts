import * as vscode from 'vscode';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from '../services/vpnService';
import { VpnProfile } from '../models/profile';

/**
 * Register VPN connection commands
 */
export function registerVpnCommands(
    context: vscode.ExtensionContext,
    profileManager: ProfileManager,
    vpnService: VpnService
): void {
    // Toggle VPN connection (connect/disconnect)
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.toggle', async () => {
            if (vpnService.isConnected) {
                return vpnService.disconnect();
            } else {
                const activeProfile = profileManager.getActiveProfile();
                
                if (!activeProfile) {
                    // No active profile, check if there are any profiles
                    const { profiles } = profileManager.getProfiles();
                    
                    if (profiles.length === 0) {
                        // No profiles, ask to create one
                        const createNew = await vscode.window.showWarningMessage(
                            'No VPN profiles found. Do you want to create one?',
                            'Create Profile'
                        );
                        
                        if (createNew === 'Create Profile') {
                            const profile = await vscode.commands.executeCommand('openfortivpn-connector.createProfile') as VpnProfile | undefined;
                            if (profile && 'id' in profile) {
                                return vpnService.connect(profile);
                            }
                        }
                    } else {
                        // There are profiles, but none is active, let user choose one
                        const items = profiles.map(p => ({ 
                            label: p.name,
                            description: `${p.host}:${p.port} (${p.username})`,
                            profile: p
                        }));
                        
                        const selected = await vscode.window.showQuickPick(items, {
                            placeHolder: 'Select a VPN profile to connect'
                        });
                        
                        if (selected) {
                            await profileManager.setActiveProfile(selected.profile.id);
                            return vpnService.connect(selected.profile);
                        }
                    }
                } else {
                    // Use active profile
                    return vpnService.connect(activeProfile);
                }
            }
            
            return false;
        })
    );
    
    // Legacy configure command (redirects to profile management)
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.config', async () => {
            // Check if there are any profiles
            const { profiles } = profileManager.getProfiles();
            
            if (profiles.length === 0) {
                // No profiles, create one
                return vscode.commands.executeCommand('openfortivpn-connector.createProfile');
            } else {
                // Show profiles view
                vscode.commands.executeCommand('openfortivpnProfiles.focus');
                
                // Ask what to do
                const action = await vscode.window.showQuickPick(
                    ['Create New Profile', 'Edit Existing Profile', 'Cancel'],
                    { placeHolder: 'VPN Profile Management' }
                );
                
                if (action === 'Create New Profile') {
                    return vscode.commands.executeCommand('openfortivpn-connector.createProfile');
                } else if (action === 'Edit Existing Profile') {
                    const items = profiles.map(p => ({ 
                        label: p.name,
                        description: `${p.host}:${p.port} (${p.username})`,
                        profile: p
                    }));
                    
                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: 'Select a VPN profile to edit'
                    });
                    
                    if (selected) {
                        return vscode.commands.executeCommand(
                            'openfortivpn-connector.editProfile', 
                            { profile: selected.profile }
                        );
                    }
                }
            }
        })
    );
    
    // Password management commands (redirects to active profile)
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.savePassword', async () => {
            const activeProfile = profileManager.getActiveProfile();
            
            if (!activeProfile) {
                vscode.window.showWarningMessage('No active VPN profile. Please select a profile first.');
                return false;
            }
            
            return vpnService.savePassword(activeProfile);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.clearPassword', async () => {
            const activeProfile = profileManager.getActiveProfile();
            
            if (!activeProfile) {
                vscode.window.showWarningMessage('No active VPN profile. Please select a profile first.');
                return;
            }
            
            return vpnService.clearPassword(activeProfile);
        })
    );
    
    // Auto-reconnect commands
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.cancelAutoReconnect', async () => {
            vpnService.cancelAutoReconnect();
            vscode.window.showInformationMessage('Auto-reconnect process has been canceled.');
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.retryConnection', async () => {
            const success = await vpnService.retryConnection();
            if (!success) {
                vscode.window.showWarningMessage('Cannot retry connection. No previous connection information available.');
            }
        })
    );
}