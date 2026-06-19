import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from "electron";
import type { AppUpdater } from "electron-updater";
import {
  generateOwnerToken,
  loadBridgeDeskFiles,
  writeBridgeDeskAuth,
  writeBridgeDeskConfig,
} from "../user-config.js";

type CheckStatus = "ok" | "missing" | "busy" | "error";
type TunnelMode = "quick" | "permanent";
type LogSource = "system" | "tunnel" | "server";

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
  tunnelMode: TunnelMode;
}

type UpdateState =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

interface AppInfo {
  version: string;
  isPackaged: boolean;
  latestReleaseUrl: string;
  releasesUrl: string;
  updateSupported: boolean;
}

interface UpdateStatus {
  state: UpdateState;
  message: string;
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  error: string | null;
}

interface UpdateInfoLike {
  version?: string;
  releaseName?: string | null;
}

interface UpdateProgressLike {
  percent?: number;
}

interface SaveConfigInput {
  projectRoot: string;
  publicBaseUrl?: string | null;
  port: number;
  tunnelMode?: TunnelMode;
  permanentTunnelName?: string | null;
  permanentHostname?: string | null;
}

interface StartTunnelInput {
  projectRoot: string | null;
  publicBaseUrl?: string | null;
  port: number;
  tunnelMode?: TunnelMode;
  permanentTunnelName?: string | null;
  permanentHostname?: string | null;
}

interface CloudflareTunnelInput {
  tunnelName?: string | null;
  hostname?: string | null;
}

