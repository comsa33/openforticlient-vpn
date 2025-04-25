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
- **Background connections without terminal windows** (New in 1.1.4)
- **Detailed connection logs in output panel** (New in 1.1.4)
- **Secure password handling that prevents exposure** (New in 1.1.4)


## Requirements

<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector-extension-install-openfortivpn-cli.gif" width="600" alt="OpenFortiVPN Connector Preview"><br>

- Linux or macOS operating system
- `openfortivpn` command-line tool must be installed
  - Ubuntu/Debian: `sudo apt install openfortivpn`
  - macOS: `brew install openfortivpn`
- Administrator privileges (sudo) are required

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

### Viewing Connection Logs (New in 1.1.4)

1. Click the "Output" icon in the Profile Explorer title bar
2. View detailed connection logs in the Output panel
3. Connection attempts, status changes, errors, and other events are recorded
4. Logs include timestamps for better tracking

### Saving Passwords

1. Right-click on a profile in the profile explorer
2. Select "Manage Profile Password"
3. Choose "Save Password" and enter your VPN password
4. The password will be securely stored in your OS keychain

## Visual Indicators

- In Profile Explorer:
  - Green shield icon: Active profile that is connected
  - Orange/yellow shield icon: Active profile that is connecting
  - Standard shield icon: Active profile that is not connected
  - Lock icon: Inactive profile
- In Title Bar:
  - Play (▶) button: Visible when VPN is disconnected, to connect with active profile
  - Stop (■) button: Visible when VPN is connected, to disconnect the VPN
  - Output button: View connection logs (New in 1.1.4)
- In Status Bar:
  - "VPN: Connected" with highlight background: VPN is currently connected
  - "VPN: Disconnected": No active VPN connection

## Extension Settings

This extension provides the following settings (legacy mode - profiles recommended instead):

* `openfortivpn-connector.host`: VPN gateway host address
* `openfortivpn-connector.port`: VPN gateway port (default: 443)
* `openfortivpn-connector.username`: VPN account username

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
* `OpenFortiVPN: Show Connection Logs` - View detailed VPN connection logs (New in 1.1.4)

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