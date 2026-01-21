# OpenFortiVPN Connector

OpenFortiVPN Connector is an extension that allows you to easily manage Fortinet VPN connections within Visual Studio Code. This extension uses the `openfortivpn` command-line tool to set up and manage VPN connections directly from the VS Code editor.

## Key Features

- Manage multiple VPN profiles with different configurations
- Simple one-click VPN connection/disconnection with dedicated buttons
- Visual connection status indicators in Profile Explorer (green/red icons)
- VPN status monitoring in VS Code status bar
- Secure password storage for each profile
- Profile explorer in the activity bar
- Automatic connection status monitoring
- **Auto-reconnect when connection is lost** (New in 1.2.0)
- **Configurable reconnection attempts and intervals** (New in 1.2.0)
- Connection metrics and statistics monitoring
- Real-time speed, data usage, and connection time tracking
- Interactive graphs and historical session data
- Background connections without terminal windows
- Detailed connection logs in output panel
- Secure password handling that prevents exposure


## Requirements

<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector-extension-install-openfortivpn-cli.gif" width="600" alt="OpenFortiVPN Connector Preview"><br>

- Linux or macOS operating system
- `openfortivpn` command-line tool must be installed
  - Ubuntu/Debian: `sudo apt install openfortivpn`
  - macOS: `brew install openfortivpn`
- Administrator privileges (sudo) are required

### Passwordless Sudo Setup (Optional, Advanced)

If you prefer not to enter your system password each time, you can configure passwordless sudo:

**macOS (Homebrew):**
```bash
sudo visudo -f /etc/sudoers.d/openfortivpn
```

Add this line:
```
%admin ALL=(ALL) NOPASSWD: /opt/homebrew/bin/openfortivpn
```

**Linux:**
```bash
sudo visudo -f /etc/sudoers.d/openfortivpn
```

Add this line:
```
%sudo ALL=(ALL) NOPASSWD: /usr/bin/openfortivpn
```

> **Note**: Without this setup, the extension will ask for your system password on first connection and save it securely.

## Installation

Install by searching for "OpenFortiVPN Connector" in the VS Code extension marketplace or download directly from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RuoLee.openfortivpn-connector).

## How to Use

### Managing VPN Profiles
<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector-extension-add-profile.gif" width="600" alt="OpenFortiVPN Connector Preview"><br>

1. Click on the OpenFortiVPN icon in the activity bar (shield icon)
2. Click the "+" button to create a new VPN profile
3. Enter a name, VPN gateway host, port, and username
4. Click on a profile to set it as active
5. Use the context menu (right-click on a profile) for more options:
   - Connect to profile
   - Edit profile
   - Delete profile
   - Set as active profile
   - Manage profile password

### Connecting to VPN
<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector-extension-connect.gif" width="600" alt="OpenFortiVPN Connector Preview"> <br>

There are multiple ways to connect to VPN:
1. Click the "VPN: Disconnected" icon in the status bar to toggle using the active profile
2. Click the play (▶) icon in the Profile Explorer title bar to connect using the active profile
3. When connected, click the stop (■) icon in the Profile Explorer title bar to disconnect
4. Right-click on a profile in the profile explorer and select "Connect to Profile"
5. Enter your password when prompted (or use a saved password)
6. The status bar and profile explorer will show the connection status with visual indicators

### Auto-Reconnect Feature (New in 1.2.0)

The extension can automatically attempt to reconnect if your VPN connection is unexpectedly lost:

1. Enable auto-reconnect in settings:
   - Open VS Code settings (File > Preferences > Settings)
   - Search for "openfortivpn"
   - Check "Auto Reconnect" to enable the feature
   - Configure "Auto Reconnect Max Retries" (1-10 attempts)
   - Configure "Auto Reconnect Interval" (5-60 seconds between attempts)

2. When the connection is lost:
   - The extension will automatically attempt to reconnect
   - Status bar will show "VPN: Reconnecting... (attempt count)"
   - If reconnection succeeds, normal connection is restored
   - If all reconnection attempts fail, status changes to "VPN: Reconnect Failed"

