# OpenFortiVPN Connector

OpenFortiVPN Connector is an extension that allows you to easily manage Fortinet VPN connections within Visual Studio Code. This extension uses the `openfortivpn` command-line tool to set up and manage VPN connections directly from the VS Code editor.

## Key Features

- Check VPN connection status in VS Code status bar
- Simple one-click VPN connection/disconnection
- Manage VPN settings (host, port, username)
- Automatic connection status monitoring

![OpenFortiVPN Connector Preview](https://raw.githubusercontent.com/comsa33/openforticlient-vpn/main/images/openfortivpn-connector.png)

## Requirements

- Linux or macOS operating system
- `openfortivpn` command-line tool must be installed
  - Ubuntu/Debian: `sudo apt install openfortivpn`
  - macOS: `brew install openfortivpn`
- Administrator privileges (sudo) are required

## Installation

Install by searching for "OpenFortiVPN Connector" in the VS Code extension marketplace or download directly from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com).

## How to Use

1. Open the VS Code command palette (Ctrl+Shift+P or Cmd+Shift+P) and select "OpenFortiVPN: Settings".
2. Enter the VPN gateway host, port, and username.
3. Click the "VPN: Disconnected" icon in the status bar or select "OpenFortiVPN: Toggle Connection" from the command palette to connect to VPN.
4. You will be prompted to enter your password when connecting.
5. When connected, the status bar icon will change to "VPN: Connected".
6. Click the icon again to disconnect from the VPN.

## Extension Settings

This extension provides the following settings:

* `openfortivpn-connector.host`: VPN gateway host address
* `openfortivpn-connector.port`: VPN gateway port (default: 443)
* `openfortivpn-connector.username`: VPN account username

Settings can be changed through the VS Code settings UI or extension commands.

## Troubleshooting

### If Connection Fails

1. Verify that the `openfortivpn` tool is properly installed.
2. Test if the openfortivpn command runs directly in the terminal.
3. Confirm that the host, port, and username are correct.
4. Make sure you've entered the correct password as administrator privileges (sudo) are required.

### If VPN Status Is Not Displayed Correctly

1. Try restarting VS Code.
2. Check if the ppp0 interface exists using the `ip addr` or `ifconfig` command in the terminal.

## License

This extension is distributed under the MIT license. See the `LICENSE` file for details.

## Contributing

Bug reports, feature requests, or code contributions can be made through the [GitHub repository](https://github.com/yourusername/openfortivpn-connector).

---

**Note**: This extension is not affiliated with Fortinet and is not an official Fortinet product. `openfortivpn` is a third-party open source tool.