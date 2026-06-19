import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import {
  generateOwnerToken,
  loadBridgeDeskFiles,
  writeBridgeDeskAuth,
  writeBridgeDeskConfig,
} from "../user-config.js";

type CheckStatus = "ok" | "missing" | "busy" | "error";

interface SystemCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface LauncherState {
  tunnelRunning: boolean;
  serverRunning: boolean;
  publicBaseUrl: string | null;
  mcpUrl: string | null;
}

interface SaveConfigInput {
  projectRoot: string;
  publicBaseUrl?: string | null;
  port: number;
}

const DEFAULT_PORT = 7676;
const APP_ID = "com.bridgedesk.app";
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../cli.js");
const isWindows = process.platform === "win32";
const WINDOWS_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
];
const WINDOWS_CLOUDFLARED_CANDIDATES = [
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
];

let mainWindow: BrowserWindow | null = null;
let tunnelProcess: ChildProcess | null = null;
let serverProcess: ChildProcess | null = null;
let currentPublicBaseUrl: string | null = null;
let currentOwnerToken: string | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: "BridgeDesk",
    backgroundColor: "#f7f7f2",
    webPreferences: {
      preload: resolve(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(resolve(__dirname, "index.html"));
}

function sendState(): void {
  const mcpUrl = currentPublicBaseUrl ? `${currentPublicBaseUrl.replace(/\/+$/, "")}/mcp` : null;
  const state: LauncherState = {
    tunnelRunning: Boolean(tunnelProcess),
    serverRunning: Boolean(serverProcess),
    publicBaseUrl: currentPublicBaseUrl,
    mcpUrl,
  };
  mainWindow?.webContents.send("state:update", state);
}

function redact(text: string): string {
  let output = text;
  if (currentOwnerToken) {
    output = output.replaceAll(currentOwnerToken, "[redacted-owner-password]");
  }
  output = output.replace(/(BRIDGEDESK_OAUTH_OWNER_TOKEN=)[^\s]+/g, "$1[redacted]");
  output = output.replace(/(Owner password:\s*)[A-Za-z0-9_-]{16,}/g, "$1[redacted]");
  return output;
}

function sendLog(source: "system" | "tunnel" | "server", message: string): void {
  const lines = redact(message)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    mainWindow?.webContents.send("log", {
      source,
      message: line,
      time: new Date().toISOString(),
    });
  }
}

function normalizePublicBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function validateProjectRoot(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  const root = parse(resolved).root;
  if (resolved.toLowerCase() === root.toLowerCase().replace(/[\\/]$/, "").toLowerCase()) {
    throw new Error("Choose a project folder, not the drive root.");
  }
  if (resolved.toLowerCase() === homedir().toLowerCase()) {
    throw new Error("Choose a project folder, not the whole user folder.");
  }
  return resolved;
}

function commandShellOption(): boolean {
  return isWindows;
}

function isWindowsAbsolutePath(command: string): boolean {
  return isWindows && /^[a-zA-Z]:[\\/]/.test(command);
}

function runCommand(command: string, args: string[], timeoutMs = 5000): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      shell: isWindowsAbsolutePath(command) ? false : commandShellOption(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    const timer = setTimeout(() => {
      child.kill();
      resolveCommand({ ok: false, text: "Timed out" });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveCommand({ ok: false, text: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveCommand({ ok: code === 0, text: text.trim() });
    });
  });
}

async function checkCommand(id: string, label: string, command: string, args: string[]): Promise<SystemCheck> {
  const result = await runCommand(command, args);
  return {
    id,
    label,
    status: result.ok ? "ok" : "missing",
    detail: result.text || (result.ok ? "Available" : "Not found"),
  };
}

