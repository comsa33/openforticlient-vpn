# Change Log

All notable changes to the "openfortivpn-connector" extension will be documented in this file.

## [1.2.0] - 2025-04-26

### Added
- **Schedule-based Auto Connect/Disconnect Feature**
  - Automatically connect or disconnect VPN at specified times
  - Various repeat options (once, daily, specific days of the week)
  - Enable/disable schedules individually
  - Manual execution option for schedules
  - Dedicated VPN Schedule Management view in the Activity Bar
  - User-friendly interface for creating and editing schedules

- **Auto-Reconnect Feature**
  - Automatic reconnection when VPN connection is lost
  - Configurable reconnection attempts and intervals
  - Visual indicators for reconnection status in status bar and profile view
  - Manual control to cancel or retry reconnection
  - User configuration options:
    - Enable/disable auto-reconnect
    - Maximum number of reconnection attempts (1-10)
    - Interval between reconnection attempts (5-60 seconds)

## [1.1.4] - 2025-04-26

### Added
- **Connection Metrics and Statistics**
  - Real-time connection speed monitoring (upload/download)
  - Connection duration tracking
  - Data usage statistics (total upload/download)
  - New "VPN Connection Metrics" view in the activity bar showing:
    - Current connection status
    - Upload and download speeds
    - Total data transferred
    - Connection duration
  - Export metrics data to JSON files for further analysis
  - User-configurable metrics refresh interval (1-60 seconds)
- Connection logging functionality with detailed connection status information
- New "Show Connection Logs" command to view detailed connection logs
- Background connection mode (no terminal windows opening for connections)
- Secure password handling that prevents password exposure in terminal
- Enhanced connection feedback with more detailed status messages

### Changed
- Implemented tree-based view for connection metrics for improved stability
- Improved VPN connection/disconnection process to work in the background
- Enhanced error handling and user feedback
- More detailed logging of connection events in Output panel
- Optimized refresh rate for metrics to reduce resource usage

## [1.1.3] - 2025-04-25

### Added
- Added gifs to README.md for better understanding of extension usage

## [1.1.2] - 2025-04-25

### Added
- Added gifs to README.md for better understanding of extension usage

## [1.1.1] - 2025-04-25

### Added
- Separate connect (play) and disconnect (stop) buttons in the Profile Explorer title bar for improved usability
- Visual connection status indicators in the Profile Explorer (green/red icons)
- Enhanced status display in profile items showing connection state

### Fixed
- Fixed duplicate VPN status indicators in the status bar
- Improved visual feedback for VPN connection status
- Enhanced UI consistency between status bar and profile explorer
- Improved user experience with context-aware buttons for VPN connection management

## [1.1.0] - 2025-04-25

### Added
- Multi-profile management for VPN connections
- Profile Explorer view in Activity Bar
- Create, edit, delete VPN profiles
- Switch between different VPN profiles
- Profile-specific password storage
- Context menu actions for profiles
- Automatic migration from legacy settings to profiles

### Changed
- Refactored codebase for better maintainability and extensibility
- Improved Status Bar display with active profile information
- Enhanced connection status updates
- Updated configuration screens
- Improved user experience for multiple VPN connections

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

[Unreleased]: https://github.com/comsa33/openforticlient-vpn/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/comsa33/openforticlient-vpn/compare/v1.1.4...v1.2.0
[1.1.4]: https://github.com/comsa33/openforticlient-vpn/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/comsa33/openforticlient-vpn/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/comsa33/openforticlient-vpn/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/comsa33/openforticlient-vpn/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/comsa33/openforticlient-vpn/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/comsa33/openforticlient-vpn/releases/tag/v1.0.1