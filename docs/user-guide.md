# BridgeDesk User Guide

This guide explains how to install and use BridgeDesk on Windows so ChatGPT can
read, edit, search, and run commands against one approved local project folder.

BridgeDesk has three parts:

- BridgeDesk desktop app: chooses the project folder, starts the local server,
  and shows the MCP URL and owner password.
- Cloudflare Tunnel: gives ChatGPT an HTTPS address that reaches BridgeDesk on
  your computer.
- ChatGPT app connection: the MCP entry you add inside ChatGPT.

## 1. Install BridgeDesk

Download the Windows installer:

```text
https://github.com/stanic-mah/bridgedesk/releases/latest/download/BridgeDesk-Setup.exe
```

Run the installer, then open BridgeDesk from the Start menu or desktop shortcut.

Windows may show a SmartScreen warning because early BridgeDesk releases are not
code-signed. Choose the normal "run anyway" option only if you trust the build
you downloaded from the official release page.

## 2. Install Cloudflare Tunnel

BridgeDesk needs `cloudflared`, the Cloudflare Tunnel client, if you want the
app to start tunnels for you.

The easiest Windows install method is:

```powershell
winget install --id Cloudflare.cloudflared
```

After installation, close and reopen BridgeDesk, then select **Refresh Checks**.
The left side should show **Cloudflare Tunnel OK**.

If `winget` is not available, download `cloudflared` from Cloudflare's official
downloads page and make sure `cloudflared.exe` is available on your Windows
PATH.

## 3. Choose Quick Or Permanent Tunnel

BridgeDesk has two tunnel modes.

**Quick Tunnel** is the easiest mode. It creates a random URL like:

```text
https://random-name.trycloudflare.com/mcp
```

Use Quick Tunnel for testing. The URL changes when the tunnel restarts, so you
may need to re-add BridgeDesk in ChatGPT.

**Permanent Tunnel** is the recommended mode for normal use. It uses your
Cloudflare account and a fixed hostname like:

```text
https://mcp.yourdomain.com/mcp
```

Use Permanent Tunnel when you do not want the MCP URL to change after closing
BridgeDesk or restarting the computer.

## 4. Use Quick Tunnel

Quick Tunnel is best for testing or one-time use. It does not need a Cloudflare
account or domain, but the public URL changes when the tunnel restarts.

To use Quick Tunnel:

1. Open BridgeDesk.
2. Select **Choose** beside **Project folder**.
3. Pick only the project folder ChatGPT should work in.
4. Select **Quick** under **Tunnel mode**.
5. Select **Save Config**.
6. Select **Start Tunnel**.
7. Wait until BridgeDesk captures a URL ending in `trycloudflare.com`.
8. Select **Start Server**.
9. Copy the **MCP URL** from BridgeDesk.
10. Add or reconnect BridgeDesk in ChatGPT with that MCP URL.

The Quick Tunnel MCP URL looks like this:

```text
https://random-name.trycloudflare.com/mcp
```

If you select **Stop All**, close BridgeDesk, restart the computer, or the tunnel
disconnects, the next Quick Tunnel URL may be different. When the URL changes,
update or recreate the BridgeDesk app connection in ChatGPT.

## 5. Prepare Cloudflare For Permanent Tunnel

Permanent Tunnel needs:

- a Cloudflare account
- a domain added to Cloudflare
- a subdomain reserved for BridgeDesk, for example `mcp.yourdomain.com`

In Cloudflare, turn off **Bot Fight Mode** for the domain used by BridgeDesk.
ChatGPT connects through automated server requests, and Bot Fight Mode can block
that OAuth traffic before it reaches BridgeDesk. Cloudflare's Free Bot Fight
Mode cannot be skipped with a normal WAF skip rule, so it must be disabled when
it blocks ChatGPT.

The **Block AI bots** setting can usually stay enabled. If ChatGPT stops
connecting later, temporarily disable it for testing.

