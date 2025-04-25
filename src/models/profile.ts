/**
 * VPN Profile interface representing a single VPN connection configuration
 */
export interface VpnProfile {
    id: string;
    name: string;
    host: string;
    port: string;
    username: string;
    isActive?: boolean;
}

/**
 * VPN profiles collection interface
 */
export interface VpnProfiles {
    activeProfileId: string | null;
    profiles: VpnProfile[];
}

/**
 * Default empty profiles collection
 */
export const DEFAULT_PROFILES: VpnProfiles = {
    activeProfileId: null,
    profiles: []
};

/**
 * Generate a unique ID for new profiles
 */
export function generateProfileId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}