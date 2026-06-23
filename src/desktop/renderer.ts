type CheckStatus = "ok" | "missing" | "busy" | "error";
type TunnelMode = "quick" | "permanent";

interface SystemCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

interface ConfigSummary {
  configDir: string;
  configPath: string;
  authPath: string;
  configExists: boolean;
  authExists: boolean;
  config: {
    allowedRoots?: string[];
    publicBaseUrl?: string | null;
    port?: number;
    tunnelMode?: TunnelMode;
    permanentTunnelName?: string | null;
    permanentHostname?: string | null;
  };
  ownerPassword: string | null;
}

interface LauncherState {
  tunnelRunning: boolean;
  serverRunning: boolean;
  publicBaseUrl: string | null;
  mcpUrl: string | null;
  tunnelMode?: TunnelMode;
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

interface LogEntry {
  source: "system" | "tunnel" | "server";
  message: string;
  time: string;
}

interface ConfigInput {
  projectRoot: string;
  publicBaseUrl: string | null;
  port: number;
  tunnelMode: TunnelMode;
  permanentTunnelName: string | null;
  permanentHostname: string | null;
}

interface TunnelInput {
  projectRoot: string | null;
  publicBaseUrl: string | null;
  port: number;
  tunnelMode: TunnelMode;
  permanentTunnelName: string | null;
  permanentHostname: string | null;
}

declare global {
  interface Window {
    bridgeDesk: {
      getAppInfo(): Promise<AppInfo>;
      getSystemChecks(port: number): Promise<SystemCheck[]>;
      getUpdateStatus(): Promise<UpdateStatus>;
      checkForUpdates(): Promise<UpdateStatus>;
      chooseProject(): Promise<string | null>;
      getConfig(): Promise<ConfigSummary>;
      saveConfig(input: ConfigInput): Promise<ConfigSummary>;
      startTunnel(input: TunnelInput): Promise<void>;
      cloudflareLogin(): Promise<void>;
      cloudflareLogout(): Promise<void>;
      createNamedTunnel(input: { tunnelName: string | null }): Promise<void>;
      routeTunnelDns(input: { tunnelName: string | null; hostname: string | null }): Promise<void>;
      startServer(input: ConfigInput): Promise<void>;
      stopServer(): Promise<void>;
      stopAll(): Promise<void>;
      copyText(text: string): Promise<void>;
      openExternal(url: string): Promise<void>;
      onLog(callback: (entry: LogEntry) => void): () => void;
      onStateUpdate(callback: (state: LauncherState) => void): () => void;
      onUpdateStatus(callback: (state: UpdateStatus) => void): () => void;
    };
  }
}

const DEFAULT_PORT = 7676;
const DEFAULT_TUNNEL_NAME = "bridgedesk";

const statusWeight: Record<CheckStatus, number> = {
  ok: 0,
  busy: 1,
  missing: 2,
  error: 3,
};

const state = {
  projectRoot: "",
  publicBaseUrl: "",
  permanentHostname: "",
  permanentTunnelName: DEFAULT_TUNNEL_NAME,
  tunnelMode: "quick" as TunnelMode,
  ownerPassword: "",
  mcpUrl: "",
  checks: [] as SystemCheck[],
  logs: [] as LogEntry[],
  tunnelRunning: false,
  serverRunning: false,
  appInfo: null as AppInfo | null,
  updateStatus: null as UpdateStatus | null,
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const elements = {
  checks: requiredElement<HTMLDivElement>("checks"),
  appVersion: requiredElement<HTMLSpanElement>("app-version"),
  updateStatus: requiredElement<HTMLDivElement>("update-status"),
  checkUpdates: requiredElement<HTMLButtonElement>("check-updates"),
  openReleases: requiredElement<HTMLButtonElement>("open-releases"),
  openGuide: requiredElement<HTMLButtonElement>("open-guide"),
  closeGuide: requiredElement<HTMLButtonElement>("close-guide"),
  guideModal: requiredElement<HTMLDivElement>("guide-modal"),
  projectRoot: requiredElement<HTMLInputElement>("project-root"),
  publicBaseUrl: requiredElement<HTMLInputElement>("public-base-url"),
  permanentHostname: requiredElement<HTMLInputElement>("permanent-hostname"),
  permanentTunnelName: requiredElement<HTMLInputElement>("permanent-tunnel-name"),
  port: requiredElement<HTMLInputElement>("port"),
  mcpUrl: requiredElement<HTMLInputElement>("mcp-url"),
  ownerPassword: requiredElement<HTMLInputElement>("owner-password"),
  log: requiredElement<HTMLPreElement>("log"),
  summary: requiredElement<HTMLDivElement>("summary"),
  refreshChecks: requiredElement<HTMLButtonElement>("refresh-checks"),
  chooseProject: requiredElement<HTMLButtonElement>("choose-project"),
  saveConfig: requiredElement<HTMLButtonElement>("save-config"),
  startTunnel: requiredElement<HTMLButtonElement>("start-tunnel"),
  startPermanentTunnel: requiredElement<HTMLButtonElement>("start-permanent-tunnel"),
  startServer: requiredElement<HTMLButtonElement>("start-server"),
  stopServer: requiredElement<HTMLButtonElement>("stop-server"),
  stopAll: requiredElement<HTMLButtonElement>("stop-all"),
  copyMcp: requiredElement<HTMLButtonElement>("copy-mcp"),
  copyOwner: requiredElement<HTMLButtonElement>("copy-owner"),
  openChatGpt: requiredElement<HTMLButtonElement>("open-chatgpt"),
  quickMode: requiredElement<HTMLButtonElement>("tunnel-mode-quick"),
  permanentMode: requiredElement<HTMLButtonElement>("tunnel-mode-permanent"),
  quickSettings: requiredElement<HTMLDivElement>("quick-tunnel-settings"),
  permanentSettings: requiredElement<HTMLDivElement>("permanent-tunnel-settings"),
  cloudflareLogin: requiredElement<HTMLButtonElement>("cloudflare-login"),
  cloudflareLogout: requiredElement<HTMLButtonElement>("cloudflare-logout"),
  createNamedTunnel: requiredElement<HTMLButtonElement>("create-named-tunnel"),
  routeTunnelDns: requiredElement<HTMLButtonElement>("route-tunnel-dns"),
};

function currentPort(): number {
  const port = Number(elements.port.value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}

function publicUrlForMode(): string {
  return state.tunnelMode === "permanent" ? elements.permanentHostname.value.trim() : elements.publicBaseUrl.value.trim();
}

function normalizeBaseUrlInput(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  const withScheme =
    state.tunnelMode === "permanent" && !/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  try {
    const parsed = new URL(withScheme);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    if (parsed.pathname.toLowerCase() === "/mcp") {
      parsed.pathname = "";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return withScheme.replace(/\/mcp\/?$/i, "").replace(/\/+$/, "");
  }
}

function displayMcpUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrlInput(baseUrl);
  if (!normalized) return "";
  return `${normalized}/mcp`;
}

function syncMcpUrl(): void {
  state.publicBaseUrl = publicUrlForMode();
  state.mcpUrl = displayMcpUrl(state.publicBaseUrl);
  elements.mcpUrl.value = state.mcpUrl;
}

function configInput(): ConfigInput {
  const publicBaseUrl = normalizeBaseUrlInput(elements.publicBaseUrl.value);
  const permanentHostname = normalizeBaseUrlInput(elements.permanentHostname.value);
  return {
    projectRoot: state.projectRoot,
    publicBaseUrl: publicBaseUrl || null,
    port: currentPort(),
    tunnelMode: state.tunnelMode,
    permanentTunnelName: elements.permanentTunnelName.value || null,
    permanentHostname: permanentHostname || null,
  };
}

function tunnelInput(): TunnelInput {
  return {
    ...configInput(),
    projectRoot: state.projectRoot || null,
  };
}

function setMessage(message: string): void {
  state.logs.unshift({
    source: "system",
    message,
    time: new Date().toISOString(),
  });
  state.logs = state.logs.slice(0, 300);
  renderLogs();
}

function setGuideOpen(open: boolean): void {
  elements.guideModal.hidden = !open;
}

function applyConfigSummary(summary: ConfigSummary): void {
  const config = summary.config;
  state.projectRoot = config.allowedRoots?.[0] ?? "";
  state.tunnelMode = config.tunnelMode ?? "quick";
  state.publicBaseUrl = config.publicBaseUrl ?? "";
  state.permanentTunnelName = config.permanentTunnelName || DEFAULT_TUNNEL_NAME;
  state.permanentHostname =
    config.permanentHostname ?? (state.tunnelMode === "permanent" ? config.publicBaseUrl ?? "" : "");
  state.ownerPassword = summary.ownerPassword ?? "";

  elements.projectRoot.value = state.projectRoot;
  elements.publicBaseUrl.value = state.tunnelMode === "quick" ? state.publicBaseUrl : "";
  elements.permanentHostname.value = state.permanentHostname;
  elements.permanentTunnelName.value = state.permanentTunnelName;
  elements.port.value = String(config.port ?? DEFAULT_PORT);
  elements.ownerPassword.value = state.ownerPassword;
  syncMcpUrl();
}

function renderChecks(): void {
  const sorted = [...state.checks].sort((a, b) => statusWeight[a.status] - statusWeight[b.status]);
  elements.checks.replaceChildren(
    ...sorted.map((check) => {
      const row = document.createElement("div");
      row.className = `check check-${check.status}`;

      const label = document.createElement("span");
      label.className = "check-label";
      label.textContent = check.label;

      const status = document.createElement("span");
      status.className = "check-status";
      status.textContent = check.status;

      const detail = document.createElement("span");
      detail.className = "check-detail";
      detail.textContent = check.detail;

      row.append(label, status, detail);
      return row;
    }),
  );
}

function renderSummary(): void {
  const port = currentPort();
  const rows = [
    ["Project", state.projectRoot || "Not selected"],
    ["Mode", state.tunnelMode === "permanent" ? "Permanent Tunnel" : "Quick Tunnel"],
    ["Tunnel", state.publicBaseUrl || "Not set"],
    ["MCP", state.mcpUrl || "Not ready"],
    ["Local", `http://127.0.0.1:${port}/mcp`],
    ["Tunnel process", state.tunnelRunning ? "Running" : "Stopped"],
    ["Server process", state.serverRunning ? "Running" : "Stopped"],
  ];
  elements.summary.replaceChildren(
    ...rows.map(([label, value]) => {
      const row = document.createElement("div");
      row.className = "summary-row";
      const name = document.createElement("span");
      name.textContent = label;
      const content = document.createElement("strong");
      content.textContent = value;
      row.append(name, content);
      return row;
    }),
  );
}

function renderLogs(): void {
  elements.log.textContent = state.logs
    .map((entry) => {
      const time = new Date(entry.time).toLocaleTimeString();
      return `[${time}] ${entry.source}: ${entry.message}`;
    })
    .join("\n");
}

function renderUpdateStatus(): void {
  const status = state.updateStatus;
  if (!status) {
    elements.updateStatus.textContent = "Checking update status...";
    elements.updateStatus.className = "update-status";
    return;
  }
  elements.updateStatus.textContent = status.error ? `${status.message} ${status.error}` : status.message;
  elements.updateStatus.className = `update-status update-${status.state}`;
}

function renderControls(): void {
  syncMcpUrl();
  const hasProject = state.projectRoot.length > 0;
  const hasPublicUrl = state.publicBaseUrl.length > 0;
  const isPermanent = state.tunnelMode === "permanent";
  const hasTunnelName = elements.permanentTunnelName.value.trim().length > 0;
  const setupBusy = state.tunnelRunning || state.serverRunning;

  elements.quickSettings.hidden = isPermanent;
  elements.permanentSettings.hidden = !isPermanent;
  elements.quickMode.classList.toggle("active", !isPermanent);
  elements.permanentMode.classList.toggle("active", isPermanent);
  elements.startTunnel.textContent = isPermanent ? "Start Permanent Tunnel" : "Start Tunnel";

  elements.saveConfig.disabled = !hasProject;
  elements.startTunnel.disabled = state.tunnelRunning || (isPermanent && (!hasPublicUrl || !hasTunnelName));
  elements.startPermanentTunnel.disabled = state.tunnelRunning || !hasPublicUrl || !hasTunnelName;
  elements.startServer.disabled = !hasProject || !hasPublicUrl || state.serverRunning;
  elements.stopServer.disabled = !state.serverRunning;
  elements.stopAll.disabled = !state.tunnelRunning && !state.serverRunning;
  elements.copyMcp.disabled = !state.mcpUrl;
  elements.copyOwner.disabled = !state.ownerPassword;
  elements.cloudflareLogin.disabled = setupBusy;
  elements.cloudflareLogout.disabled = setupBusy;
  elements.createNamedTunnel.disabled = setupBusy || !hasTunnelName;
  elements.routeTunnelDns.disabled = setupBusy || !hasTunnelName || !hasPublicUrl;
  elements.checkUpdates.disabled =
    state.updateStatus?.state === "checking" || state.updateStatus?.state === "downloading";
}

function renderAll(): void {
  renderChecks();
  renderSummary();
  renderLogs();
  renderUpdateStatus();
  renderControls();
}

async function loadAppInfo(): Promise<void> {
  const [info, updateStatus] = await Promise.all([window.bridgeDesk.getAppInfo(), window.bridgeDesk.getUpdateStatus()]);
  state.appInfo = info;
  state.updateStatus = updateStatus;
  elements.appVersion.textContent = `v${info.version}`;
  renderAll();
}

async function loadConfig(): Promise<void> {
  const summary = await window.bridgeDesk.getConfig();
  applyConfigSummary(summary);
  renderAll();
}

async function refreshChecks(): Promise<void> {
  elements.refreshChecks.disabled = true;
  try {
    state.checks = await window.bridgeDesk.getSystemChecks(currentPort());
    renderAll();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    elements.refreshChecks.disabled = false;
  }
}

async function saveConfigFromForm(): Promise<void> {
  try {
    const summary = await window.bridgeDesk.saveConfig(configInput());
    applyConfigSummary(summary);
    setMessage("Configuration saved.");
    renderAll();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

function setTunnelMode(mode: TunnelMode): void {
  state.tunnelMode = mode;
  if (mode === "permanent" && !elements.permanentHostname.value && !elements.publicBaseUrl.value.includes(".trycloudflare.com")) {
    elements.permanentHostname.value = elements.publicBaseUrl.value;
  }
  syncMcpUrl();
  renderAll();
}

async function startTunnelFromForm(): Promise<void> {
  try {
    await window.bridgeDesk.startTunnel(tunnelInput());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

async function startServerFromForm(): Promise<void> {
  try {
    await window.bridgeDesk.startServer(configInput());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

async function runCloudflareAction(label: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
    setMessage(`${label} completed.`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    renderAll();
  }
}

elements.refreshChecks.addEventListener("click", () => void refreshChecks());
elements.checkUpdates.addEventListener("click", async () => {
  try {
    state.updateStatus = await window.bridgeDesk.checkForUpdates();
    renderAll();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
});
elements.openReleases.addEventListener("click", async () => {
  const url = state.appInfo?.latestReleaseUrl ?? "https://github.com/stanic-mah/bridgedesk/releases/latest";
  await window.bridgeDesk.openExternal(url);
});
elements.openGuide.addEventListener("click", () => setGuideOpen(true));
elements.closeGuide.addEventListener("click", () => setGuideOpen(false));
elements.guideModal.addEventListener("click", (event) => {
  if (event.target === elements.guideModal) setGuideOpen(false);
});
elements.chooseProject.addEventListener("click", async () => {
  try {
    const folder = await window.bridgeDesk.chooseProject();
    if (!folder) return;
    state.projectRoot = folder;
    elements.projectRoot.value = folder;
    await saveConfigFromForm();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
});
elements.saveConfig.addEventListener("click", () => void saveConfigFromForm());
elements.quickMode.addEventListener("click", () => setTunnelMode("quick"));
elements.permanentMode.addEventListener("click", () => setTunnelMode("permanent"));
elements.startTunnel.addEventListener("click", () => void startTunnelFromForm());
elements.startPermanentTunnel.addEventListener("click", () => void startTunnelFromForm());
elements.startServer.addEventListener("click", () => void startServerFromForm());
elements.cloudflareLogin.addEventListener("click", () => {
  void runCloudflareAction("Cloudflare login", () => window.bridgeDesk.cloudflareLogin());
});
elements.cloudflareLogout.addEventListener("click", () => {
  void runCloudflareAction("Cloudflare logout", () => window.bridgeDesk.cloudflareLogout());
});
elements.createNamedTunnel.addEventListener("click", () => {
  void runCloudflareAction("Create named tunnel", () =>
    window.bridgeDesk.createNamedTunnel({ tunnelName: elements.permanentTunnelName.value || null }),
  );
});
elements.routeTunnelDns.addEventListener("click", () => {
  void runCloudflareAction("Route DNS", () =>
    window.bridgeDesk.routeTunnelDns({
      tunnelName: elements.permanentTunnelName.value || null,
      hostname: elements.permanentHostname.value || null,
    }),
  );
});
elements.stopAll.addEventListener("click", async () => {
  await window.bridgeDesk.stopAll();
});
elements.stopServer.addEventListener("click", async () => {
  await window.bridgeDesk.stopServer();
});
elements.copyMcp.addEventListener("click", async () => {
  if (!state.mcpUrl) return;
  await window.bridgeDesk.copyText(state.mcpUrl);
  setMessage("MCP URL copied.");
});
elements.copyOwner.addEventListener("click", async () => {
  if (!state.ownerPassword) return;
  await window.bridgeDesk.copyText(state.ownerPassword);
  setMessage("Owner password copied.");
});
elements.openChatGpt.addEventListener("click", async () => {
  await window.bridgeDesk.openExternal("https://chatgpt.com/");
});
document.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest("[data-open-external]") : null;
  if (!(target instanceof HTMLElement)) return;
  const url = target.dataset.openExternal;
  if (!url) return;
  event.preventDefault();
  void window.bridgeDesk.openExternal(url);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setGuideOpen(false);
});
elements.publicBaseUrl.addEventListener("input", () => {
  syncMcpUrl();
  renderAll();
});
elements.permanentHostname.addEventListener("input", () => {
  syncMcpUrl();
  renderAll();
});
elements.permanentTunnelName.addEventListener("input", () => renderAll());
elements.port.addEventListener("change", () => void refreshChecks());

window.bridgeDesk.onLog((entry) => {
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 300);
  renderLogs();
});

window.bridgeDesk.onStateUpdate((nextState) => {
  state.tunnelRunning = nextState.tunnelRunning;
  state.serverRunning = nextState.serverRunning;
  if (nextState.tunnelMode) state.tunnelMode = nextState.tunnelMode;
  if (nextState.publicBaseUrl) {
    if (state.tunnelMode === "permanent") {
      state.permanentHostname = nextState.publicBaseUrl;
      elements.permanentHostname.value = nextState.publicBaseUrl;
    } else {
      elements.publicBaseUrl.value = nextState.publicBaseUrl;
    }
    state.publicBaseUrl = nextState.publicBaseUrl;
  }
  state.mcpUrl = nextState.mcpUrl ?? displayMcpUrl(publicUrlForMode());
  elements.mcpUrl.value = state.mcpUrl;
  renderAll();
});

window.bridgeDesk.onUpdateStatus((nextStatus) => {
  state.updateStatus = nextStatus;
  renderAll();
});

void loadAppInfo().then(() => loadConfig()).then(() => refreshChecks());
