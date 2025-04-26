import * as vscode from 'vscode';
import { MetricsService } from '../services/metricsService';
import { LogService } from '../services/logService';

/**
 * Register metrics-related commands
 */
export function registerMetricsCommands(
    context: vscode.ExtensionContext
): void {
    const metricsService = MetricsService.getInstance(context);
    const logger = LogService.getInstance();
    
    // Show metrics view
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.showMetrics', () => {
            vscode.commands.executeCommand('openfortivpnMetrics.focus');
            logger.log('Opened VPN Metrics view');
        })
    );
    
    // Clear all metrics data
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.clearMetrics', async () => {
            const confirmed = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all VPN connection metrics data?',
                { modal: true },
                'Yes, Clear All Data'
            );
            
            if (confirmed === 'Yes, Clear All Data') {
                await metricsService.clearAllMetrics();
                vscode.window.showInformationMessage('VPN metrics data has been cleared.');
                logger.log('Cleared all VPN metrics data', true);
            }
        })
    );
    
    // Export metrics data as JSON
    context.subscriptions.push(
        vscode.commands.registerCommand('openfortivpn-connector.exportMetrics', async () => {
            const historicalSessions = metricsService.getHistoricalSessions();
            
            if (historicalSessions.length === 0) {
                vscode.window.showInformationMessage('No VPN metrics data available to export.');
                return;
            }
            
            // Get the current date and time for the filename
            const now = new Date();
            const dateString = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            const timeString = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
            
            // Convert metrics data to JSON
            const metricsData = JSON.stringify(historicalSessions, null, 2);
            
            // Show save dialog
            const defaultUri = vscode.Uri.file(`vpn-metrics-${dateString}-${timeString}.json`);
            const fileUri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                    'JSON Files': ['json']
                }
            });
            
            if (fileUri) {
                // Write the data to the selected file
                try {
                    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(metricsData, 'utf8'));
                    vscode.window.showInformationMessage(`VPN metrics data exported to ${fileUri.fsPath}`);
                    logger.log(`Exported VPN metrics data to ${fileUri.fsPath}`, true);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to export metrics data: ${error}`);
                    logger.error('Failed to export metrics data', error);
                }
            }
        })
    );
}