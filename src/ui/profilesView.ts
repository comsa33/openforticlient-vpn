import * as vscode from 'vscode';
import { VpnProfile } from '../models/profile';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from '../services/vpnService';

/**
 * Tree item representing a VPN profile
 */
export class ProfileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly profile: VpnProfile,
        public readonly vpnService: VpnService,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(profile.name, collapsibleState);
        
        this.tooltip = `${profile.host}:${profile.port} (${profile.username})`;
        
        // Set description based on profile status
        if (profile.isActive) {
            if (vpnService.isConnected) {
                this.description = 'Active (Connected)';
            } else if (vpnService.isConnecting) {
                this.description = 'Active (Connecting...)';
            } else {
                this.description = 'Active';
            }
        } else {
            this.description = '';
        }
        
        // Set icon based on profile status
        if (profile.isActive) {
            if (vpnService.isConnected) {
                this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('testing.iconPassed'));
            } else if (vpnService.isConnecting) {
                this.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('testing.iconQueued'));
            } else {
                this.iconPath = new vscode.ThemeIcon('shield');
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('lock');
        }
        
        this.contextValue = profile.isActive ? 'activeProfile' : 'profile';
    }
}

/**
 * VPN Profiles tree data provider for the sidebar view
 */
export class ProfilesProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProfileTreeItem | undefined> = new vscode.EventEmitter<ProfileTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ProfileTreeItem | undefined> = this._onDidChangeTreeData.event;
    
    constructor(
        private profileManager: ProfileManager,
        private vpnService: VpnService
    ) {
        // Refresh view when profiles change
        this.profileManager.onProfilesChanged(() => {
            this.refresh();
        });
        
        // Refresh view when VPN status changes
        this.vpnService.onStatusChanged(() => {
            this.refresh();
            this.updateConnectionContext();
        });
    }
    
    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
    /**
     * Update the connection status context for menu visibility
     */
    private updateConnectionContext(): void {
        // Set context key for controlling menu visibility
        vscode.commands.executeCommand(
            'setContext', 
            'openfortivpn:isConnected', 
            this.vpnService.isConnected
        );
    }
    
    /**
     * Get tree item for a given element
     */
    getTreeItem(element: ProfileTreeItem): vscode.TreeItem {
        return element;
    }
    
    /**
     * Get children elements for a given element
     */
    getChildren(element?: ProfileTreeItem): Thenable<ProfileTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        
        const { profiles, activeProfileId } = this.profileManager.getProfiles();
        
        // Mark active profile
        const treeItems = profiles.map(profile => {
            return new ProfileTreeItem(
                { 
                    ...profile, 
                    isActive: profile.id === activeProfileId 
                },
                this.vpnService,
                vscode.TreeItemCollapsibleState.None
            );
        });
        
        // Make sure the context is set for menu visibility
        this.updateConnectionContext();
        
        return Promise.resolve(treeItems);
    }
}

/**
 * Register profile view in the activity bar
 */
export function registerProfilesView(
    context: vscode.ExtensionContext,
    profileManager: ProfileManager,
    vpnService: VpnService
): vscode.TreeView<ProfileTreeItem> {
    const profilesProvider = new ProfilesProvider(profileManager, vpnService);
    
    const treeView = vscode.window.createTreeView('openfortivpnProfiles', {
        treeDataProvider: profilesProvider,
        showCollapseAll: false
    });
    
    // Add connect VPN button to the view title
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.connectVpn', async () => {
            const activeProfile = profileManager.getActiveProfile();
            if (activeProfile) {
                return vpnService.connect(activeProfile);
            } else {
                vscode.window.showWarningMessage('No active VPN profile selected. Please select a profile first.');
            }
        })
    );
    
    // Add disconnect VPN button to the view title
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.disconnectVpn', async () => {
            if (vpnService.isConnected) {
                return vpnService.disconnect();
            } else {
                vscode.window.showInformationMessage('VPN is not currently connected.');
            }
        })
    );
    
    // Set initial context value for menu visibility
    vscode.commands.executeCommand(
        'setContext', 
        'openfortivpn:isConnected', 
        vpnService.isConnected
    );
    
    context.subscriptions.push(treeView);
    
    return treeView;
}