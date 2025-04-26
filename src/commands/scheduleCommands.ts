import * as vscode from 'vscode';
import { 
    VpnSchedule, 
    VpnScheduleType, 
    RepeatType, 
    Weekday, 
    generateScheduleId 
} from '../models/schedule';
import { ScheduleService } from '../services/scheduleService';
import { ProfileManager } from '../models/profileManager';
import { LogService } from '../services/logService';
import { VpnProfile } from '../models/profile';

/**
 * Register schedule-related commands
 */
export function registerScheduleCommands(
    context: vscode.ExtensionContext,
    scheduleService: ScheduleService,
    profileManager: ProfileManager
): void {
    const logger = LogService.getInstance();
    
    // Create new schedule
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.createSchedule', async () => {
            return createSchedule(scheduleService, profileManager);
        })
    );
    
    // Edit schedule
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.editSchedule', async (item) => {
            if (item && item.schedule) {
                return editSchedule(scheduleService, profileManager, item.schedule);
            }
        })
    );
    
    // Delete schedule
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.deleteSchedule', async (item) => {
            if (item && item.schedule) {
                return deleteSchedule(scheduleService, item.schedule);
            }
        })
    );
    
    // Toggle schedule enabled/disabled
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.toggleSchedule', async (item) => {
            if (item && item.schedule) {
                const enabled = await scheduleService.toggleScheduleEnabled(item.schedule.id);
                vscode.window.showInformationMessage(
                    `Schedule "${item.schedule.name}" has been ${enabled ? 'enabled' : 'disabled'}.`
                );
            }
        })
    );
    
    // Refresh schedules view
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.refreshSchedules', async () => {
            vscode.commands.executeCommand('openfortivpnSchedules.focus');
            logger.log('Refreshed schedules view');
        })
    );
}

/**
 * Create a new schedule
 */
async function createSchedule(
    scheduleService: ScheduleService,
    profileManager: ProfileManager
): Promise<VpnSchedule | undefined> {
    // Schedule name input
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the schedule',
        placeHolder: 'My VPN Schedule'
    });
    
    if (!name) {
        return undefined; // User canceled
    }
    
    // Schedule type selection
    const typeOptions = [
        { label: 'VPN Connect', description: 'Connect to VPN at scheduled time', value: VpnScheduleType.Connect },
        { label: 'VPN Disconnect', description: 'Disconnect VPN at scheduled time', value: VpnScheduleType.Disconnect }
    ];
    
    const selectedType = await vscode.window.showQuickPick(typeOptions, {
        placeHolder: 'Select schedule type'
    });
    
    if (!selectedType) {
        return undefined; // User canceled
    }
    
    // For connect type, select profile
    let profileId = '';
    if (selectedType.value === VpnScheduleType.Connect) {
        const { profiles } = profileManager.getProfiles();
        
        if (profiles.length === 0) {
            vscode.window.showErrorMessage('No VPN profiles found. Please create a profile first.');
            return undefined;
        }
        
        const profileOptions = profiles.map(p => ({
            label: p.name,
            description: `${p.host}:${p.port} (${p.username})`,
            profile: p
        }));
        
        const selectedProfile = await vscode.window.showQuickPick(profileOptions, {
            placeHolder: 'Select VPN profile to connect'
        });
        
        if (!selectedProfile) {
            return undefined; // User canceled
        }
        
        profileId = selectedProfile.profile.id;
    }
    
    // Schedule time input (HH:MM format)
    const time = await vscode.window.showInputBox({
        prompt: 'Enter time (24-hour format)',
        placeHolder: '09:00',
        validateInput: (value) => {
            const pattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
            return pattern.test(value) ? null : 'Time must be in HH:MM format (e.g., 09:00, 14:30)';
        }
    });
    
    if (!time) {
        return undefined; // User canceled
    }
    
    // Repeat type selection
    const repeatOptions = [
        { label: 'Once', description: 'Run once at the specified time', value: RepeatType.Once },
        { label: 'Daily', description: 'Run every day at the specified time', value: RepeatType.Daily },
        { label: 'Weekly', description: 'Run on specific days of the week at the specified time', value: RepeatType.Weekly }
    ];
    
    const selectedRepeat = await vscode.window.showQuickPick(repeatOptions, {
        placeHolder: 'Select repeat type'
    });
    
    if (!selectedRepeat) {
        return undefined; // User canceled
    }
    
    // For weekly repeat, select days
    let weekdays: Weekday[] = [];
    if (selectedRepeat.value === RepeatType.Weekly) {
        const weekdayOptions = [
            { label: 'Sunday', value: 0 as Weekday },
            { label: 'Monday', value: 1 as Weekday },
            { label: 'Tuesday', value: 2 as Weekday },
            { label: 'Wednesday', value: 3 as Weekday },
            { label: 'Thursday', value: 4 as Weekday },
            { label: 'Friday', value: 5 as Weekday },
            { label: 'Saturday', value: 6 as Weekday }
        ];
        
        const selectedWeekdays = await vscode.window.showQuickPick(weekdayOptions, {
            placeHolder: 'Select days of the week (multiple selection possible)',
            canPickMany: true
        });
        
        if (!selectedWeekdays || selectedWeekdays.length === 0) {
            return undefined; // User canceled or no selection
        }
        
        weekdays = selectedWeekdays.map(d => d.value);
    }
    
    // Enabled by default
    const enabledOptions = [
        { label: 'Yes', description: 'Schedule will be active immediately', value: true },
        { label: 'No', description: 'Schedule will be created but not active', value: false }
    ];
    
    const selectedEnabled = await vscode.window.showQuickPick(enabledOptions, {
        placeHolder: 'Enable this schedule?'
    });
    
    if (!selectedEnabled) {
        return undefined; // User canceled
    }
    
    // Create schedule
    const schedule = await scheduleService.createSchedule({
        name,
        type: selectedType.value,
        profileId,
        time,
        repeatType: selectedRepeat.value,
        weekdays: selectedRepeat.value === RepeatType.Weekly ? weekdays : undefined,
        enabled: selectedEnabled.value
    });
    
    vscode.window.showInformationMessage(`VPN schedule "${name}" has been created.`);
    
    return schedule;
}