3. Control auto-reconnect:
   - Click the stop icon during reconnection to cancel the process
   - Click the retry icon after max retries to manually try again
   - Manual disconnection will not trigger auto-reconnect

### Saving Passwords

1. Right-click on a profile in the profile explorer
2. Select "Manage Profile Password"
3. Choose "Save Password" and enter your VPN password
4. The password will be securely stored in your OS keychain

### Viewing Connection Logs

1. Click the "Output" icon in the Profile Explorer title bar
2. View detailed connection logs in the Output panel
3. Connection attempts, status changes, errors, and other events are recorded
4. Logs include timestamps for better tracking

### Monitoring Connection Metrics

1. Click the "VPN Connection Metrics" section in the OpenFortiVPN activity bar
2. View real-time connection metrics in a clear tree format:
   - Current connection status (Active/Inactive)
   - Current upload and download speeds
   - Total data usage (upload/download)
   - Total combined data transferred
   - Connection duration
3. Metrics are automatically updated while connection is active
4. Use the refresh button to manually update metrics data
5. Export connection metrics data for analysis
6. Clear metrics history using the clear button

The metrics view provides essential information about your VPN connection, allowing you to monitor:
- How long you've been connected
- Current network speeds
- Total amount of data transferred during the session
- Overall connection status

All metrics are collected locally and displayed in real-time for the current VPN session.

### Using Scheduled VPN Connections (New in 1.2.0)

<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector-extension-schedule.gif" width="600" alt="OpenFortiVPN Scheduled Connections Preview"><br>

The extension allows you to schedule automatic VPN connections and disconnections:

1. Click on the "VPN Schedules" section in the OpenFortiVPN activity bar
2. Click the "+" icon to create a new schedule
3. Configure your schedule:
   - Name: Enter a descriptive name for the schedule
   - Type: Choose "Connect" or "Disconnect"
   - Profile: (For connect schedules) Select the VPN profile to use
   - Time: Enter the time in 24-hour format (e.g., 09:00)
   - Repeat: Choose between "Once", "Daily", or "Weekly"
   - Weekdays: (For weekly schedules) Select which days to run

4. Manage your schedules:
   - Enable/Disable: Right-click and select "Enable/Disable Schedule"
   - Edit: Right-click and select "Edit Schedule" to modify settings
   - Delete: Right-click and select "Delete Schedule" to remove

The extension will automatically run your schedules in the background, even when you're not actively using the schedule view.

## Visual Indicators

- In Profile Explorer:
  - Green shield icon: Active profile that is connected
  - Orange/yellow shield icon: Active profile that is connecting or reconnecting
  - Red shield icon: Active profile that failed to reconnect
  - Standard shield icon: Active profile that is not connected
  - Lock icon: Inactive profile
- In Title Bar:
  - Play (▶) button: Visible when VPN is disconnected, to connect with active profile
  - Stop (■) button: Visible when VPN is connected, to disconnect the VPN
  - Stop Circle button: Visible during auto-reconnect, to cancel reconnection attempts
  - Restart button: Visible after reconnection failure, to retry connection manually
  - Output button: View connection logs
- In Status Bar:
  - "VPN: Connected" with highlight background: VPN is currently connected
  - "VPN: Reconnecting... (1)" with highlight background: VPN is attempting to reconnect (with attempt count)
  - "VPN: Reconnect Failed" with red background: VPN failed to reconnect after all attempts
  - "VPN: Disconnected": No active VPN connection

## Extension Settings

This extension provides the following settings:

* `openfortivpn-connector.host`: VPN gateway host address (Legacy setting - use profiles instead)
* `openfortivpn-connector.port`: VPN gateway port (default: 443) (Legacy setting - use profiles instead)
* `openfortivpn-connector.username`: VPN account username (Legacy setting - use profiles instead)
* `openfortivpn-connector.metricsRefreshInterval`: Interval in seconds for refreshing VPN connection metrics (default: 5)
* `openfortivpn-connector.autoReconnect`: Enable/disable automatic reconnection when connection is lost (default: false)
* `openfortivpn-connector.autoReconnectMaxRetries`: Maximum number of reconnection attempts (default: 3, range: 1-10)
* `openfortivpn-connector.autoReconnectInterval`: Interval in seconds between reconnection attempts (default: 10, range: 5-60)

