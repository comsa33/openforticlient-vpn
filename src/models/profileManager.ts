import * as vscode from 'vscode';
import { VpnProfile, VpnProfiles, DEFAULT_PROFILES, generateProfileId } from './profile';

/**
 * Storage key for VPN profiles
 */
const PROFILES_STORAGE_KEY = 'openfortivpn-profiles';

/**
 * Manages VPN profiles storage and operations
 */
export class ProfileManager {
    private context: vscode.ExtensionContext;
    private _profiles: VpnProfiles;
    private _onProfilesChanged: vscode.EventEmitter<VpnProfiles> = new vscode.EventEmitter<VpnProfiles>();
    
    /**
     * Event that fires when profiles are changed
     */
    public readonly onProfilesChanged: vscode.Event<VpnProfiles> = this._onProfilesChanged.event;
    
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._profiles = this.loadProfiles();
    }
    
    /**
     * Load profiles from storage
     */
    private loadProfiles(): VpnProfiles {
        const data = this.context.globalState.get<VpnProfiles>(PROFILES_STORAGE_KEY);
        return data || { ...DEFAULT_PROFILES };
    }
    
    /**
     * Save profiles to storage
     */
    private async saveProfiles(): Promise<void> {
        await this.context.globalState.update(PROFILES_STORAGE_KEY, this._profiles);
        this._onProfilesChanged.fire(this._profiles);
    }
    
    /**
     * Get all profiles
     */
    public getProfiles(): VpnProfiles {
        return { ...this._profiles };
    }
    
    /**
     * Get active profile
     */
    public getActiveProfile(): VpnProfile | undefined {
        if (!this._profiles.activeProfileId) {
            return undefined;
        }
        
        return this._profiles.profiles.find(p => p.id === this._profiles.activeProfileId);
    }
    
    /**
     * Create a new profile
     */
    public async createProfile(profile: Omit<VpnProfile, 'id'>): Promise<VpnProfile> {
        const newProfile: VpnProfile = {
            id: generateProfileId(),
            ...profile
        };
        
        this._profiles.profiles.push(newProfile);
        
        // If this is the first profile, set it as active
        if (this._profiles.profiles.length === 1) {
            this._profiles.activeProfileId = newProfile.id;
        }
        
        await this.saveProfiles();
        return newProfile;
    }
    
    /**
     * Update an existing profile
     */
    public async updateProfile(profile: VpnProfile): Promise<void> {
        const index = this._profiles.profiles.findIndex(p => p.id === profile.id);
        
        if (index === -1) {
            throw new Error(`Profile with ID ${profile.id} not found`);
        }
        
        this._profiles.profiles[index] = { ...profile };
        await this.saveProfiles();
    }
    
    /**
     * Delete a profile
     */
    public async deleteProfile(id: string): Promise<void> {
        const index = this._profiles.profiles.findIndex(p => p.id === id);
        
        if (index === -1) {
            throw new Error(`Profile with ID ${id} not found`);
        }
        
        // Remove the profile
        this._profiles.profiles.splice(index, 1);
        
        // If the deleted profile was active, set another one as active or null
        if (this._profiles.activeProfileId === id) {
            this._profiles.activeProfileId = this._profiles.profiles.length > 0 
                ? this._profiles.profiles[0].id 
                : null;
        }
        
        await this.saveProfiles();
    }
    
    /**
     * Set the active profile
     */
    public async setActiveProfile(id: string): Promise<VpnProfile> {
        const profile = this._profiles.profiles.find(p => p.id === id);
        
        if (!profile) {
            throw new Error(`Profile with ID ${id} not found`);
        }
        
        this._profiles.activeProfileId = id;
        await this.saveProfiles();
        
        return profile;
    }
    
    /**
     * Migrate from old settings format to profiles
     */
    public async migrateFromSettings(): Promise<boolean> {
        // If there are already profiles, don't migrate
        if (this._profiles.profiles.length > 0) {
            return false;
        }
        
        // Get old settings
        const config = vscode.workspace.getConfiguration('openfortivpn-connector');
        const host = config.get('host') as string;
        const port = config.get('port') as string;
        const username = config.get('username') as string;
        
        // Only migrate if there are old settings
        if (!host && !username) {
            return false;
        }
        
        // Create a profile from old settings
        await this.createProfile({
            name: 'Default',
            host,
            port,
            username
        });
        
        return true;
    }
}