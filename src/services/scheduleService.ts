import * as vscode from 'vscode';
import { 
    VpnSchedule, 
    VpnSchedules, 
    DEFAULT_SCHEDULES, 
    generateScheduleId,
    calculateNextRun,
    shouldRunSchedule
} from '../models/schedule';
import { ProfileManager } from '../models/profileManager';
import { VpnService } from './vpnService';
import { LogService } from './logService';

/**
 * Storage key for schedules data
 */
const SCHEDULES_STORAGE_KEY = 'openfortivpn-schedules';

/**
 * Schedule check interval (30 seconds by default)
 */
const DEFAULT_SCHEDULE_CHECK_INTERVAL = 30 * 1000;

/**
 * VPN schedule management service
 */
export class ScheduleService {
    private static _instance: ScheduleService;
    private _context: vscode.ExtensionContext;
    private _schedules: VpnSchedules;
    private _scheduleTimer: NodeJS.Timeout | null = null;
    private _onSchedulesChanged: vscode.EventEmitter<VpnSchedules> = new vscode.EventEmitter<VpnSchedules>();
    private _profileManager: ProfileManager;
    private _vpnService: VpnService;
    private _logger: LogService;
    private _checkInterval: number;
    
    /**
     * Schedule changed event
     */
    public readonly onSchedulesChanged: vscode.Event<VpnSchedules> = this._onSchedulesChanged.event;
    
