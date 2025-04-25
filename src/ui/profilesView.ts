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
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(profile.name, collapsibleState);
        
        this.tooltip = `${profile.host}:${profile.port} (${profile.username})`;
        this.description = profile.isActive ? 'Active' : '';
        
        this.iconPath = new vscode.ThemeIcon(
            profile.isActive ? 'shield' : 'lock'
        );
        
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
        });
    }
    
    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
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
                vscode.TreeItemCollapsibleState.None
            );
        });
        
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
    
    context.subscriptions.push(treeView);
    
    return treeView;
}