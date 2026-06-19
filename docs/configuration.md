# Configuration Reference

BridgeDesk can be configured through `bridgedesk init`, persisted config files, or
environment variables.

The default files are:

```text
~/.bridgedesk/config.json
~/.bridgedesk/auth.json
```

Use another config directory with:

```bash
BRIDGEDESK_CONFIG_DIR=/path/to/config npx bridgedesk serve
```

## Commands

```bash
npx bridgedesk init
npx bridgedesk serve
npx bridgedesk doctor
npx bridgedesk config get
npx bridgedesk config set publicBaseUrl https://bridgedesk.example.com
```

## Core Environment Variables

| Variable | Purpose |
| --- | --- |
| `HOST` | Local bind host. Defaults to `127.0.0.1`. |
| `PORT` | Local port. Defaults to `7676`. |
| `BRIDGEDESK_ALLOWED_ROOTS` | Comma-separated local roots that workspaces may open. |
| `BRIDGEDESK_PUBLIC_BASE_URL` | Public origin for the server, without `/mcp`. |
| `BRIDGEDESK_ALLOWED_HOSTS` | Optional Host header allowlist override. |
| `BRIDGEDESK_OAUTH_OWNER_TOKEN` | Owner password for OAuth approval. Must be at least 16 characters. |
| `BRIDGEDESK_WORKTREE_ROOT` | Directory for managed Git worktrees. Defaults to `~/.bridgedesk/worktrees`. |
| `BRIDGEDESK_STATE_DIR` | Directory for SQLite state. Defaults to `~/.local/share/bridgedesk`. |

## Desktop Tunnel Settings

The Electron launcher stores tunnel preferences in `~/.bridgedesk/config.json`.

| Field | Purpose |
| --- | --- |
| `tunnelMode` | `quick` for temporary Cloudflare URLs or `permanent` for a fixed Cloudflare hostname. |
| `publicBaseUrl` | Public origin used by the MCP server, without `/mcp`. |
| `permanentTunnelName` | Cloudflare named tunnel to run in Permanent Tunnel mode. Defaults to `bridgedesk`. |
| `permanentHostname` | Fixed HTTPS origin for Permanent Tunnel mode, for example `https://mcp.yourdomain.com`. |

## OAuth

BridgeDesk uses a single-user OAuth approval flow.

| Variable | Default |
| --- | --- |
| `BRIDGEDESK_OAUTH_ACCESS_TOKEN_TTL_SECONDS` | `3600` |
| `BRIDGEDESK_OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` |
| `BRIDGEDESK_OAUTH_SCOPES` | `bridgedesk` |
| `BRIDGEDESK_OAUTH_ALLOWED_REDIRECT_HOSTS` | `chatgpt.com,localhost,127.0.0.1` |

MCP clients discover metadata from:

```text
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
```

## Tool Modes

`BRIDGEDESK_TOOL_NAMING` controls tool names.

| Value | Behavior |
| --- | --- |
| `short` | Default. Uses `read`, `edit`, `bash`, and related names. |
| `legacy` | Uses `read_file`, `edit_file`, `run_shell`, and related names. |

`BRIDGEDESK_TOOL_MODE` controls the tool surface.

| Value | Behavior |
| --- | --- |
| `minimal` | Default. Disables dedicated search and list tools. Clients use the shell tool with `rg`, `grep`, `find`, `ls`, or `tree` for inspection. |
| `full` | Enables dedicated `grep`, `glob`, and `ls` tools. |

## Widgets

`BRIDGEDESK_WIDGETS` controls ChatGPT Apps iframe usage.

| Value | Behavior |
| --- | --- |
| `full` | Default. Widget UI is attached to exposed workspace, file, edit, and shell tools. |
| `changes` | Enables the aggregate `show_changes` tool and attaches widget UI to `open_workspace` and `show_changes`. |
| `off` | Disables widget UI. |

## Skills

| Variable | Purpose |
| --- | --- |
| `BRIDGEDESK_SKILLS` | Set to `0` to hide skills. Enabled by default. |
| `BRIDGEDESK_AGENT_DIR` | Defaults to `~/.codex`. |
| `BRIDGEDESK_SKILL_PATHS` | Optional comma-separated skill directories. |

Example:

```bash
BRIDGEDESK_SKILL_PATHS="$HOME/.codex/skills,$HOME/.claude/skills" \
npx bridgedesk serve
```

## Logging

| Variable | Default |
| --- | --- |
| `BRIDGEDESK_LOG_LEVEL` | `info` |
| `BRIDGEDESK_LOG_FORMAT` | `json` |
| `BRIDGEDESK_LOG_REQUESTS` | `1` |
| `BRIDGEDESK_LOG_ASSETS` | `0` |
| `BRIDGEDESK_LOG_TOOL_CALLS` | `1` |
| `BRIDGEDESK_LOG_SHELL_COMMANDS` | `0` |
| `BRIDGEDESK_TRUST_PROXY` | `0` |

Set `BRIDGEDESK_LOG_FORMAT=pretty` for local debugging.

Set `BRIDGEDESK_LOG_SHELL_COMMANDS=1` only when you intentionally want command
previews in logs.

## Env-Only Example

```bash
BRIDGEDESK_OAUTH_OWNER_TOKEN="$(openssl rand -base64 32)" \
BRIDGEDESK_ALLOWED_ROOTS="$HOME/personal,$HOME/work" \
BRIDGEDESK_PUBLIC_BASE_URL="https://bridgedesk.example.com" \
BRIDGEDESK_WORKTREE_ROOT="$HOME/.bridgedesk/worktrees" \
BRIDGEDESK_TOOL_MODE="minimal" \
BRIDGEDESK_TOOL_NAMING="short" \
BRIDGEDESK_WIDGETS="full" \
npx bridgedesk serve
```

The environment assignments must be part of the same command invocation, or
exported first.