## Available Commands

* `OpenFortiVPN: Toggle Connection` - Connect/disconnect using active profile
* `OpenFortiVPN: Connect` - Connect using active profile
* `OpenFortiVPN: Disconnect` - Disconnect the active VPN connection
* `OpenFortiVPN: Configure` - Open profile management
* `OpenFortiVPN: Create New Profile` - Create a new VPN profile
* `OpenFortiVPN: Edit Profile` - Edit selected profile
* `OpenFortiVPN: Delete Profile` - Delete selected profile
* `OpenFortiVPN: Set as Active Profile` - Make selected profile active
* `OpenFortiVPN: Connect to Profile` - Connect using selected profile
* `OpenFortiVPN: Save Password` - Save password for active profile
* `OpenFortiVPN: Clear Saved Password` - Clear saved password for active profile
* `OpenFortiVPN: Manage Profile Password` - Save or clear password for selected profile
* `OpenFortiVPN: Show Connection Logs` - View detailed VPN connection logs
* `OpenFortiVPN: Show Connection Metrics` - View VPN connection metrics and statistics
* `OpenFortiVPN: Refresh Metrics` - Manually refresh metrics data display
* `OpenFortiVPN: Clear Connection Metrics` - Clear stored VPN connection metrics
* `OpenFortiVPN: Export Connection Metrics` - Export metrics data to JSON file
* `OpenFortiVPN: Cancel Auto-Reconnect` - Cancel the auto-reconnect process (New in 1.2.0)
* `OpenFortiVPN: Retry Connection` - Retry connection after reconnection failure (New in 1.2.0)
* `OpenFortiVPN: Create New Schedule` - Create a new VPN connection/disconnection schedule (New in 1.2.0)
* `OpenFortiVPN: Edit Schedule` - Edit an existing schedule (New in 1.2.0)
* `OpenFortiVPN: Delete Schedule` - Delete a schedule (New in 1.2.0)
* `OpenFortiVPN: Enable/Disable Schedule` - Toggle schedule active state (New in 1.2.0)
* `OpenFortiVPN: Refresh Schedules` - Refresh the schedules view (New in 1.2.0)

## Troubleshooting

### If Connection Fails

1. Verify that the `openfortivpn` tool is properly installed.
2. Test if the openfortivpn command runs directly in the terminal.
3. Confirm that the host, port, and username in your profile are correct.
4. Make sure you've entered the correct password as administrator privileges (sudo) are required.
5. Check the connection logs using the "Show Connection Logs" command for more details about the error.

### If VPN Status Is Not Displayed Correctly

1. Try restarting VS Code.
2. Check if the ppp0 interface exists using the `ip addr` or `ifconfig` command in the terminal.
3. View the connection logs to see if any errors were reported during connection attempts.

### If Auto-Reconnect Is Not Working

1. Verify that auto-reconnect is enabled in the extension settings.
2. Make sure you have saved the password for the active profile (auto-reconnect requires a saved password).
3. Check the connection logs for any errors during reconnection attempts.
4. If reconnection fails after all attempts, use the "Retry Connection" command to try again manually.

## License

This extension is distributed under the MIT license. See the `LICENSE` file for details.

## Contributing

Bug reports, feature requests, or code contributions can be made through the [GitHub repository](https://github.com/comsa33/openforticlient-vpn).

## Author

Developed by **Ruo Lee**  
> 👨‍💻 [GitHub](https://github.com/comsa33)  
> 📫 Contact: comsa333@gmail.com

---

**Note**: This extension is not affiliated with Fortinet and is not an official Fortinet product. `openfortivpn` is a third-party open source tool.