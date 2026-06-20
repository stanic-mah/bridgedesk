# Setup Guide

This guide is for users who want ChatGPT or another MCP host to work in local
projects through BridgeDesk.

For the complete desktop app walkthrough, start with
[BridgeDesk User Guide](user-guide.md). It covers Cloudflare Tunnel
installation, Permanent Tunnel setup, ChatGPT connection, daily use, and
troubleshooting.

## Requirements

- Node `>=20.12 <27`; Node 22 LTS is recommended
- npm
- Git
- Bash, including Git Bash or WSL on Windows
- a public HTTPS URL that forwards to the local BridgeDesk server

The desktop launcher can start a Cloudflare Quick Tunnel when `cloudflared` is
available. CLI-only users can use Cloudflare Tunnel, ngrok, Pinggy, Tailscale
Funnel, or their own HTTPS reverse proxy.

## Desktop Setup

From a local checkout:

```bash
npm install
npm run desktop
```

The launcher checks local tools, saves the selected project folder, starts the
tunnel and server processes, and gives you the MCP URL and Owner password to use
in the MCP client.

## CLI Setup

Run:

```bash
npx bridgedesk init
```

The setup flow asks one question at a time.

### Project Roots

Choose the folders ChatGPT is allowed to open through BridgeDesk. Keep this
narrow.

Examples:

```text
~/personal,~/work
```

```text
/Users/alice/dev,/Users/alice/work
```

```text
C:\Users\alice\dev,C:\Users\alice\work
```

### Local Port

The default is `7676`.

The local MCP URL is:

```text
http://127.0.0.1:7676/mcp
```

### Public Base URL

Start your tunnel or reverse proxy before entering this value. Point the tunnel
at:

```text
http://127.0.0.1:7676
```

Enter the public origin without `/mcp`:

```text
https://your-tunnel-host.example.com
```

Configure the MCP client with the full MCP endpoint:

```text
https://your-tunnel-host.example.com/mcp
```

## Start The Server

Run:

```bash
npx bridgedesk serve
```

If your tunnel URL changes for one run, override it without rewriting config:

```bash
BRIDGEDESK_PUBLIC_BASE_URL="https://new-tunnel.example.com" npx bridgedesk serve
```

For a stable public URL, persist it:

```bash
npx bridgedesk config set publicBaseUrl https://bridgedesk.example.com
npx bridgedesk serve
```

## Approve The Client

When ChatGPT, Claude, or another MCP client connects, BridgeDesk shows an Owner
password approval page. Enter the Owner password printed during setup.

The default config files are:

```text
~/.bridgedesk/config.json
~/.bridgedesk/auth.json
```

Keep `auth.json` private.

## Check Your Setup

Run:

```bash
npx bridgedesk doctor
```

The doctor command reports the resolved config, Node version, Node ABI, platform,
Git, Bash, public URL, allowed hosts, and SQLite native dependency status.

## Running From A Local Checkout

If you are developing BridgeDesk itself instead of using the published package:

```bash
npm install --include=dev
npm run dev
```

The same setup rules apply.