## 6. Set Up BridgeDesk Permanent Tunnel

Open BridgeDesk and follow these steps:

1. Select **Choose** beside **Project folder**.
2. Pick only the project folder ChatGPT should work in.
3. Select **Permanent** under **Tunnel mode**.
4. Leave **Tunnel name** as `bridgedesk`, unless you need a different name.
5. In **Fixed public URL**, enter your fixed Cloudflare hostname without `/mcp`.

Example:

```text
https://mcp.yourdomain.com
```

Do not enter this:

```text
https://mcp.yourdomain.com/mcp
```

BridgeDesk adds `/mcp` automatically.

6. Select **Save Config**.
7. Select **Cloudflare Login** and complete the browser login.
8. Select **Create Tunnel**.
9. Select **Route DNS**.
10. Select **Start Permanent Tunnel**.
11. Select **Start Server**.

Use **Cloudflare Logout** only when you need to remove this computer's
Cloudflare login and sign in again, for example when switching Cloudflare
accounts. Logout removes the local Cloudflare login certificate, but keeps
existing named tunnel credentials so already-created tunnels can still run.

When both the tunnel and server are running, BridgeDesk shows the final MCP URL:

```text
https://mcp.yourdomain.com/mcp
```

## 7. Add BridgeDesk To ChatGPT

In ChatGPT:

1. Open **Settings**.
2. Go to **Apps**.
3. Create a new app.
4. Set **Name** to `BridgeDesk`.
5. Set **Description** to something like:

```text
Local project workspace access
```

6. Choose **Server URL**.
7. Paste the MCP URL from BridgeDesk.
8. Keep **Authentication** as **OAuth**.
9. Check the warning box that says you understand the risk.
10. Select **Create** or **Connect**.
11. When the BridgeDesk approval page opens, copy the **Owner password** from
    BridgeDesk and paste it into the page.

After the connection finishes, ChatGPT should show BridgeDesk as connected.

When you ask ChatGPT to use BridgeDesk, say:

```text
Use BridgeDesk and open the selected project folder.
```

BridgeDesk lets ChatGPT open the selected project by using `.` or
`selected project`, so you do not need to type the full Windows path unless you
want to.

If it connects but says **No app actions available yet**, click **Refresh** in
ChatGPT. If it still shows no actions, delete the BridgeDesk app entry and
create it again while BridgeDesk tunnel and server are both running.

## 8. Daily Use

For normal use:

1. Open BridgeDesk.
2. Choose the project folder you want ChatGPT to work on.
3. Use **Permanent** mode.
4. Select **Start Permanent Tunnel**.
5. Select **Start Server**.
6. Open ChatGPT and use the existing BridgeDesk app connection.

Changing the project folder does not change the MCP URL in Permanent Tunnel
mode. You do not need to re-add the MCP app in ChatGPT just because you changed
folders.

Closing the BridgeDesk window does not necessarily stop everything. If a tunnel
or server is running, BridgeDesk stays in the Windows system tray. Use **Stop
Server** to stop only the local server, or **Stop All** to stop both the server
and tunnel.

## 9. Switch Project Folder

To switch the local project folder:

1. Open BridgeDesk.
2. Select **Choose** beside **Project folder**.
3. Pick the new project folder.
4. Select **Save Config** if BridgeDesk does not save automatically.
5. Select **Stop Server**.
6. Select **Start Server** again.

In Permanent Tunnel mode, the MCP URL stays the same after switching folders.
You normally do not need to change the BridgeDesk app connection in ChatGPT.

In Quick Tunnel mode, the MCP URL stays the same only while the same Quick
Tunnel process keeps running. If you stop and restart the tunnel, the URL can
change, and you need to update or recreate the ChatGPT app connection.

After switching folders, tell ChatGPT:

```text
Use BridgeDesk and open the selected project folder.
```

