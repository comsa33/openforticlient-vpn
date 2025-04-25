# Change Log

All notable changes to the "openfortivpn-connector" extension will be documented in this file.

## [Unreleased]


## [1.0.3] - 2025-04-25

### Chore
- Updated CHANGELOG.md to include correct github links

## [1.0.2] - 2025-04-25

### Added
- Added secure password storage feature (using VS Code SecretStorage API)
- Automatic VPN connection using saved password
- Automatic VPN disconnection using saved password
- New commands for password management:
  - `OpenFortiVPN: Save Password` - Save password
  - `OpenFortiVPN: Clear Saved Password` - Delete saved password
- Added password save option during VPN configuration
- Added confirmation dialog to save password on first connection

### Changed
- Improved VPN connection/disconnection - automatic password piping to sudo commands
- Enhanced password input UI and user experience
- Improved status messages

### Security
- Changed to securely store passwords in OS keychain

## [1.0.1] - 2025-04-10

### Fixed
- Fixed issue with VPN status check not working properly on macOS
- Fixed bug where status bar wasn't updating after disconnection
- Improved error handling when canceling connection attempts

### Changed
- Improved status bar icon design
- Reduced connection status check interval from 10 seconds to 5 seconds
- Improved error messages and translations

### Added
- Display detailed error information on connection failure
- Added connection status notifications

## [1.0.0] - 2025-04-01

### Added
- Initial release
- VPN connection status display in VS Code status bar
- VPN connection/disconnection toggle functionality
- VPN configuration management (host, port, username)
- Automatic connection status monitoring
- Terminal-based openfortivpn execution support
- macOS and Linux support

[Unreleased]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/comsa33/openforticlient-vpn/releases/tag/v1.0.1