async function checkBash(): Promise<SystemCheck> {
  const direct = await runCommand("bash", ["--version"]);
  if (direct.ok) {
    return { id: "bash", label: "Git Bash", status: "ok", detail: direct.text.split(/\r?\n/)[0] ?? "Available" };
  }
  if (isWindows) {
    for (const candidate of WINDOWS_BASH_CANDIDATES) {
      const result = await runCommand(candidate, ["--version"]);
      if (result.ok) {
        return { id: "bash", label: "Git Bash", status: "ok", detail: candidate };
      }
    }
  }
  return { id: "bash", label: "Git Bash", status: "missing", detail: "Not found" };
}

async function checkCloudflared(): Promise<SystemCheck> {
  const direct = await runCommand("cloudflared", ["--version"]);
  if (direct.ok) {
    return {
      id: "cloudflared",
      label: "Cloudflare Tunnel",
      status: "ok",
      detail: direct.text.split(/\r?\n/)[0] ?? "Available",
    };
  }
  if (isWindows) {
    for (const candidate of WINDOWS_CLOUDFLARED_CANDIDATES) {
      const result = await runCommand(candidate, ["--version"]);
      if (result.ok) {
        return { id: "cloudflared", label: "Cloudflare Tunnel", status: "ok", detail: candidate };
      }
    }
  }
  return { id: "cloudflared", label: "Cloudflare Tunnel", status: "missing", detail: direct.text || "Not found" };
}

function getCloudflaredCommand(): string {
  if (isWindows) {
    for (const candidate of WINDOWS_CLOUDFLARED_CANDIDATES) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "cloudflared";
}

async function checkPort(port: number): Promise<SystemCheck> {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", () => {
      resolveCheck({
        id: "port",
        label: `Port ${port}`,
        status: "busy",
        detail: "Already in use",
      });
    });
    server.once("listening", () => {
      server.close(() => {
        resolveCheck({
          id: "port",
          label: `Port ${port}`,
          status: "ok",
          detail: "Available",
        });
      });
    });
    server.listen(port, "127.0.0.1");
  });
}

async function getSystemChecks(port: number): Promise<SystemCheck[]> {
  const [node, npm, git, bash, cloudflared, portCheck] = await Promise.all([
    checkCommand("node", "Node", "node", ["--version"]),
    checkCommand("npm", "npm", "npm", ["--version"]),
    checkCommand("git", "Git", "git", ["--version"]),
    checkBash(),
    checkCloudflared(),
    checkPort(port),
  ]);
  const cli = await runCommand("node", [cliPath, "help"]);
  return [
    node,
    npm,
    git,
    bash,
    {
      id: "bridgedesk",
      label: "BridgeDesk CLI",
      status: cli.ok ? "ok" : "error",
      detail: cli.ok ? "Bundled CLI ready" : cli.text,
    },
    cloudflared,
    portCheck,
  ];
}

function getConfigSummary(): {
  configDir: string;
  configPath: string;
  authPath: string;
  configExists: boolean;
  authExists: boolean;
  config: unknown;
  ownerPassword: string | null;
} {
  const files = loadBridgeDeskFiles();
  currentOwnerToken = files.auth.ownerToken ?? null;
  return {
    configDir: files.dir,
    configPath: files.configPath,
    authPath: files.authPath,
    configExists: files.configExists,
    authExists: files.authExists,
    config: files.config,
    ownerPassword: files.auth.ownerToken ?? null,
  };
}

function saveConfig(input: SaveConfigInput): ReturnType<typeof getConfigSummary> {
  const projectRoot = validateProjectRoot(input.projectRoot);
  const files = loadBridgeDeskFiles();
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl);

  writeBridgeDeskConfig({
    ...files.config,
    host: "127.0.0.1",
    port: input.port || DEFAULT_PORT,
    allowedRoots: [projectRoot],
    publicBaseUrl,
  });

  writeBridgeDeskAuth({
    ownerToken: files.auth.ownerToken ?? generateOwnerToken(),
  });

  currentPublicBaseUrl = publicBaseUrl;
  const summary = getConfigSummary();
  sendState();
  return summary;
}