/**
 * Edit an existing schedule
 */
async function editSchedule(
    scheduleService: ScheduleService,
    profileManager: ProfileManager,
    schedule: VpnSchedule
): Promise<VpnSchedule | undefined> {
    // Schedule name input
    const name = await vscode.window.showInputBox({
        prompt: 'Enter schedule name',
        value: schedule.name
    });
    
    if (name === undefined) {
        return undefined; // User canceled
    }
    
    // Schedule type cannot be changed (to reduce complexity)
    let profileId = schedule.profileId;
    
    // For connect schedules, select profile
    if (schedule.type === VpnScheduleType.Connect) {
        const { profiles } = profileManager.getProfiles();
        
        const profileOptions = profiles.map(p => ({
            label: p.name,
            description: `${p.host}:${p.port} (${p.username})`,
            profile: p
        }));
        
        // Highlight current profile
        const currentProfile = profiles.find(p => p.id === schedule.profileId);
        if (currentProfile) {
            profileOptions.forEach(option => {
                if (option.profile.id === currentProfile.id) {
                    option.label = `$(check) ${option.label}`;
                }
            });
        }
        
        const selectedProfile = await vscode.window.showQuickPick(profileOptions, {
            placeHolder: 'Select VPN profile to connect'
        });
        
        if (selectedProfile === undefined) {
            return undefined; // User canceled
        }
        
        profileId = selectedProfile.profile.id;
    }
    
    // Schedule time input
    const time = await vscode.window.showInputBox({
        prompt: 'Enter time (24-hour format)',
        value: schedule.time,
        validateInput: (value) => {
            const pattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
            return pattern.test(value) ? null : 'Time must be in HH:MM format (e.g., 09:00, 14:30)';
        }
    });
    
    if (time === undefined) {
        return undefined; // User canceled
    }
    
    // Repeat type selection
    const repeatOptions = [
        { label: 'Once', description: 'Run once at the specified time', value: RepeatType.Once },
        { label: 'Daily', description: 'Run every day at the specified time', value: RepeatType.Daily },
        { label: 'Weekly', description: 'Run on specific days of the week at the specified time', value: RepeatType.Weekly }
    ];
    
    // Highlight current repeat type
    repeatOptions.forEach(option => {
        if (option.value === schedule.repeatType) {
            option.label = `$(check) ${option.label}`;
        }
    });
    
    const selectedRepeat = await vscode.window.showQuickPick(repeatOptions, {
        placeHolder: 'Select repeat type'
    });
    
    if (selectedRepeat === undefined) {
        return undefined; // User canceled
    }
    
    // For weekly repeat, select days
    let weekdays: Weekday[] = schedule.weekdays || [];
    if (selectedRepeat.value === RepeatType.Weekly) {
        const weekdayOptions = [
            { label: 'Sunday', value: 0 as Weekday },
            { label: 'Monday', value: 1 as Weekday },
            { label: 'Tuesday', value: 2 as Weekday },
            { label: 'Wednesday', value: 3 as Weekday },
            { label: 'Thursday', value: 4 as Weekday },
            { label: 'Friday', value: 5 as Weekday },
            { label: 'Saturday', value: 6 as Weekday }
        ];
        
        // Highlight current selected days
        weekdayOptions.forEach(option => {
            if (schedule.weekdays && schedule.weekdays.includes(option.value)) {
                option.label = `$(check) ${option.label}`;
            }
        });
        
        const selectedWeekdays = await vscode.window.showQuickPick(weekdayOptions, {
            placeHolder: 'Select days of the week (multiple selection possible)',
            canPickMany: true
        });
        
        if (selectedWeekdays === undefined) {
            return undefined; // User canceled
        }
        
        if (selectedWeekdays.length === 0) {
            vscode.window.showWarningMessage('At least one day of the week must be selected');
            return undefined;
        }
        
        weekdays = selectedWeekdays.map(d => d.value);
    }
    
    // Update schedule
    const updatedSchedule: VpnSchedule = {
        ...schedule,
        name,
        profileId,
        time,
        repeatType: selectedRepeat.value,
        weekdays: selectedRepeat.value === RepeatType.Weekly ? weekdays : undefined
        // Keep enabled state as is
    };
    
    await scheduleService.updateSchedule(updatedSchedule);
    
    vscode.window.showInformationMessage(`VPN schedule "${name}" has been updated.`);
    
    return updatedSchedule;
}

/**
 * Delete a schedule
 */
async function deleteSchedule(
    scheduleService: ScheduleService,
    schedule: VpnSchedule
): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete the VPN schedule "${schedule.name}"?`,
        { modal: true },
        'Delete'
    );
    
    if (confirm !== 'Delete') {
        return false;
    }
    
    await scheduleService.deleteSchedule(schedule.id);
    vscode.window.showInformationMessage(`VPN schedule "${schedule.name}" has been deleted.`);
    
    return true;
}