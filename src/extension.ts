import * as vscode from 'vscode';
import * as cp from 'child_process';

// Global variables for VPN process management
let vpnProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;
let isConnected = false;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenFortiVPN Connector has been activated.');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(shield) VPN: Disconnected";
    statusBarItem.command = 'openfortivpn-connector.toggle';
    statusBarItem.tooltip = "Toggle OpenFortiVPN Connection";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register configuration command
    let configCommand = vscode.commands.registerCommand('openfortivpn-connector.config', async () => {
        await configureVPN();
    });

    // Register toggle command
    let toggleCommand = vscode.commands.registerCommand('openfortivpn-connector.toggle', () => {
        if (isConnected) {
            disconnectVPN();
        } else {
            connectVPN();
        }
    });

    context.subscriptions.push(configCommand, toggleCommand);

    // Set interval for status checking
    setInterval(checkVPNStatus, 10000);
}

// VPN configuration function
async function configureVPN() {
    // Get current configuration
    const config = vscode.workspace.getConfiguration('openfortivpn-connector');
    
    // Host configuration
    const host = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway address',
        value: config.get('host') as string
    });
    
    if (host !== undefined) {
        await config.update('host', host, vscode.ConfigurationTarget.Global);
    } else {
        return; // User canceled
    }
    
    // Port configuration
    const port = await vscode.window.showInputBox({
        prompt: 'Enter the VPN gateway port',
        value: config.get('port') as string || '443'
    });
    
    if (port !== undefined) {
        await config.update('port', port, vscode.ConfigurationTarget.Global);
    }
    
    // Username configuration
    const username = await vscode.window.showInputBox({
        prompt: 'Enter the username',
        value: config.get('username') as string
    });
    
    if (username !== undefined) {
        await config.update('username', username, vscode.ConfigurationTarget.Global);
    }
    
    vscode.window.showInformationMessage('OpenFortiVPN configuration has been saved.');
}

// VPN connection function
async function connectVPN() {
    // Check configuration
    const config = vscode.workspace.getConfiguration('openfortivpn-connector');
    const host = config.get('host') as string;
    const port = config.get('port') as string;
    const username = config.get('username') as string;
    
    if (!host || !username) {
        const setup = await vscode.window.showWarningMessage(
            'OpenFortiVPN configuration is required.', 
            'Configure'
        );
        
        if (setup === 'Configure') {
            await configureVPN();
            return;
        } else {
            return;
        }
    }
    
    // Enter password
    const password = await vscode.window.showInputBox({
        prompt: 'Enter the VPN password',
        password: true
    });
    
    if (!password) {
        return; // User canceled
    }
    
    try {
        const hostWithPort = port ? `${host}:${port}` : host;
        
        // Create terminal
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // Method 1: Handle password in two steps
        terminal.sendText(`sudo openfortivpn ${hostWithPort} -u ${username}`);
        
        // Delay slightly to allow password prompt to appear
        setTimeout(() => {
            terminal.sendText(password);
        }, 1000);
        
        // Update status
        isConnected = true;
        statusBarItem.text = "$(shield) VPN: Connecting...";
        
        // Start connection check (allow more time after password input)
        setTimeout(checkVPNStatus, 5000);
        
        vscode.window.showInformationMessage('Attempting to connect to OpenFortiVPN...');
    } catch (error) {
        vscode.window.showErrorMessage(`VPN connection failed: ${error}`);
    }
}

// VPN disconnection function
function disconnectVPN() {
    try {
        // Create terminal
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // Execute sudo pkill command
        terminal.sendText('sudo pkill -SIGTERM openfortivpn');
        
        // Update status
        isConnected = false;
        statusBarItem.text = "$(shield) VPN: Disconnected";
        
        vscode.window.showInformationMessage('OpenFortiVPN has been disconnected.');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to disconnect VPN: ${error}`);
    }
}

// VPN status check function
function checkVPNStatus() {
    // Command works on macOS and Linux
    const command = 'ip addr show ppp0 2>/dev/null || ifconfig ppp0 2>/dev/null';
    
    cp.exec(command, (error, stdout) => {
        if (error || !stdout) {
            // If ppp0 interface does not exist, VPN is disconnected
            if (isConnected) {
                isConnected = false;
                statusBarItem.text = "$(shield) VPN: Disconnected";
                vscode.window.showWarningMessage('OpenFortiVPN connection has been lost.');
            }
        } else {
            // If ppp0 interface exists, VPN is connected
            if (!isConnected) {
                isConnected = true;
                statusBarItem.text = "$(shield) VPN: Connected";
                vscode.window.showInformationMessage('OpenFortiVPN connection has been confirmed.');
            } else {
                statusBarItem.text = "$(shield) VPN: Connected";
            }
        }
    });
}

// Called when the extension is deactivated
export function deactivate() {
    // Disconnect VPN
    if (isConnected) {
        disconnectVPN();
    }
}