# Troubleshooting Gotchas

This page collects the setup issues users are most likely to hit.

## `bridgedesk` Command Not Found

Use `npx`:

```bash
npx bridgedesk init
npx bridgedesk serve
```

If you installed globally, confirm npm's global bin directory is on `PATH`.

## Unsupported Node Version

BridgeDesk requires Node `>=20.12 <27`.

Check:

```bash
node --version
```

Install Node 22 LTS with your preferred version manager such as `nvm`, `fnm`, or
`mise`.

## `better-sqlite3` Could Not Load

This usually means native dependencies were installed under a different Node
runtime.

Try:

```bash
npm rebuild better-sqlite3
```

Then run:

```bash
npx bridgedesk doctor
```

Release starts run a native dependency check before launching.

## Public URL Includes `/mcp`

Use the origin for setup:

```text
https://your-tunnel-host.example.com
```

Use the MCP endpoint in the client:

```text
https://your-tunnel-host.example.com/mcp
```

If you saved the wrong value:

```bash
npx bridgedesk config set publicBaseUrl https://your-tunnel-host.example.com
```

## Tunnel URL Changed

Temporary tunnels often change URLs between runs.

For a one-off run:

```bash
BRIDGEDESK_PUBLIC_BASE_URL="https://new-tunnel.example.com" npx bridgedesk serve
```

For a stable URL:

```bash
npx bridgedesk config set publicBaseUrl https://bridgedesk.example.com
```

## Host Header Or 403 Problems

BridgeDesk derives allowed hosts from the configured public URL.

Run:

```bash
npx bridgedesk doctor
```

Confirm the public URL hostname appears in allowed hosts. If you changed tunnel
URLs, update `publicBaseUrl`.

Use this only for intentional local debugging:

```bash
BRIDGEDESK_ALLOWED_HOSTS="*" npx bridgedesk serve
```

## OAuth Redirect Host Rejected

BridgeDesk supports ChatGPT's Client ID Metadata Document flow and dynamic
client registration. By default, BridgeDesk allows redirects for:

```text
chatgpt.com
*.chatgpt.com
*.openai.com
localhost
127.0.0.1
```

If another MCP client uses a different redirect host, configure:

```bash
BRIDGEDESK_OAUTH_ALLOWED_REDIRECT_HOSTS="chatgpt.com,example.com" npx bridgedesk serve
```

## Owner Password Not Accepted

Make sure you are entering the Owner password from:

```text
~/.bridgedesk/auth.json
```

To regenerate setup:

```bash
npx bridgedesk init --force
```

## Unknown `workspaceId`

`workspaceId` values are session identifiers. If the server restarts and the
client receives an unknown workspace error, call `open_workspace` again for that
project.

Workspace session metadata is persisted, but clients should still treat
`open_workspace` as the way to begin a fresh working session.

## Workspace Path Rejected

The path must be inside one of the allowed roots configured during setup.

Run:

```bash
npx bridgedesk config get
```

Then either open a project under an allowed root or rerun setup:

```bash
npx bridgedesk init --force
```

## Worktree Mode Fails

Worktree mode requires:

- Git installed
- the path is inside a Git repository
- the repository has at least one commit
- the requested `baseRef` resolves to a commit

For a new repository, create the first commit or use checkout mode.

Uncommitted source checkout changes are not copied into the managed worktree.
Commit, stash, or ask the model to work in checkout mode if those changes are
needed.

## Windows Shell Commands Fail

BridgeDesk shell execution requires Bash. Native PowerShell and `cmd.exe` command
execution are not supported yet.

Install Git for Windows and use Git Bash, or use WSL, MSYS2, or Cygwin Bash.

Run:

```bash
npx bridgedesk doctor
```

Confirm Bash is detected.

## Skills Do Not Appear

Skills are enabled by default. Check:

```bash
BRIDGEDESK_SKILLS=1 npx bridgedesk serve
```

BridgeDesk looks in:

- `BRIDGEDESK_AGENT_DIR`, defaulting to `~/.codex`
- project `.pi/skills`
- `BRIDGEDESK_SKILL_PATHS`

If a skill appears in `open_workspace`, the model must read that skill's
`SKILL.md` before reading other files inside the skill directory.

## Review Card Does Not Appear

Per-tool widget cards are enabled by default with:

```bash
BRIDGEDESK_WIDGETS=full
```

The aggregate `show_changes` tool is only exposed with
`BRIDGEDESK_WIDGETS=changes`. Plain MCP clients may ignore ChatGPT Apps widget
metadata and only show text results.
