import * as vscode from 'vscode';

/**
 * Log Service - Manages VPN connection logs
 */
export class LogService {
    private static _instance: LogService;
    private _outputChannel: vscode.OutputChannel;
    
    private constructor() {
        this._outputChannel = vscode.window.createOutputChannel('OpenFortiVPN');
    }
    
    /**
     * Get the log service instance (Singleton pattern)
     */
    public static getInstance(): LogService {
        if (!LogService._instance) {
            LogService._instance = new LogService();
        }
        return LogService._instance;
    }
    
    /**
     * Write a general log
     * @param message Log message
     * @param showNotification Whether to show a notification
     */
    public log(message: string, showNotification: boolean = false): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        
        this._outputChannel.appendLine(logMessage);
        
        if (showNotification) {
            vscode.window.showInformationMessage(message);
        }
    }
    
    /**
     * Write an error log
     * @param message Error message
     * @param error Error object (optional)
     * @param showNotification Whether to show a notification
     */
    public error(message: string, error?: any, showNotification: boolean = true): void {
        const timestamp = new Date().toISOString();
        let logMessage = `[${timestamp}] ERROR: ${message}`;
        
        if (error) {
            logMessage += `\n${error.toString()}`;
            if (error.stack) {
                logMessage += `\n${error.stack}`;
            }
        }
        
        this._outputChannel.appendLine(logMessage);
        
        if (showNotification) {
            vscode.window.showErrorMessage(message);
        }
    }
    
    /**
     * Show the log output channel
     */
    public show(): void {
        this._outputChannel.show();
    }
    
    /**
     * Release log resources
     */
    public dispose(): void {
        this._outputChannel.dispose();
    }
}