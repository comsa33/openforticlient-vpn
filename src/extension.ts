import * as vscode from 'vscode';
import * as cp from 'child_process';

// Global variables for VPN process management
let vpnProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;
let isConnected = false;

// Password key for SecretStorage
const VPN_PASSWORD_KEY = 'openfortivpn-password';

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
            disconnectVPN(context);
        } else {
            connectVPN(context);
        }
    });

    // Register password commands
    let savePasswordCommand = vscode.commands.registerCommand('openfortivpn-connector.savePassword', async () => {
        await managePassword(context, 'save');
    });

    let clearPasswordCommand = vscode.commands.registerCommand('openfortivpn-connector.clearPassword', async () => {
        await managePassword(context, 'clear');
    });

    context.subscriptions.push(
        configCommand, 
        toggleCommand, 
        savePasswordCommand, 
        clearPasswordCommand
    );

    // Set interval for status checking
    setInterval(checkVPNStatus, 10000);
}

// Password management function
async function managePassword(context: vscode.ExtensionContext, action: 'save' | 'clear' | 'get'): Promise<string | undefined> {
    if (action === 'clear') {
        await context.secrets.delete(VPN_PASSWORD_KEY);
        vscode.window.showInformationMessage('VPN password has been cleared.');
        return undefined;
    } else if (action === 'save') {
        const password = await vscode.window.showInputBox({
            prompt: 'Enter your VPN password to save securely',
            password: true
        });
        
        if (password) {
            await context.secrets.store(VPN_PASSWORD_KEY, password);
            vscode.window.showInformationMessage('VPN password has been saved securely.');
        }
        return password;
    } else {
        // Get the password
        return context.secrets.get(VPN_PASSWORD_KEY);
    }
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
    
    // Ask if user wants to save password
    const savePassword = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Do you want to save your VPN password securely?'
    });
    
    if (savePassword === 'Yes') {
        await vscode.commands.executeCommand('openfortivpn-connector.savePassword');
    }
    
    vscode.window.showInformationMessage('OpenFortiVPN configuration has been saved.');
}

// VPN connection function
async function connectVPN(context: vscode.ExtensionContext) {
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
    
    // Try to get saved password
    let password = await managePassword(context, 'get');
    
    // If no saved password, ask for it
    if (!password) {
        password = await vscode.window.showInputBox({
            prompt: 'Enter the VPN password',
            password: true
        });
        
        if (!password) {
            return; // User canceled
        }
        
        // Ask if user wants to save this password
        const savePassword = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Save this password for future connections?'
        });
        
        if (savePassword === 'Yes') {
            await context.secrets.store(VPN_PASSWORD_KEY, password);
            vscode.window.showInformationMessage('Password saved for future connections.');
        }
    }
    
    try {
        const hostWithPort = port ? `${host}:${port}` : host;
        
        // Create terminal
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // Use expect-like approach for automating the password input
        const script = `
        echo '${password}' | sudo -S openfortivpn ${hostWithPort} -u ${username}
        `;
        
        terminal.sendText(script);
        
        // Update status
        isConnected = true;
        statusBarItem.text = "$(shield) VPN: Connecting...";
        
        // Start connection check
        setTimeout(checkVPNStatus, 5000);
        
        vscode.window.showInformationMessage('Attempting to connect to OpenFortiVPN...');
    } catch (error) {
        vscode.window.showErrorMessage(`VPN connection failed: ${error}`);
    }
}

// VPN disconnection function
function disconnectVPN(context: vscode.ExtensionContext) {
    disconnectVPNWithPassword(context).catch(error => {
        vscode.window.showErrorMessage(`Failed to disconnect VPN: ${error}`);
    });
}

// Helper function to disconnect with password
async function disconnectVPNWithPassword(context: vscode.ExtensionContext) {
    // Try to get saved password
    let password = await managePassword(context, 'get');
    
    // If no saved password, ask for it
    if (!password) {
        password = await vscode.window.showInputBox({
            prompt: 'Enter sudo password to disconnect VPN',
            password: true
        });
        
        if (!password) {
            return; // User canceled
        }
    }
    
    try {
        // Create terminal
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // Use echo to pipe password to sudo
        terminal.sendText(`echo '${password}' | sudo -S pkill -SIGTERM openfortivpn`);
        
        // Update status
        isConnected = false;
        statusBarItem.text = "$(shield) VPN: Disconnected";
        
        vscode.window.showInformationMessage('OpenFortiVPN has been disconnected.');
    } catch (error) {
        throw error;
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
        // We can't access the context here, so we'll just use the plain disconnect method
        try {
            const terminal = vscode.window.createTerminal('OpenFortiVPN');
            terminal.show();
            terminal.sendText('sudo pkill -SIGTERM openfortivpn');
        } catch (error) {
            console.error('Failed to disconnect VPN during deactivation', error);
        }
    }
}