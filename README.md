# OpenFortiVPN Connector

OpenFortiVPN Connector is an extension that allows you to easily manage Fortinet VPN connections within Visual Studio Code. This extension uses the `openfortivpn` command-line tool to set up and manage VPN connections directly from the VS Code editor.

## Key Features

- Manage multiple VPN profiles with different configurations
- Simple one-click VPN connection/disconnection
- VPN status monitoring in VS Code status bar
- Secure password storage for each profile
- Profile explorer in the activity bar
- Automatic connection status monitoring

<img src="https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector.png" width="200" alt="OpenFortiVPN Connector Preview">

## Requirements

- Linux or macOS operating system
- `openfortivpn` command-line tool must be installed
  - Ubuntu/Debian: `sudo apt install openfortivpn`
  - macOS: `brew install openfortivpn`
- Administrator privileges (sudo) are required

## Installation

Install by searching for "OpenFortiVPN Connector" in the VS Code extension marketplace or download directly from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=RuoLee.openfortivpn-connector).

## How to Use

### Managing VPN Profiles

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

1. Click the "VPN: Disconnected" icon in the status bar to connect using the active profile
2. Alternatively, right-click on a profile in the profile explorer and select "Connect to Profile"
3. Enter your password when prompted (or use a saved password)
4. The status bar will show the connection status and the active profile name

### Saving Passwords

1. Right-click on a profile in the profile explorer
2. Select "Manage Profile Password"
3. Choose "Save Password" and enter your VPN password
4. The password will be securely stored in your OS keychain

## Extension Settings

This extension provides the following settings (legacy mode - profiles recommended instead):

* `openfortivpn-connector.host`: VPN gateway host address
* `openfortivpn-connector.port`: VPN gateway port (default: 443)
* `openfortivpn-connector.username`: VPN account username

## Available Commands

* `OpenFortiVPN: Toggle Connection` - Connect/disconnect using active profile
* `OpenFortiVPN: Configure` - Open profile management
* `OpenFortiVPN: Create New Profile` - Create a new VPN profile
* `OpenFortiVPN: Edit Profile` - Edit selected profile
* `OpenFortiVPN: Delete Profile` - Delete selected profile
* `OpenFortiVPN: Set as Active Profile` - Make selected profile active
* `OpenFortiVPN: Connect to Profile` - Connect using selected profile
* `OpenFortiVPN: Save Password` - Save password for active profile
* `OpenFortiVPN: Clear Saved Password` - Clear saved password for active profile
* `OpenFortiVPN: Manage Profile Password` - Save or clear password for selected profile

## Troubleshooting

### If Connection Fails

1. Verify that the `openfortivpn` tool is properly installed.
2. Test if the openfortivpn command runs directly in the terminal.
3. Confirm that the host, port, and username in your profile are correct.
4. Make sure you've entered the correct password as administrator privileges (sudo) are required.

### If VPN Status Is Not Displayed Correctly

1. Try restarting VS Code.
2. Check if the ppp0 interface exists using the `ip addr` or `ifconfig` command in the terminal.

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