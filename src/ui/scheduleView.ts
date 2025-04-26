import * as vscode from 'vscode';
import { 
    VpnSchedule, 
    VpnScheduleType, 
    RepeatType,
    getScheduleDescription,
    getWeekdayName 
} from '../models/schedule';
import { ScheduleService } from '../services/scheduleService';
import { ProfileManager } from '../models/profileManager';
import { LogService } from '../services/logService';
import { VpnProfile } from '../models/profile';

/**
 * Schedule tree item
 */
export class ScheduleTreeItem extends vscode.TreeItem {
    constructor(
        public readonly schedule: VpnSchedule,
        public readonly profileName: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(schedule.name, collapsibleState);
        
        // Set description (schedule time and details)
        this.description = getScheduleDescription(schedule);
        
        // Set tooltip
        let tooltip = `${schedule.name}\n`;
        tooltip += `Type: ${schedule.type === 'connect' ? 'Connect' : 'Disconnect'}\n`;
        tooltip += `Time: ${schedule.time}\n`;
        
        if (schedule.repeatType === RepeatType.Once) {
            tooltip += 'Repeat: Once\n';
        } else if (schedule.repeatType === RepeatType.Daily) {
            tooltip += 'Repeat: Daily\n';
        } else if (schedule.repeatType === RepeatType.Weekly && schedule.weekdays) {
            const weekdayNames = schedule.weekdays.map(day => getWeekdayName(day)).join(', ');
            tooltip += `Repeat: Weekly on ${weekdayNames}\n`;
        }
        
        if (schedule.type === 'connect') {
            tooltip += `Profile: ${profileName}`;
        }
        
        // Add execution status if available
        if (schedule.lastRun) {
            const lastRunDate = new Date(schedule.lastRun);
            tooltip += `\nLast Run: ${lastRunDate.toLocaleString()}`;
        }
        
        if (schedule.nextRun && schedule.enabled) {
            const nextRunDate = new Date(schedule.nextRun);
            tooltip += `\nNext Run: ${nextRunDate.toLocaleString()}`;
        }
        
        this.tooltip = tooltip;
        
        // Set icons based on schedule type and status
        if (schedule.type === 'connect') {
            if (schedule.enabled) {
              this.iconPath = new vscode.ThemeIcon('plug', schedule.lastRun ? 
                new vscode.ThemeColor('charts.green') : undefined);
            } else {
              this.iconPath = new vscode.ThemeIcon('plug', 
                new vscode.ThemeColor('disabledForeground'));
            }
          } else { // disconnect
            if (schedule.enabled) {
              this.iconPath = new vscode.ThemeIcon('debug-disconnect', schedule.lastRun ? 
                new vscode.ThemeColor('charts.red') : undefined);
            } else {
              this.iconPath = new vscode.ThemeIcon('debug-disconnect', 
                new vscode.ThemeColor('disabledForeground'));
            }
          }
        
        // Set context value for command visibility - ensure this matches package.json when conditions
        this.contextValue = schedule.enabled ? 'enabledSchedule' : 'disabledSchedule';
    }
}

/**
 * Schedules tree data provider
 */
export class SchedulesProvider implements vscode.TreeDataProvider<ScheduleTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ScheduleTreeItem | undefined> = new vscode.EventEmitter<ScheduleTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ScheduleTreeItem | undefined> = this._onDidChangeTreeData.event;
    
    private _scheduleService: ScheduleService;
    private _profileManager: ProfileManager;
    private _logger: LogService;
    
    constructor(
        scheduleService: ScheduleService,
        profileManager: ProfileManager
    ) {
        this._scheduleService = scheduleService;
        this._profileManager = profileManager;
        this._logger = LogService.getInstance();
        
        // Refresh view when schedules change
        this._scheduleService.onSchedulesChanged(() => {
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
    getTreeItem(element: ScheduleTreeItem): vscode.TreeItem {
        // 토글 커맨드와 아이콘 설정
        element.command = {
            command: 'openfortivpn-connector.toggleScheduleFromTreeItem',
            title: 'Toggle Schedule',
            arguments: [element]
        };
        
        // 원래 있던 return은 유지
        return element;
    }
    
    /**
     * Get children elements for a given element
     */
    getChildren(element?: ScheduleTreeItem): Thenable<ScheduleTreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        
        const { schedules } = this._scheduleService.getSchedules();
        const { profiles } = this._profileManager.getProfiles();
        
        // Create tree items for schedules
        const treeItems = schedules.map(schedule => {
            // Get profile name for connect schedules
            let profileName = 'Unknown';
            
            if (schedule.type === 'connect') {
                const profile = profiles.find(p => p.id === schedule.profileId);
                if (profile) {
                    profileName = profile.name;
                }
            }
            
            return new ScheduleTreeItem(
                schedule,
                profileName,
                vscode.TreeItemCollapsibleState.None
            );
        });
        
        // Sort schedules: enabled first, then by next run time
        treeItems.sort((a, b) => {
            // Enabled schedules first
            if (a.schedule.enabled !== b.schedule.enabled) {
                return a.schedule.enabled ? -1 : 1;
            }
            
            // Then by next run time (if available)
            if (a.schedule.enabled && b.schedule.enabled && a.schedule.nextRun && b.schedule.nextRun) {
                return a.schedule.nextRun - b.schedule.nextRun;
            }
            
            // Then by name
            return a.schedule.name.localeCompare(b.schedule.name);
        });
        
        return Promise.resolve(treeItems);
    }
}

/**
 * Register schedules view in the activity bar
 */
export function registerSchedulesView(
    context: vscode.ExtensionContext,
    scheduleService: ScheduleService,
    profileManager: ProfileManager
): vscode.TreeView<ScheduleTreeItem> {
    const logger = LogService.getInstance();
    logger.log('Registering schedules tree view');
    
    const schedulesProvider = new SchedulesProvider(scheduleService, profileManager);
    
    // Create tree view
    const treeView = vscode.window.createTreeView('openfortivpnSchedules', {
        treeDataProvider: schedulesProvider,
        showCollapseAll: false
    });
    
    // Register toggle command for quick access
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.toggleScheduleFromTreeItem', async (item) => {
            if (item && item.schedule) {
                const enabled = await scheduleService.toggleScheduleEnabled(item.schedule.id);
                vscode.window.showInformationMessage(
                    `Schedule "${item.schedule.name}" has been ${enabled ? 'enabled' : 'disabled'}.`
                );
            }
        })
    );
    
    // Clean up on dispose
    context.subscriptions.push(treeView);
    
    return treeView;
}