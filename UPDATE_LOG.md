# BridgeDesk Update Log

## 1.2.14

- Added a shared GitHub release notes template matching the BridgeDesk v1.2.13 format.
- Added release note generation tooling so future GitHub releases use the same structure.
- Standardized previous GitHub release notes around the shared installer and auto-update wording.

## 1.2.13

- Hardened the BridgeDesk write tool so new files are written directly through the local filesystem and verified before reporting success.
- Added coverage for creating a new file inside a workspace and blocking writes outside the selected project folder.

## 1.2.12

- Expanded the user guide with a full Quick Tunnel walkthrough.
- Added project-folder switching instructions, including when to stop and restart the server.
- Documented the ChatGPT reconnect behavior that can appear after switching folders, including waiting through the temporary "Stop thinking" state and reconnecting with the owner password.
- Rebuilt the Windows app path so the installed `BridgeDesk.exe` can use the real BridgeDesk icon instead of the old embedded icon.

## 1.2.11

- Improved ChatGPT workspace startup so `open_workspace` can open the selected BridgeDesk project folder when the path is blank, `.`, `selected project`, or the selected folder name.
- Updated the `open_workspace` tool description to show the configured BridgeDesk project folder and tell MCP clients to use `.` for the selected project.
- Updated setup guidance so users can ask ChatGPT to open the selected BridgeDesk project instead of manually typing a Windows path.

## 1.2.10

- Added a full user guide for first-time setup, Cloudflare Tunnel installation, Permanent Tunnel setup, ChatGPT connection, daily use, and troubleshooting.
- Added an in-app Guide panel so users can follow the main setup steps directly inside the BridgeDesk launcher.
- Updated README and setup documentation to point users to the complete guide and the Cloudflare Bot Fight Mode requirement for ChatGPT connections.
- Replaced placeholder BD marks with the real BridgeDesk icon in the desktop launcher, tray, window, and Windows installer metadata.

## 1.2.9

- Fixed tunneled OAuth requests by trusting proxy headers only from the local Cloudflare connector when BridgeDesk is served through a public HTTPS tunnel.
- Removed Express rate-limit proxy-header warnings that could interfere with real ChatGPT connector requests after owner-password approval.

## 1.2.8

- Fixed Permanent Tunnel startup by writing a Cloudflare named-tunnel ingress config before running the tunnel.
- Updated Permanent Tunnel launch so the fixed hostname routes to the local BridgeDesk server instead of returning Cloudflare 503 errors.

## 1.2.7

- Added a ChatGPT compatibility fix so BridgeDesk advertises OAuth security schemes at the top level of each MCP tool as well as in tool metadata.
- Improved the MCP tool list response used after owner-password approval, so ChatGPT can discover BridgeDesk actions after connecting.

## 1.2.6

- Added OAuth `securitySchemes` to BridgeDesk tool descriptors so ChatGPT can import the tool list after OAuth approval.
- Updated OAuth metadata to advertise public-client token auth with `none`, matching ChatGPT's Client ID Metadata Document flow.

## 1.2.5

- Increased the ChatGPT client metadata fetch timeout so slower ChatGPT metadata URLs do not fail as `invalid_client`.
- Cached ChatGPT metadata clients in BridgeDesk's OAuth client store so reconnects can avoid refetching the metadata document.

## 1.2.4

- Saved ChatGPT OAuth client registrations so BridgeDesk can reconnect after the app or server restarts.
- Added recovery for existing ChatGPT apps that already hold an older temporary `bridgedesk-...` client ID.
- Kept the fixed Permanent Tunnel MCP URL unchanged while improving the OAuth connection flow.

## 1.2.3

- Added ChatGPT Client ID Metadata Document support so connector setup can use ChatGPT's stable OAuth client metadata path instead of relying only on dynamic client registration.
- Advertised `client_id_metadata_document_supported` in OAuth metadata while keeping dynamic client registration available for clients that still use it.

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