    private constructor(
        context: vscode.ExtensionContext,
        profileManager: ProfileManager,
        vpnService: VpnService
    ) {
        this._context = context;
        this._profileManager = profileManager;
        this._vpnService = vpnService;
        this._logger = LogService.getInstance();
        this._schedules = this._loadSchedules();
        
        // Get configured check interval from settings
        const config = vscode.workspace.getConfiguration('openfortivpn-connector');
        this._checkInterval = config.get<number>('scheduleCheckInterval', 30) * 1000;
        if (this._checkInterval < 10000) {
            this._checkInterval = 10000; // Minimum 10 seconds
        }
        
        // Update all schedule next run times
        this._updateAllNextRunTimes();
        
        // Log the schedules for debugging
        this._logger.log(`Loaded ${this._schedules.schedules.length} schedules`);
        this._schedules.schedules.forEach(schedule => {
            if (schedule.enabled) {
                const nextRunText = schedule.nextRun 
                    ? new Date(schedule.nextRun).toLocaleString() 
                    : 'Not calculated';
                this._logger.log(`Schedule "${schedule.name}" (${schedule.type}) - Next run: ${nextRunText}`);
            }
        });
        
        // Start schedule check timer with immediate first check
        this._logger.log('Starting schedule check timer with interval: ' + (this._checkInterval / 1000) + 's');
        
        // First do an immediate check
        this._checkSchedules().catch(err => 
            this._logger.error('Error in initial schedule check', err)
        );
        
        // Then start the regular interval
        this._scheduleTimer = setInterval(() => this._checkSchedules(), this._checkInterval);
        
        // Add listener for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('openfortivpn-connector.scheduleCheckInterval')) {
                    this._updateCheckInterval();
                }
            })
        );
    }
    
    /**
     * Update check interval from settings
     */
    private _updateCheckInterval(): void {
        const config = vscode.workspace.getConfiguration('openfortivpn-connector');
        const newInterval = config.get<number>('scheduleCheckInterval', 30) * 1000;
        
        if (newInterval !== this._checkInterval) {
            this._checkInterval = newInterval;
            
            // Restart timer with new interval
            if (this._scheduleTimer) {
                clearInterval(this._scheduleTimer);
                this._scheduleTimer = setInterval(() => this._checkSchedules(), this._checkInterval);
                this._logger.log('Schedule check interval updated to: ' + (this._checkInterval / 1000) + 's');
            }
        }
    }
    
    /**
     * Get schedule service instance (singleton pattern)
     */
    public static getInstance(
        context?: vscode.ExtensionContext,
        profileManager?: ProfileManager,
        vpnService?: VpnService
    ): ScheduleService {
        if (!ScheduleService._instance && context && profileManager && vpnService) {
            ScheduleService._instance = new ScheduleService(context, profileManager, vpnService);
        } else if (!ScheduleService._instance && (!context || !profileManager || !vpnService)) {
            throw new Error('ScheduleService needs to be initialized with context, profileManager, and vpnService first');
        }
        
        return ScheduleService._instance;
    }
    
    /**
     * Load schedules from storage
     */
    private _loadSchedules(): VpnSchedules {
        const data = this._context.globalState.get<VpnSchedules>(SCHEDULES_STORAGE_KEY);
        return data || { ...DEFAULT_SCHEDULES };
    }
    
    /**
     * Save schedules to storage
     */
    private async _saveSchedules(): Promise<void> {
        await this._context.globalState.update(SCHEDULES_STORAGE_KEY, this._schedules);
        this._onSchedulesChanged.fire(this._schedules);
    }
    
    /**
     * Update all schedules' next run times
     */
    private _updateAllNextRunTimes(): void {
        const now = Date.now();
        let updated = false;
        
        for (const schedule of this._schedules.schedules) {
            if (schedule.enabled) {
                // Only recalculate if not set or in the past
                if (!schedule.nextRun || schedule.nextRun < now) {
                    schedule.nextRun = calculateNextRun(schedule);
                    updated = true;
                    this._logger.log(`Updated next run time for schedule "${schedule.name}": ${new Date(schedule.nextRun).toLocaleString()}`);
                }
            }
        }
        
        if (updated) {
            this._saveSchedules().catch(err => 
                this._logger.error('Error saving schedules after updating run times', err)
            );
        }
    }
    
    /**
     * Get all schedules
     */
    public getSchedules(): VpnSchedules {
        return { ...this._schedules };
    }
    
    /**
     * Get a specific schedule by ID
     */
    public getScheduleById(id: string): VpnSchedule | undefined {
        return this._schedules.schedules.find(s => s.id === id);
    }
    
    /**
     * Create a new schedule
     */
    public async createSchedule(schedule: Omit<VpnSchedule, 'id' | 'nextRun' | 'lastRun'>): Promise<VpnSchedule> {
        const newSchedule: VpnSchedule = {
            id: generateScheduleId(),
            ...schedule,
            nextRun: 0,
            lastRun: undefined
        };
        
        // Calculate next run time
        newSchedule.nextRun = calculateNextRun(newSchedule);
        
        // Add schedule
        this._schedules.schedules.push(newSchedule);
        await this._saveSchedules();
        
        this._logger.log(`New schedule created: "${newSchedule.name}", next run: ${new Date(newSchedule.nextRun).toLocaleString()}`);
        
        return newSchedule;
    }
    
    /**
     * Update a schedule
     */
    public async updateSchedule(schedule: VpnSchedule): Promise<void> {
        const index = this._schedules.schedules.findIndex(s => s.id === schedule.id);
        
        if (index === -1) {
            throw new Error(`Schedule with ID ${schedule.id} not found`);
        }
        
        // Update schedule
        this._schedules.schedules[index] = { ...schedule };
        
        // Update next run time
        this._schedules.schedules[index].nextRun = calculateNextRun(this._schedules.schedules[index]);
        
        await this._saveSchedules();
        
        this._logger.log(`Schedule "${schedule.name}" updated, next run: ${new Date(this._schedules.schedules[index].nextRun).toLocaleString()}`);
    }
    
    /**
     * Delete a schedule
     */
    public async deleteSchedule(id: string): Promise<void> {
        const index = this._schedules.schedules.findIndex(s => s.id === id);
        
        if (index === -1) {
            throw new Error(`Schedule with ID ${id} not found`);
        }
        
        const scheduleName = this._schedules.schedules[index].name;
        
        // Remove schedule
        this._schedules.schedules.splice(index, 1);
        await this._saveSchedules();
        
        this._logger.log(`Schedule "${scheduleName}" has been deleted`);
    }
    
    /**
     * Toggle schedule enabled state
     */
    public async toggleScheduleEnabled(id: string): Promise<boolean> {
        const index = this._schedules.schedules.findIndex(s => s.id === id);
        
        if (index === -1) {
            throw new Error(`Schedule with ID ${id} not found`);
        }
        
        // Toggle enabled state
        this._schedules.schedules[index].enabled = !this._schedules.schedules[index].enabled;
        
        // Update next run time if enabled
        if (this._schedules.schedules[index].enabled) {
            this._schedules.schedules[index].nextRun = calculateNextRun(this._schedules.schedules[index]);
        }
        
        await this._saveSchedules();
        
        const statusText = this._schedules.schedules[index].enabled ? 'enabled' : 'disabled';
        this._logger.log(`Schedule "${this._schedules.schedules[index].name}" has been ${statusText}`);
        
        return this._schedules.schedules[index].enabled;
    }
    
    /**
     * Run a schedule (manual)
     */
    public async runSchedule(id: string): Promise<boolean> {
        const schedule = this._schedules.schedules.find(s => s.id === id);
        
        if (!schedule) {
            throw new Error(`Schedule with ID ${id} not found`);
        }
        
        this._logger.log(`Manually running schedule "${schedule.name}"`);
        return this._executeSchedule(schedule, true);
    }
    
    /**
     * Check schedules (automatic execution)
     */
    private async _checkSchedules(): Promise<void> {
        // Check for runnable schedules
        const now = Date.now();
        const margin = this._checkInterval; // Use check interval as margin to avoid missing scheduled times
        
        // Debug log to verify the service is checking schedules
        this._logger.log(`Checking schedules at ${new Date(now).toLocaleString()}`);
        
        // Find schedules ready to run
        const runnableSchedules = this._schedules.schedules.filter(s => {
            // Must be enabled and have a next run time
            if (!s.enabled || !s.nextRun) {
                return false;
            }
            
            // Check if current time has reached or passed the scheduled time 
            // Add a margin to actually use the defined margin to avoid missing scheduled times 
            // that occur between checks
            const isTimeToRun = now >= (s.nextRun - margin);
            const hasNotRunYet = !s.lastRun || s.lastRun < s.nextRun;
            
            // Improved clarity with explicit conditions
            if (isTimeToRun && hasNotRunYet) {
                this._logger.log(`Schedule "${s.name}" is ready to run:
                    - Current time: ${new Date(now).toLocaleString()}
                    - Scheduled time: ${new Date(s.nextRun).toLocaleString()}
                    - Last run: ${s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never'}
                    - Using margin of ${margin/1000} seconds`);
                return true;
            }
            
            return false;
        });
        
        if (runnableSchedules.length === 0) {
            // No need to log every time, but useful for debugging
            // this._logger.log(`No schedules ready to run at ${new Date(now).toLocaleString()}`);
            return;
        }
        
        this._logger.log(`Found ${runnableSchedules.length} schedule(s) ready to run`);
        
        // Execute runnable schedules
        for (const schedule of runnableSchedules) {
            await this._executeSchedule(schedule, false);
        }
        
        // Save schedules
        await this._saveSchedules();
    }
    
    /**
     * Execute a schedule (actual connect/disconnect)
     */
    private async _executeSchedule(schedule: VpnSchedule, isManual: boolean): Promise<boolean> {
        try {
            this._logger.log(`Executing schedule "${schedule.name}" (type: ${schedule.type}, ${isManual ? 'manual' : 'automatic'})`);
            
            let success = false;
            
            // Perform action based on schedule type
            if (schedule.type === 'connect') {
                // Get connection profile
                const profiles = this._profileManager.getProfiles();
                const profile = profiles.profiles.find(p => p.id === schedule.profileId);
                
                if (!profile) {
                    this._logger.error(`Failed to execute schedule "${schedule.name}": Profile ID ${schedule.profileId} not found`);
                    return false;
                }
                
                // Connect to VPN
                this._logger.log(`Schedule "${schedule.name}" is connecting to VPN using profile "${profile.name}"`);
                success = await this._vpnService.connect(profile, false);
                
                if (success) {
                    this._logger.log(`Schedule "${schedule.name}" successfully connected to VPN`, true);
                    vscode.window.showInformationMessage(`Schedule "${schedule.name}" connected to VPN`);
                } else {
                    this._logger.error(`Schedule "${schedule.name}" failed to connect to VPN`);
                    if (isManual) {
                        vscode.window.showErrorMessage(`Schedule "${schedule.name}" failed to connect to VPN. Check logs for details.`);
                    }
                }
            } else if (schedule.type === 'disconnect') {
                // Disconnect VPN
                if (this._vpnService.isConnected) {
                    this._logger.log(`Schedule "${schedule.name}" is disconnecting from VPN`);
                    success = await this._vpnService.disconnect(false);
                    this._logger.log(`Schedule "${schedule.name}" successfully disconnected from VPN`, true);
                    vscode.window.showInformationMessage(`Schedule "${schedule.name}" disconnected VPN`);
                } else {
                    // Already disconnected is considered success
                    success = true;
                    this._logger.log(`Schedule "${schedule.name}" execution: VPN is already disconnected`);
                    if (isManual) {
                        vscode.window.showInformationMessage(`VPN is already disconnected`);
                    }
                }
            }
            
            // Update schedule execution info
            schedule.lastRun = Date.now();
            
            // One-time schedules should be disabled after execution
            if (schedule.repeatType === 'once') {
                schedule.enabled = false;
                this._logger.log(`One-time schedule "${schedule.name}" has been disabled after execution`);
            } else {
                // Update next run time
                schedule.nextRun = calculateNextRun(schedule);
                this._logger.log(`Next run for schedule "${schedule.name}": ${new Date(schedule.nextRun).toLocaleString()}`);
            }
            
            await this._saveSchedules();
            return success;
        } catch (error) {
            this._logger.error(`Error executing schedule "${schedule.name}"`, error);
            if (isManual) {
                vscode.window.showErrorMessage(`Error executing schedule "${schedule.name}": ${error}`);
            }
            return false;
        }
    }
    
    /**
     * Release resources
     */
    public dispose(): void {
        if (this._scheduleTimer) {
            clearInterval(this._scheduleTimer);
            this._scheduleTimer = null;
            this._logger.log('Schedule service timer stopped');
        }
    }
}