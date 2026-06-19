# BridgeDesk Update Log

## 1.2.2

- Fixed Permanent Tunnel URL handling so pasting an MCP URL such as `https://mcp.example.com/mcp` is saved as the fixed host and displayed as a single `/mcp` endpoint.
- Improved server startup when BridgeDesk is already running on the local port, so the launcher attaches to the running server instead of showing a confusing stopped state.

## 1.2.1

- Fixed ChatGPT connector creation by allowing trusted OpenAI and ChatGPT OAuth callback subdomains during dynamic client registration.
- Improved update checks so an installed app at the latest version does not show the electron-updater semver error.

## 1.2.0

- Added Quick Tunnel and Permanent Tunnel modes in the desktop launcher.
- Added guided Cloudflare buttons for login, named tunnel creation, DNS routing, and permanent tunnel startup.
- Added saved permanent tunnel settings so the MCP URL can stay fixed across app and computer restarts.
- Updated the README to explain when to use Quick Tunnel versus Permanent Tunnel.

## 1.1.0

- Added version display inside the BridgeDesk desktop launcher.
- Added an update status area and manual update check in the desktop launcher.
- Added automatic update checks on app launch for installed Windows builds.
- Added GitHub Release packaging so users can download a Windows installer directly.
- Added stable release asset names for the installer, portable exe, and update metadata.
- Added public README download instructions and project About text.
