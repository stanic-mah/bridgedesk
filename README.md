# BridgeDesk

BridgeDesk is a desktop launcher and local MCP workspace server for ChatGPT and
other MCP clients. It lets a trusted MCP client work with selected local project
folders through explicit tools for reading, editing, searching, running commands,
and showing changes.

BridgeDesk has two entrypoints:

- an Electron desktop launcher for setup, tunnels, process control, and copyable
  connection details
- a CLI and MCP server for headless or scripted use

## Requirements

- Node `>=20.12 <27`
- npm
- Git
- Bash-compatible shell; Git Bash is the simplest Windows option
- Optional: `cloudflared` for the launcher-managed quick tunnel

## Desktop Launcher

Install dependencies and start the launcher from a local checkout:

```bash
npm install
npm run desktop
```

The launcher checks local requirements, lets you choose one project folder,
starts a Cloudflare Quick Tunnel when available, starts the BridgeDesk server,
and copies the MCP URL and Owner password for the MCP client.

If Cloudflare Tunnel is not installed, paste any HTTPS tunnel URL into the
launcher. The URL should point to:

```text
http://127.0.0.1:7676
```

Use this MCP endpoint in the client:

```text
https://your-tunnel-host.example.com/mcp
```

## CLI

Build and run locally:

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js serve
```

After publishing or linking the package, the public command is:

```bash
bridgedesk init
bridgedesk serve
bridgedesk doctor
bridgedesk config get
bridgedesk config set publicBaseUrl https://your-tunnel-host.example.com
```

The default local endpoint is:

```text
http://127.0.0.1:7676/mcp
```

## Configuration

BridgeDesk stores local configuration in:

```text
~/.bridgedesk/config.json
~/.bridgedesk/auth.json
```

Important environment variables:

- `BRIDGEDESK_PUBLIC_BASE_URL`
- `BRIDGEDESK_ALLOWED_ROOTS`
- `BRIDGEDESK_OAUTH_OWNER_TOKEN`
- `BRIDGEDESK_STATE_DIR`
- `BRIDGEDESK_WORKTREE_ROOT`
- `BRIDGEDESK_TOOL_MODE`

See [docs/configuration.md](docs/configuration.md) for the full reference.

## Security

BridgeDesk is powerful local access to selected folders on your machine. Keep
allowed roots narrow, protect `auth.json`, and connect only trusted MCP clients.
The desktop launcher rejects drive roots and the whole user folder as project
roots.

See [docs/security.md](docs/security.md) for the full model.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run desktop
```

The build produces:

- `dist/cli.js` for the CLI
- `dist/server.js` for the MCP server
- `dist/ui` for MCP app widgets
- `dist/desktop` for the Electron launcher

## License

BridgeDesk is distributed under the MIT License. See [LICENSE](LICENSE).
