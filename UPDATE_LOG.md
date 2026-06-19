# BridgeDesk Update Log

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
