import * as vscode from 'vscode';
import { ProfileManager } from '../models/profileManager';
import { VpnProfile } from '../models/profile';
import { VpnService } from '../services/vpnService';

/**
 * Register profile-related commands
 */
export function registerProfileCommands(
    context: vscode.ExtensionContext,
    profileManager: ProfileManager,
    vpnService: VpnService
): void {
    // Get active profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.getActiveProfile', () => {
            return profileManager.getActiveProfile();
        })
    );
    
    // Create new profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.createProfile', async () => {
            return createProfile(profileManager);
        })
    );
    
    // Edit profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.editProfile', async (item) => {
            if (item && item.profile) {
                return editProfile(profileManager, item.profile);
            }
        })
    );
    
    // Delete profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.deleteProfile', async (item) => {
            if (item && item.profile) {
                return deleteProfile(profileManager, item.profile);
            }
        })
    );
    
    // Set active profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.setActiveProfile', async (item) => {
            if (item && item.profile) {
                return setActiveProfile(profileManager, item.profile);
            }
        })
    );
    
    // Connect to specific profile
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.connectProfile', async (item) => {
            if (item && item.profile) {
                await profileManager.setActiveProfile(item.profile.id);
                return vpnService.connect(item.profile);
            }
        })
    );
    
    // Manage profile password
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.manageProfilePassword', async (item) => {
            if (item && item.profile) {
                const action = await vscode.window.showQuickPick(
                    ['Save Password', 'Clear Password'],
                    { placeHolder: `Manage password for profile "${item.profile.name}"` }
                );
                
                if (action === 'Save Password') {
                    return vpnService.savePassword(item.profile);
                } else if (action === 'Clear Password') {
                    return vpnService.clearPassword(item.profile);
                }
            }
        })
    );
}

/**
 * Create a new VPN profile
 */
async function createProfile(profileManager: ProfileManager): Promise<VpnProfile | undefined> {
    // Get profile name
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new VPN profile',
        placeHolder: 'My VPN Profile'
    });
    
    if (!name) {
        return undefined; // User canceled
    }
    
    // Get host
    const host = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway address',
        placeHolder: 'vpn.example.com'
    });
    
    if (host === undefined) {
        return undefined; // User canceled
    }
    
    // Get port
    const port = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway port',
        placeHolder: '443',
        value: '443'
    });
    
    if (port === undefined) {
        return undefined; // User canceled
    }
    
    // Get username
    const username = await vscode.window.showInputBox({
        prompt: 'Enter the username',
        placeHolder: 'username'
    });
    
    if (username === undefined) {
        return undefined; // User canceled
    }
    
    // Get trusted certificate (optional)
    const trustedCert = await vscode.window.showInputBox({
        prompt: '(Optional) Enter the trusted gateway certificate SHA256 hash',
        placeHolder: 'Leave empty to auto-detect on first connection'
    });
    
    if (trustedCert === undefined) {
        return undefined; // User canceled
    }
    
    // Create the profile
    const profile = await profileManager.createProfile({
        name,
        host,
        port,
        username,
        trustedCert: trustedCert || undefined
    });
    
    vscode.window.showInformationMessage(`VPN profile "${name}" has been created.`);
    
    return profile;
}

/**
 * Edit an existing VPN profile
 */
async function editProfile(profileManager: ProfileManager, profile: VpnProfile): Promise<VpnProfile | undefined> {
    // Get profile name
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the VPN profile',
        value: profile.name
    });
    
    if (name === undefined) {
        return undefined; // User canceled
    }
    
    // Get host
    const host = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway address',
        value: profile.host
    });
    
    if (host === undefined) {
        return undefined; // User canceled
    }
    
    // Get port
    const port = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway port',
        value: profile.port
    });
    
    if (port === undefined) {
        return undefined; // User canceled
    }
    
    // Get username
    const username = await vscode.window.showInputBox({
        prompt: 'Enter the username',
        value: profile.username
    });
    
    if (username === undefined) {
        return undefined; // User canceled
    }
    
    // Get trusted certificate (optional)
    const trustedCert = await vscode.window.showInputBox({
        prompt: '(Optional) Trusted gateway certificate SHA256 hash',
        value: profile.trustedCert || '',
        placeHolder: 'Leave empty to auto-detect on next connection'
    });
    
    if (trustedCert === undefined) {
        return undefined; // User canceled
    }
    
    // Update the profile
    const updatedProfile = { ...profile, name, host, port, username, trustedCert: trustedCert || undefined };
    await profileManager.updateProfile(updatedProfile);
    
    vscode.window.showInformationMessage(`VPN profile "${name}" has been updated.`);
    
    return updatedProfile;
}

/**
 * Delete a VPN profile
 */
async function deleteProfile(profileManager: ProfileManager, profile: VpnProfile): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete the VPN profile "${profile.name}"?`,
        { modal: true },
        'Delete'
    );
    
    if (confirm !== 'Delete') {
        return false;
    }
    
    await profileManager.deleteProfile(profile.id);
    vscode.window.showInformationMessage(`VPN profile "${profile.name}" has been deleted.`);
    
    return true;
}

/**
 * Set the active VPN profile
 */
async function setActiveProfile(profileManager: ProfileManager, profile: VpnProfile): Promise<VpnProfile> {
    const activeProfile = await profileManager.setActiveProfile(profile.id);
    vscode.window.showInformationMessage(`VPN profile "${profile.name}" is now active.`);
    
    return activeProfile;
}