const DEFAULT_PORT = 7676;
const DEFAULT_TUNNEL_MODE: TunnelMode = "quick";
const DEFAULT_PERMANENT_TUNNEL_NAME = "bridgedesk";
const APP_ID = "com.bridgedesk.app";
const RELEASES_URL = "https://github.com/stanic-mah/bridgedesk/releases";
const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;
const LATEST_YML_URL = `${LATEST_RELEASE_URL}/download/latest.yml`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "../cli.js");
const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as { autoUpdater: AppUpdater };
const isWindows = process.platform === "win32";
const WINDOWS_BASH_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
];
const WINDOWS_CLOUDFLARED_CANDIDATES = [
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
];
const TRAY_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAUElEQVR4nGOQjw34P5CYYdQBow4YdcCoA7AJ4gK4DCFV/dBxAK3ERx0wdBxAbKIavg4Y8CgYdcCAOwAdEEqExKof/A6gJx51wKgDRh0w6gAA2gFNvcCqitUAAAAASUVORK5CYII=";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let tunnelProcess: ChildProcess | null = null;
let serverProcess: ChildProcess | null = null;
let attachedServerPort: number | null = null;
let cloudflaredSetupProcess: ChildProcess | null = null;
let currentPublicBaseUrl: string | null = null;
let currentOwnerToken: string | null = null;
let currentTunnelMode: TunnelMode = DEFAULT_TUNNEL_MODE;
let isQuitting = false;
let updaterConfigured = false;
let updatePromptOpen = false;
let updateInstallPromptOpen = false;
let updateStatus: UpdateStatus = {
  state: app.isPackaged ? "idle" : "disabled",
  message: app.isPackaged ? "Ready to check for updates." : "Update checks run in the installed app.",
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: null,
  error: null,
};

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
  mainWindow.on("close", (event) => {
    if (isQuitting || !hasActiveSession()) return;
    event.preventDefault();
    mainWindow?.hide();
    sendLog("system", "BridgeDesk is still running in the system tray. Use Stop All or Quit BridgeDesk to end the session.");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  sendState();
  sendUpdateStatus();
}

function hasActiveSession(): boolean {
  return Boolean(tunnelProcess || serverProcess || attachedServerPort);
}

function createTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  tray = new Tray(icon);
  tray.on("click", () => showMainWindow());
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;
  const serverStatus = isServerRunning() ? "Server running" : "Server stopped";
  const tunnelStatus = tunnelProcess ? "Tunnel running" : "Tunnel stopped";
  tray.setToolTip(`BridgeDesk - ${tunnelStatus}, ${serverStatus}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show BridgeDesk", click: () => showMainWindow() },
      { label: `${tunnelStatus} / ${serverStatus}`, enabled: false },
      { type: "separator" },
      { label: "Stop Server", enabled: isServerRunning(), click: () => void stopServer() },
      { label: "Stop All", enabled: hasActiveSession(), click: () => void stopAll() },
      { type: "separator" },
      { label: "Quit BridgeDesk", click: () => quitApp() },
    ]),
  );
}

function quitApp(): void {
  isQuitting = true;
  void stopAll().finally(() => app.quit());
}

function liveMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return null;
  return mainWindow;
}

function sendState(): void {
  const mcpUrl = currentPublicBaseUrl ? `${currentPublicBaseUrl.replace(/\/+$/, "")}/mcp` : null;
  const state: LauncherState = {
    tunnelRunning: Boolean(tunnelProcess),
    serverRunning: isServerRunning(),
    publicBaseUrl: currentPublicBaseUrl,
    mcpUrl,
    tunnelMode: currentTunnelMode,
  };
  liveMainWindow()?.webContents.send("state:update", state);
  updateTrayMenu();
}

function redact(text: string): string {
  let output = text;
  if (currentOwnerToken) {
    output = output.replaceAll(currentOwnerToken, "[redacted-owner-password]");
  }
  output = output.replace(/(BRIDGEDESK_OAUTH_OWNER_TOKEN=)[^\s]+/g, "$1[redacted]");
  output = output.replace(/(Owner password:\s*)[A-Za-z0-9_-]{16,}/g, "$1[redacted]");
  output = output.replace(/([?&](?:token|key|secret|credentials|credentials-contents)=)[^\s&]+/gi, "$1[redacted]");
  output = output.replace(/(--(?:token|credentials-contents)\s+)\S+/gi, "$1[redacted]");
  output = output.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]");
  return output;
}

function sendLog(source: LogSource, message: string): void {
  const lines = redact(message)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    liveMainWindow()?.webContents.send("log", {
      source,
      message: line,
      time: new Date().toISOString(),
    });
  }
}

function sendUpdateStatus(): void {
  liveMainWindow()?.webContents.send("update:status", updateStatus);
}

function setUpdateStatus(next: Partial<UpdateStatus>): UpdateStatus {
  updateStatus = {
    ...updateStatus,
    ...next,
    currentVersion: app.getVersion(),
  };
  sendUpdateStatus();
  return updateStatus;
}

function getAppInfo(): AppInfo {
  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    latestReleaseUrl: LATEST_RELEASE_URL,
    releasesUrl: RELEASES_URL,
    updateSupported: app.isPackaged && process.platform === "win32",
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  const window = liveMainWindow();
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return;
  updaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      message: "Checking for updates...",
      availableVersion: null,
      percent: null,
      error: null,
    });
  });

  autoUpdater.on("update-available", (info: UpdateInfoLike) => {
    const version = info.version ?? "new version";
    setUpdateStatus({
      state: "available",
      message: `BridgeDesk ${version} is available.`,
      availableVersion: info.version ?? null,
      percent: null,
      error: null,
    });
    void promptForUpdateDownload(info);
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateStatus({
      state: "not-available",
      message: `BridgeDesk ${app.getVersion()} is up to date.`,
      availableVersion: null,
      percent: null,
      error: null,
    });
  });

  autoUpdater.on("download-progress", (progress: UpdateProgressLike) => {
    const percent = typeof progress.percent === "number" ? Math.round(progress.percent) : null;
    setUpdateStatus({
      state: "downloading",
      message: percent === null ? "Downloading update..." : `Downloading update... ${percent}%`,
      percent,
      error: null,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfoLike) => {
    const version = info.version ?? updateStatus.availableVersion;
    setUpdateStatus({
      state: "downloaded",
      message: version ? `BridgeDesk ${version} is ready to install.` : "Update is ready to install.",
      availableVersion: version ?? null,
      percent: 100,
      error: null,
    });
    void promptForUpdateInstall(info);
  });

  autoUpdater.on("error", (error: Error) => {
    const message = formatError(error);
    setUpdateStatus({
      state: "error",
      message: "Update check failed.",
      error: message,
      percent: null,
    });
    sendLog("system", `Update check failed: ${message}`);
  });
}

async function promptForUpdateDownload(info: UpdateInfoLike): Promise<void> {
  if (updatePromptOpen) return;
  updatePromptOpen = true;
  try {
    const version = info.version ?? "a newer version";
    const result = await showMessageBox({
      type: "info",
      title: "BridgeDesk update available",
      message: `BridgeDesk ${version} is available.`,
      detail: `You are using BridgeDesk ${app.getVersion()}. Download the update now?`,
      buttons: ["Download Update", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) {
      setUpdateStatus({
        state: "available",
        message: `BridgeDesk ${version} is available. Use Check Updates when you are ready.`,
      });
      return;
    }
    setUpdateStatus({
      state: "downloading",
      message: "Downloading update...",
      percent: 0,
      error: null,
    });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    const message = formatError(error);
    setUpdateStatus({
      state: "error",
      message: "Update download failed.",
      error: message,
      percent: null,
    });
    sendLog("system", `Update download failed: ${message}`);
  } finally {
    updatePromptOpen = false;
  }
}

async function promptForUpdateInstall(info: UpdateInfoLike): Promise<void> {
  if (updateInstallPromptOpen) return;
  updateInstallPromptOpen = true;
  try {
    const version = info.version ?? updateStatus.availableVersion ?? "the update";
    const result = await showMessageBox({
      type: "info",
      title: "BridgeDesk update ready",
      message: `BridgeDesk ${version} is ready to install.`,
      detail: "BridgeDesk will restart to finish installing the update.",
      buttons: ["Restart and Install", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return;
    isQuitting = true;
    stopAll();
    autoUpdater.quitAndInstall(false, true);
  } finally {
    updateInstallPromptOpen = false;
  }
}

async function checkForUpdates(trigger: "auto" | "manual"): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return setUpdateStatus({
      state: "disabled",
      message: "Update checks run in the installed app.",
      error: null,
      percent: null,
    });
  }
  if (process.platform !== "win32") {
    return setUpdateStatus({
      state: "disabled",
      message: "Automatic updates are currently available for Windows installer builds.",
      error: null,
      percent: null,
    });
  }
  if (updateStatus.state === "checking" || updateStatus.state === "downloading") return updateStatus;

  try {
    setUpdateStatus({
      state: "checking",
      message: trigger === "manual" ? "Checking for updates..." : "Checking for updates on launch...",
      error: null,
      percent: null,
    });

    const latestVersion = await fetchLatestReleaseVersion();
    if (latestVersion) {
      const comparison = compareAppVersions(latestVersion, app.getVersion());
      if (comparison <= 0) {
        return setUpdateStatus({
          state: "not-available",
          message: `BridgeDesk ${app.getVersion()} is up to date.`,
          availableVersion: null,
          percent: null,
          error: null,
        });
      }
      setUpdateStatus({
        state: "available",
        message: `BridgeDesk ${latestVersion} is available.`,
        availableVersion: latestVersion,
        percent: null,
        error: null,
      });
    }

    configureAutoUpdater();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = formatError(error);
    if (message.includes("semver_1.eq") && updateStatus.state === "available") {
      sendLog("system", `Automatic update check failed; use Releases to download BridgeDesk ${updateStatus.availableVersion}.`);
      return updateStatus;
    }
    setUpdateStatus({
      state: "error",
      message: "Update check failed.",
      error: message,
      percent: null,
    });
    sendLog("system", `Update check failed: ${message}`);
  }
  return updateStatus;
}

async function fetchLatestReleaseVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_YML_URL, {
      headers: { "User-Agent": `BridgeDesk/${app.getVersion()}` },
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)/m)?.[1] ?? null;
  } catch (error) {
    sendLog("system", `Latest version precheck failed: ${formatError(error)}`);
    return null;
  }
}

function compareAppVersions(left: string, right: string): number {
  const parseVersion = (value: string): number[] =>
    value
      .split(".")
      .slice(0, 3)
      .map((part) => Number(part.replace(/\D.*$/, "")) || 0);
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizePublicBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  if (parsed.pathname.toLowerCase() === "/mcp") {
    parsed.pathname = "";
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeUrlInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizePermanentHostname(value: string | null | undefined): string | null {
  const normalized = normalizePublicBaseUrl(normalizeUrlInput(value));
  if (!normalized) return null;
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:") {
    throw new Error("Permanent Tunnel URL must start with https://.");
  }
  if (parsed.hostname.endsWith(".trycloudflare.com")) {
    throw new Error("Permanent Tunnel mode needs your fixed Cloudflare hostname, not a Quick Tunnel URL.");
  }
  if (parsed.pathname && parsed.pathname !== "/") {
    throw new Error("Permanent Tunnel URL should be the fixed hostname only, without /mcp or any other path.");
  }
  return normalized;
}

function isServerRunning(): boolean {
  return Boolean(serverProcess || attachedServerPort);
}

async function isBridgeDeskServerRunning(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-authorization-server`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const metadata = (await response.json()) as Record<string, unknown>;
    return (
      typeof metadata.authorization_endpoint === "string" &&
      typeof metadata.token_endpoint === "string" &&
      typeof metadata.registration_endpoint === "string" &&
      Array.isArray(metadata.scopes_supported) &&
      metadata.scopes_supported.includes("bridgedesk")
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function listeningPidForPort(port: number): Promise<number | null> {
  if (!isWindows) return null;
  const result = await runCommand("netstat", ["-ano", "-p", "tcp"]);
  if (!result.ok) return null;
  const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*TCP\\s+\\S+:${escapedPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "im");
  const match = result.text.match(pattern);
  return match ? Number(match[1]) : null;
}

function stopProcessId(pid: number): void {
  if (isWindows) {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      shell: commandShellOption(),
      windowsHide: true,
      stdio: "ignore",
    });
  }
}

function normalizeTunnelMode(value: unknown): TunnelMode {
  return value === "permanent" ? "permanent" : "quick";
}

function normalizeTunnelName(value: string | null | undefined): string {
  const trimmed = value?.trim() || DEFAULT_PERMANENT_TUNNEL_NAME;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(trimmed)) {
    throw new Error("Cloudflare tunnel name can use letters, numbers, dashes, underscores, and dots.");
  }
  return trimmed;
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

function yamlSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function parseTunnelId(output: string): string | null {
  return (
    output.match(/\bID:\s*([0-9a-f-]{36})\b/i)?.[1] ??
    output.match(/\bYour tunnel\s+([0-9a-f-]{36})\b/i)?.[1] ??
    null
  );
}

async function resolveTunnelId(tunnelName: string): Promise<string> {
  const cloudflared = getCloudflaredCommand();
  const result = await runCommand(cloudflared, ["tunnel", "info", tunnelName], 30000);
  const tunnelId = parseTunnelId(result.text);
  if (!result.ok && !tunnelId) {
    throw new Error(`Could not find Cloudflare tunnel "${tunnelName}". Run Create Tunnel first.`);
  }
  if (!tunnelId) {
    throw new Error(`Could not read the Cloudflare tunnel ID for "${tunnelName}".`);
  }
  return tunnelId;
}

async function writePermanentTunnelConfig(
  tunnelName: string,
  permanentHostname: string,
  port: number,
): Promise<string> {
  const tunnelId = await resolveTunnelId(tunnelName);
  const files = loadBridgeDeskFiles();
  const cloudflaredDir = join(homedir(), ".cloudflared");
  const credentialsFile = join(cloudflaredDir, `${tunnelId}.json`);
  if (!existsSync(credentialsFile)) {
    throw new Error(`Cloudflare credentials were not found for tunnel "${tunnelName}". Run Create Tunnel first.`);
  }

  mkdirSync(files.dir, { recursive: true });
  const configPath = join(files.dir, "cloudflared-config.yml");
  const hostname = new URL(permanentHostname).hostname;
  const configText = [
    `tunnel: ${tunnelId}`,
    `credentials-file: ${yamlSingleQuoted(credentialsFile)}`,
    "",
    "ingress:",
    `  - hostname: ${hostname}`,
    `    service: http://127.0.0.1:${port}`,
    "  - service: http_status:404",
    "",
  ].join("\n");
  writeFileSync(configPath, configText, { encoding: "utf8", mode: 0o600 });
  return configPath;
}

async function checkPort(port: number): Promise<SystemCheck> {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once("error", () => {
      void (async () => {
        if (await isBridgeDeskServerRunning(port)) {
          attachedServerPort = port;
          sendState();
          resolveCheck({
            id: "port",
            label: `Port ${port}`,
            status: "ok",
            detail: "BridgeDesk already running",
          });
          return;
        }
        resolveCheck({
          id: "port",
          label: `Port ${port}`,
          status: "busy",
          detail: "Already in use",
        });
      })();
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
  currentTunnelMode = normalizeTunnelMode(files.config.tunnelMode);
  currentPublicBaseUrl = files.config.publicBaseUrl ?? files.config.permanentHostname ?? null;
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
  const tunnelMode = normalizeTunnelMode(input.tunnelMode ?? files.config.tunnelMode);
  const permanentTunnelName = normalizeTunnelName(input.permanentTunnelName ?? files.config.permanentTunnelName);
  const permanentHostname =
    input.permanentHostname === undefined
      ? normalizePermanentHostname(files.config.permanentHostname)
      : normalizePermanentHostname(input.permanentHostname);
  const publicBaseUrl =
    tunnelMode === "permanent" ? permanentHostname : normalizePublicBaseUrl(input.publicBaseUrl);

  writeBridgeDeskConfig({
    ...files.config,
    host: "127.0.0.1",
    port: input.port || DEFAULT_PORT,
    allowedRoots: [projectRoot],
    publicBaseUrl,
    tunnelMode,
    permanentTunnelName,
    permanentHostname,
  });

  writeBridgeDeskAuth({
    ownerToken: files.auth.ownerToken ?? generateOwnerToken(),
  });

  currentPublicBaseUrl = publicBaseUrl;
  currentTunnelMode = tunnelMode;
  const summary = getConfigSummary();
  sendState();
  return summary;
}

function captureTunnelUrl(text: string, projectRoot: string | null, port: number): void {
  if (currentTunnelMode !== "quick") return;
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  currentPublicBaseUrl = match[0];
  if (projectRoot) {
    try {
      saveConfig({ projectRoot, publicBaseUrl: currentPublicBaseUrl, port, tunnelMode: "quick" });
    } catch (error) {
      sendLog("system", error instanceof Error ? error.message : String(error));
    }
  }
  sendState();
}

function startQuickTunnel(input: StartTunnelInput): void {
  if (tunnelProcess) return;
  currentTunnelMode = "quick";
  const cloudflared = getCloudflaredCommand();
  const port = input.port || DEFAULT_PORT;
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
    captureTunnelUrl(text, input.projectRoot, port);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    sendLog("tunnel", text);
    captureTunnelUrl(text, input.projectRoot, port);
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

async function startPermanentTunnel(input: StartTunnelInput): Promise<void> {
  if (tunnelProcess) return;
  const permanentHostname = normalizePermanentHostname(input.permanentHostname ?? input.publicBaseUrl);
  if (!permanentHostname) {
    throw new Error("Enter a fixed HTTPS hostname before starting a Permanent Tunnel.");
  }
  const tunnelName = normalizeTunnelName(input.permanentTunnelName);
  const port = input.port || DEFAULT_PORT;
  const cloudflared = getCloudflaredCommand();
  const configPath = await writePermanentTunnelConfig(tunnelName, permanentHostname, port);
  const child = spawn(cloudflared, ["--config", configPath, "tunnel", "run", tunnelName], {
    shell: isWindowsAbsolutePath(cloudflared) ? false : commandShellOption(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  tunnelProcess = child;
  currentTunnelMode = "permanent";
  currentPublicBaseUrl = permanentHostname;

  if (input.projectRoot) {
    try {
      saveConfig({
        projectRoot: input.projectRoot,
        publicBaseUrl: permanentHostname,
        permanentHostname,
        permanentTunnelName: tunnelName,
        tunnelMode: "permanent",
        port,
      });
    } catch (error) {
      sendLog("system", error instanceof Error ? error.message : String(error));
    }
  }

  sendLog("tunnel", `Starting permanent Cloudflare tunnel ${tunnelName} for http://127.0.0.1:${port}`);
  sendLog("tunnel", `Using Cloudflare config ${configPath}`);
  sendState();

  child.stdout?.on("data", (chunk: Buffer) => sendLog("tunnel", chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => sendLog("tunnel", chunk.toString()));
  child.on("error", (error) => {
    sendLog("tunnel", error.message);
  });
  child.on("close", (code) => {
    sendLog("tunnel", `Tunnel stopped with code ${code ?? "unknown"}`);
    tunnelProcess = null;
    sendState();
  });
}

async function startTunnel(input: StartTunnelInput): Promise<void> {
  const tunnelMode = normalizeTunnelMode(input.tunnelMode);
  if (tunnelMode === "permanent") {
    await startPermanentTunnel(input);
    return;
  }
  startQuickTunnel(input);
}

async function startServer(input: SaveConfigInput): Promise<void> {
  const projectRoot = validateProjectRoot(input.projectRoot);
  const tunnelMode = normalizeTunnelMode(input.tunnelMode);
  const permanentTunnelName = normalizeTunnelName(input.permanentTunnelName);
  const permanentHostname =
    tunnelMode === "permanent"
      ? normalizePermanentHostname(input.permanentHostname ?? input.publicBaseUrl)
      : normalizePermanentHostname(input.permanentHostname);
  const publicBaseUrl =
    tunnelMode === "permanent" ? permanentHostname : normalizePublicBaseUrl(input.publicBaseUrl);
  if (!publicBaseUrl) {
    throw new Error(
      tunnelMode === "permanent"
        ? "Enter a fixed HTTPS hostname before starting BridgeDesk."
        : "A public tunnel URL is required before starting BridgeDesk.",
    );
  }
  const port = input.port || DEFAULT_PORT;
  saveConfig({
    projectRoot,
    publicBaseUrl,
    permanentHostname,
    permanentTunnelName,
    tunnelMode,
    port,
  });

  if (serverProcess) return;
  if (attachedServerPort === port) {
    currentPublicBaseUrl = publicBaseUrl;
    sendState();
    return;
  }
  if (attachedServerPort !== null) {
    attachedServerPort = null;
  }

  if (await isBridgeDeskServerRunning(port)) {
    attachedServerPort = port;
    currentPublicBaseUrl = publicBaseUrl;
    sendLog("server", `Using BridgeDesk already running on http://127.0.0.1:${port}/mcp`);
    sendState();
    return;
  }

  const child = spawn("node", [cliPath, "serve"], {
    shell: commandShellOption(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      BRIDGEDESK_ALLOWED_ROOTS: projectRoot,
      BRIDGEDESK_PUBLIC_BASE_URL: publicBaseUrl,
    },
  });
  serverProcess = child;

  attachedServerPort = null;
  sendLog("server", `Starting BridgeDesk on http://127.0.0.1:${port}/mcp`);
  sendState();

  child.stdout?.on("data", (chunk: Buffer) => sendLog("server", chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => sendLog("server", chunk.toString()));
  child.on("error", (error) => sendLog("server", error.message));
  child.on("close", (code) => {
    sendLog("server", `BridgeDesk stopped with code ${code ?? "unknown"}`);
    serverProcess = null;
    attachedServerPort = null;
    sendState();
  });
}

function runCloudflaredTask(label: string, args: string[], timeoutMs = 120000): Promise<void> {
  if (cloudflaredSetupProcess) {
    throw new Error("A Cloudflare setup step is already running.");
  }
  const cloudflared = getCloudflaredCommand();
  sendLog("tunnel", `${label}: cloudflared ${args.join(" ")}`);

  return new Promise((resolveTask, rejectTask) => {
    const child = spawn(cloudflared, args, {
      shell: isWindowsAbsolutePath(cloudflared) ? false : commandShellOption(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    cloudflaredSetupProcess = child;
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cloudflaredSetupProcess = null;
      if (error) {
        rejectTask(error);
        return;
      }
      resolveTask();
    };

    const timer = setTimeout(() => {
      stopProcess(child);
      finish(new Error(`${label} timed out.`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => sendLog("tunnel", chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => sendLog("tunnel", chunk.toString()));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) {
        sendLog("tunnel", `${label} completed.`);
        finish();
        return;
      }
      finish(new Error(`${label} failed with code ${code ?? "unknown"}.`));
    });
  });
}

function cloudflareLogin(): Promise<void> {
  return runCloudflaredTask("Cloudflare login", ["tunnel", "login"], 300000);
}

function createNamedTunnel(input: CloudflareTunnelInput): Promise<void> {
  const tunnelName = normalizeTunnelName(input.tunnelName);
  return runCloudflaredTask("Create named tunnel", ["tunnel", "create", tunnelName]);
}

function routeTunnelDns(input: CloudflareTunnelInput): Promise<void> {
  const tunnelName = normalizeTunnelName(input.tunnelName);
  const permanentHostname = normalizePermanentHostname(input.hostname);
  if (!permanentHostname) {
    throw new Error("Enter a fixed HTTPS hostname before routing DNS.");
  }
  return runCloudflaredTask("Route DNS", ["tunnel", "route", "dns", tunnelName, new URL(permanentHostname).hostname]);
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

async function stopServer(): Promise<void> {
  if (serverProcess) {
    stopProcess(serverProcess);
    serverProcess = null;
    attachedServerPort = null;
    sendState();
    return;
  }
  if (attachedServerPort) {
    const port = attachedServerPort;
    const pid = await listeningPidForPort(port);
    if (pid) {
      stopProcessId(pid);
      sendLog("server", `Stopped BridgeDesk already running on port ${port}.`);
    } else {
      sendLog("server", `Could not find the background BridgeDesk server on port ${port}.`);
    }
    attachedServerPort = null;
  }
  sendState();
}

async function stopAll(): Promise<void> {
  stopProcess(serverProcess);
  stopProcess(tunnelProcess);
  stopProcess(cloudflaredSetupProcess);
  if (!serverProcess && attachedServerPort) {
    await stopServer();
  }
  serverProcess = null;
  tunnelProcess = null;
  cloudflaredSetupProcess = null;
  attachedServerPort = null;
  sendState();
}

app.setAppUserModelId(APP_ID);

ipcMain.handle("system:checks", (_event, port: number) => getSystemChecks(port || DEFAULT_PORT));
ipcMain.handle("app:info", () => getAppInfo());
ipcMain.handle("update:status", () => updateStatus);
ipcMain.handle("update:check", () => checkForUpdates("manual"));
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
ipcMain.handle("tunnel:start", (_event, input: StartTunnelInput) => startTunnel({ ...input, port: input.port || DEFAULT_PORT }));
ipcMain.handle("cloudflare:login", () => cloudflareLogin());
ipcMain.handle("cloudflare:createTunnel", (_event, input: CloudflareTunnelInput) => createNamedTunnel(input));
ipcMain.handle("cloudflare:routeDns", (_event, input: CloudflareTunnelInput) => routeTunnelDns(input));
ipcMain.handle("server:start", (_event, input: SaveConfigInput) => startServer(input));
ipcMain.handle("server:stop", () => stopServer());
ipcMain.handle("processes:stopAll", () => stopAll());
ipcMain.handle("clipboard:write", (_event, text: string) => {
  clipboard.writeText(text);
});
ipcMain.handle("external:open", (_event, url: string) => shell.openExternal(url));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    createMainWindow();
    createTray();
    void checkForUpdates("auto");
    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopAll();
});

app.on("window-all-closed", () => {
  if (!hasActiveSession() && process.platform !== "darwin") app.quit();
});
