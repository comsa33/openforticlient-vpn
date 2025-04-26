/**
 * VPN schedule type (connect or disconnect)
 */
export enum VpnScheduleType {
    Connect = 'connect',
    Disconnect = 'disconnect'
}

/**
 * Repeat type (once, daily, weekly)
 */
export enum RepeatType {
    Once = 'once',
    Daily = 'daily',
    Weekly = 'weekly'
}

/**
 * Weekday (0: Sunday, 1: Monday, ..., 6: Saturday)
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * VPN schedule interface
 */
export interface VpnSchedule {
    id: string;
    name: string;
    profileId: string;  // Profile ID to connect (optional for disconnect schedules)
    type: VpnScheduleType;
    time: string;       // Format: "HH:MM" (24-hour format)
    repeatType: RepeatType;
    weekdays?: Weekday[]; // Required for RepeatType.Weekly
    enabled: boolean;
    lastRun?: number;    // Last execution time (Unix timestamp)
    nextRun?: number;    // Next scheduled execution time (Unix timestamp)
}

/**
 * VPN schedules collection interface
 */
export interface VpnSchedules {
    schedules: VpnSchedule[];
}

/**
 * Default empty schedules collection
 */
export const DEFAULT_SCHEDULES: VpnSchedules = {
    schedules: []
};

/**
 * Generate unique schedule ID
 */
export function generateScheduleId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Get weekday name (English)
 */
export function getWeekdayName(day: Weekday): string {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[day];
}

/**
 * Generate schedule description
 */
export function getScheduleDescription(schedule: VpnSchedule): string {
    let description = `${schedule.time}`;
    
    if (schedule.repeatType === RepeatType.Once) {
        description += ' (Once)';
    } else if (schedule.repeatType === RepeatType.Daily) {
        description += ' (Daily)';
    } else if (schedule.repeatType === RepeatType.Weekly && schedule.weekdays) {
        const weekdayNames = schedule.weekdays.map(day => getWeekdayName(day).substring(0, 3)).join(', ');
        description += ` (${weekdayNames})`;
    }
    
    // Add next run information if available
    if (schedule.nextRun && schedule.enabled) {
        const nextRunDate = new Date(schedule.nextRun);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Format the date part based on when it will run
        let dateStr = '';
        if (nextRunDate.toDateString() === today.toDateString()) {
            dateStr = 'Today';
        } else if (nextRunDate.toDateString() === tomorrow.toDateString()) {
            dateStr = 'Tomorrow';
        } else {
            dateStr = nextRunDate.toLocaleDateString();
        }
        
        description += ` - Next: ${dateStr}`;
    }
    
    return description;
}

/**
 * Calculate next run time
 */
export function calculateNextRun(schedule: VpnSchedule): number {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);
    
    // Base time to start with (today at the specified time)
    // Note: JavaScript Date is zero-indexed for months, but we're handling year/month/date
    // directly from now object so no adjustment needed
    const targetTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        hours,
        minutes,
        0,
        0 // Set milliseconds to 0 for precise comparison
    );
    
    // Add extra logging here to verify calculation
    console.log(`Calculating next run for "${schedule.name}":
        - Target time: ${targetTime.toLocaleString()}
        - Now: ${now.toLocaleString()}
        - Repeat type: ${schedule.repeatType}
        - Time: ${schedule.time}`);
    
    // If target time has already passed today, calculate next occurrence
    if (targetTime.getTime() <= now.getTime()) {
        if (schedule.repeatType === RepeatType.Once) {
            // For one-time schedule, set to tomorrow same time
            targetTime.setDate(targetTime.getDate() + 1);
            console.log(`- One time schedule, moved to tomorrow: ${targetTime.toLocaleString()}`);
        } else if (schedule.repeatType === RepeatType.Daily) {
            // For daily schedule, set to tomorrow same time
            targetTime.setDate(targetTime.getDate() + 1);
            console.log(`- Daily schedule, moved to tomorrow: ${targetTime.toLocaleString()}`);
        } else if (schedule.repeatType === RepeatType.Weekly && schedule.weekdays) {
            // For weekly schedule, find the next specified weekday
            const currentDayOfWeek = now.getDay();
            
            // Sort weekdays to make search easier
            const sortedWeekdays = [...schedule.weekdays].sort((a, b) => a - b);
            console.log(`- Weekly schedule, current day: ${currentDayOfWeek}, available days: ${sortedWeekdays.join(',')}`);
            
            // Find next weekday after current day
            const nextDay = sortedWeekdays.find(day => day > currentDayOfWeek);
            
            if (nextDay !== undefined) {
                // Found a day later this week
                const daysToAdd = nextDay - currentDayOfWeek;
                targetTime.setDate(targetTime.getDate() + daysToAdd);
                console.log(`- Found day later this week (${nextDay}), adding ${daysToAdd} days: ${targetTime.toLocaleString()}`);
            } else {
                // No days later this week, go to first day next week
                const firstDayNextWeek = sortedWeekdays[0];
                const daysToAdd = 7 - currentDayOfWeek + firstDayNextWeek;
                targetTime.setDate(targetTime.getDate() + daysToAdd);
                console.log(`- No days later this week, going to next week day ${firstDayNextWeek}, adding ${daysToAdd} days: ${targetTime.toLocaleString()}`);
            }
        }
    } else {
        // Target time is still in the future today
        console.log(`- Target time is in the future today`);
        
        // Check if it's a weekly schedule and today is not in the specified weekdays
        if (schedule.repeatType === RepeatType.Weekly && schedule.weekdays) {
            const currentDayOfWeek = now.getDay();
            
            // If today is not in the specified weekdays, find the next weekday
            if (!schedule.weekdays.includes(currentDayOfWeek as Weekday)) {
                console.log(`- Today (${currentDayOfWeek}) is not in specified weekdays ${schedule.weekdays.join(',')}`);
                
                const sortedWeekdays = [...schedule.weekdays].sort((a, b) => a - b);
                
                // Find next weekday after current day
                const nextDay = sortedWeekdays.find(day => day > currentDayOfWeek);
                
                if (nextDay !== undefined) {
                    // Found a day later this week
                    const daysToAdd = nextDay - currentDayOfWeek;
                    targetTime.setDate(targetTime.getDate() + daysToAdd);
                    console.log(`- Moving to day ${nextDay}, adding ${daysToAdd} days: ${targetTime.toLocaleString()}`);
                } else {
                    // No days later this week, go to first day next week
                    const firstDayNextWeek = sortedWeekdays[0];
                    const daysToAdd = 7 - currentDayOfWeek + firstDayNextWeek;
                    targetTime.setDate(targetTime.getDate() + daysToAdd);
                    console.log(`- No days this week, moving to next week day ${firstDayNextWeek}, adding ${daysToAdd} days: ${targetTime.toLocaleString()}`);
                }
            } else {
                console.log(`- Today (${currentDayOfWeek}) is in specified weekdays, keeping today's date`);
            }
        }
    }
    
    console.log(`- Final next run time: ${targetTime.toLocaleString()} (${targetTime.getTime()})`);
    return targetTime.getTime();
}

/**
 * Check if a schedule should be executed
 */
export function shouldRunSchedule(schedule: VpnSchedule): boolean {
    if (!schedule.enabled || !schedule.nextRun) {
        return false;
    }
    
    const now = Date.now();
    
    // Schedule should run if current time has reached or passed the next run time
    // and it hasn't been executed since the last scheduled time
    return now >= schedule.nextRun && (!schedule.lastRun || schedule.lastRun < schedule.nextRun);
}