function captureTunnelUrl(text: string, projectRoot: string | null, port: number): void {
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  currentPublicBaseUrl = match[0];
  if (projectRoot) {
    try {
      saveConfig({ projectRoot, publicBaseUrl: currentPublicBaseUrl, port });
    } catch (error) {
      sendLog("system", error instanceof Error ? error.message : String(error));
    }
  }
  sendState();
}

function startTunnel(projectRoot: string | null, port: number): void {
  if (tunnelProcess) return;
  const cloudflared = getCloudflaredCommand();
  const child = spawn(cloudflared, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
    shell: isWindowsAbsolutePath(cloudflared) ? false : commandShellOption(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  tunnelProcess = child;

  sendLog("tunnel", `Starting Cloudflare tunnel for http://127.0.0.1:${port}`);
  sendState();

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    sendLog("tunnel", text);
    captureTunnelUrl(text, projectRoot, port);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    sendLog("tunnel", text);
    captureTunnelUrl(text, projectRoot, port);
  });
  child.on("error", (error) => {
    sendLog("tunnel", error.message);
  });
  child.on("close", (code) => {
    sendLog("tunnel", `Tunnel stopped with code ${code ?? "unknown"}`);
    tunnelProcess = null;
    sendState();
  });
}

function startServer(input: SaveConfigInput): void {
  if (serverProcess) return;
  const projectRoot = validateProjectRoot(input.projectRoot);
  const publicBaseUrl = normalizePublicBaseUrl(input.publicBaseUrl);
  if (!publicBaseUrl) {
    throw new Error("A public tunnel URL is required before starting BridgeDesk.");
  }
  saveConfig({ projectRoot, publicBaseUrl, port: input.port });

  const child = spawn("node", [cliPath, "serve"], {
    shell: commandShellOption(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(input.port || DEFAULT_PORT),
      BRIDGEDESK_ALLOWED_ROOTS: projectRoot,
      BRIDGEDESK_PUBLIC_BASE_URL: publicBaseUrl,
    },
  });
  serverProcess = child;

  sendLog("server", `Starting BridgeDesk on http://127.0.0.1:${input.port || DEFAULT_PORT}/mcp`);
  sendState();

  child.stdout?.on("data", (chunk: Buffer) => sendLog("server", chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => sendLog("server", chunk.toString()));
  child.on("error", (error) => sendLog("server", error.message));
  child.on("close", (code) => {
    sendLog("server", `BridgeDesk stopped with code ${code ?? "unknown"}`);
    serverProcess = null;
    sendState();
  });
}

function stopProcess(child: ChildProcess | null): void {
  if (!child) return;
  if (isWindows && child.pid) {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      shell: commandShellOption(),
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  child.kill();
}

function stopServer(): void {
  stopProcess(serverProcess);
  serverProcess = null;
  sendState();
}

function stopAll(): void {
  stopProcess(serverProcess);
  stopProcess(tunnelProcess);
  serverProcess = null;
  tunnelProcess = null;
  sendState();
}

app.setAppUserModelId(APP_ID);

ipcMain.handle("system:checks", (_event, port: number) => getSystemChecks(port || DEFAULT_PORT));
ipcMain.handle("dialog:chooseProject", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose project folder",
    properties: ["openDirectory"],
    defaultPath: process.cwd(),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return validateProjectRoot(result.filePaths[0]);
});
ipcMain.handle("config:get", () => getConfigSummary());
ipcMain.handle("config:save", (_event, input: SaveConfigInput) => saveConfig(input));
ipcMain.handle("tunnel:start", (_event, input: { projectRoot: string | null; port: number }) => {
  startTunnel(input.projectRoot, input.port || DEFAULT_PORT);
});
ipcMain.handle("server:start", (_event, input: SaveConfigInput) => startServer(input));
ipcMain.handle("server:stop", () => stopServer());
ipcMain.handle("processes:stopAll", () => stopAll());
ipcMain.handle("clipboard:write", (_event, text: string) => {
  clipboard.writeText(text);
});
ipcMain.handle("external:open", (_event, url: string) => shell.openExternal(url));

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  stopAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