If you continue in an existing chat after switching folders, ChatGPT may briefly
show **Stop thinking** or look like it stopped running. Do not interrupt it.
Wait a few seconds. ChatGPT may ask you to connect BridgeDesk again. When that
happens, reconnect and paste the BridgeDesk **Owner password**. After reconnecting,
the same chat should continue working with the new selected folder.

## 10. What ChatGPT Can Do

After connecting, ChatGPT can use BridgeDesk tools to work inside the approved
project folder. Typical actions include:

- open a workspace
- list files
- read files
- search code
- edit files
- write new files
- run shell commands

For safety, BridgeDesk does not default to your whole drive or your whole user
folder. Pick a narrow project folder.

## 11. Troubleshooting

### Cloudflare Tunnel is missing

Install `cloudflared`, reopen BridgeDesk, then select **Refresh Checks**.

### ChatGPT fails after entering the owner password

Turn off Cloudflare **Bot Fight Mode** for the domain. This is the most common
cause when the password page works but ChatGPT cannot finish connecting.

If Bot Fight Mode is already off and ChatGPT still cannot connect, add a
Cloudflare WAF **Skip** custom rule for the BridgeDesk hostname. This is useful
when WAF managed rules, rate limiting, Super Bot Fight Mode, Browser Integrity
Check, or later custom rules are still blocking ChatGPT's OAuth requests.

In Cloudflare, go to **Security > WAF > Custom rules**, create a new rule, and
fill it like this:

```text
Rule name:
BridgeDesk MCP bypass

When incoming requests match:
Field: Hostname
Operator: equals
Value: mcp.yourdomain.com
```

For your current hostname, the expression preview should look like this:

```text
(http.host eq "mcp.yourdomain.com")
```

Then set **Choose action** to **Skip**. For the skip options, select every
available security feature that could interfere with BridgeDesk, especially:

- WAF Managed Rules
- Rate Limiting Rules
- Super Bot Fight Mode, if shown
- Browser Integrity Check, if shown
- remaining custom rules that run after this bypass rule

Then select **Deploy**.

Important: Cloudflare's normal Free **Bot Fight Mode** cannot be skipped by a WAF
Skip rule. If that specific feature is causing the problem, leave it disabled
for the BridgeDesk domain.

### The MCP URL shows `/mcp/mcp`

The **Fixed public URL** field should contain only the hostname:

```text
https://mcp.yourdomain.com
```

The final **MCP URL** field should contain:

```text
https://mcp.yourdomain.com/mcp
```

### Port 7676 is busy

If BridgeDesk says it is already running, you can keep using it. If another
program is using the port, stop that program or change the port in BridgeDesk.

### Quick Tunnel works but Permanent Tunnel fails

Check these items:

- the fixed hostname is routed to the named tunnel
- **Start Permanent Tunnel** is running
- **Start Server** is running
- Cloudflare **Bot Fight Mode** is disabled
- the ChatGPT app URL is exactly `https://your-hostname/mcp`

### ChatGPT connects but no tools appear

Click **Refresh** in ChatGPT. If that does not work, delete and recreate the
BridgeDesk app entry while BridgeDesk is already running.

### ChatGPT stops after switching folders

If ChatGPT shows **Stop thinking** or appears to stop after you switch folders,
wait. Do not click around or cancel the run. ChatGPT may ask you to connect
BridgeDesk again. Reconnect with the BridgeDesk owner password, then continue.

## 12. References

- Cloudflare Tunnel downloads: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
- Cloudflare Tunnel setup: https://developers.cloudflare.com/tunnel/setup/
- Cloudflare Bot Fight Mode false positives: https://developers.cloudflare.com/bots/troubleshooting/false-positives/
- Cloudflare WAF Skip custom rule: https://developers.cloudflare.com/waf/custom-rules/skip/
- Cloudflare WAF Skip options: https://developers.cloudflare.com/waf/custom-rules/skip/options/
- OpenAI MCP documentation: https://developers.openai.com/api/docs/mcp
