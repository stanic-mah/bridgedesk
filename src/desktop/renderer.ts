type CheckStatus = "ok" | "missing" | "busy" | "error";

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
  };
  ownerPassword: string | null;
}

interface LauncherState {
  tunnelRunning: boolean;
  serverRunning: boolean;
  publicBaseUrl: string | null;
  mcpUrl: string | null;
}

interface LogEntry {
  source: "system" | "tunnel" | "server";
  message: string;
  time: string;
}

declare global {
  interface Window {
    bridgeDesk: {
      getSystemChecks(port: number): Promise<SystemCheck[]>;
      chooseProject(): Promise<string | null>;
      getConfig(): Promise<ConfigSummary>;
      saveConfig(input: { projectRoot: string; publicBaseUrl: string | null; port: number }): Promise<ConfigSummary>;
      startTunnel(input: { projectRoot: string | null; port: number }): Promise<void>;
      startServer(input: { projectRoot: string; publicBaseUrl: string | null; port: number }): Promise<void>;
      stopAll(): Promise<void>;
      copyText(text: string): Promise<void>;
      openExternal(url: string): Promise<void>;
      onLog(callback: (entry: LogEntry) => void): () => void;
      onStateUpdate(callback: (state: LauncherState) => void): () => void;
    };
  }
}

const statusWeight: Record<CheckStatus, number> = {
  ok: 0,
  busy: 1,
  missing: 2,
  error: 3,
};

const state = {
  projectRoot: "",
  publicBaseUrl: "",
  ownerPassword: "",
  mcpUrl: "",
  checks: [] as SystemCheck[],
  logs: [] as LogEntry[],
  tunnelRunning: false,
  serverRunning: false,
};

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const elements = {
  checks: requiredElement<HTMLDivElement>("checks"),
  projectRoot: requiredElement<HTMLInputElement>("project-root"),
  publicBaseUrl: requiredElement<HTMLInputElement>("public-base-url"),
  port: requiredElement<HTMLInputElement>("port"),
  mcpUrl: requiredElement<HTMLInputElement>("mcp-url"),
  ownerPassword: requiredElement<HTMLInputElement>("owner-password"),
  log: requiredElement<HTMLPreElement>("log"),
  summary: requiredElement<HTMLDivElement>("summary"),
  refreshChecks: requiredElement<HTMLButtonElement>("refresh-checks"),
  chooseProject: requiredElement<HTMLButtonElement>("choose-project"),
  saveConfig: requiredElement<HTMLButtonElement>("save-config"),
  startTunnel: requiredElement<HTMLButtonElement>("start-tunnel"),
  startServer: requiredElement<HTMLButtonElement>("start-server"),
  stopAll: requiredElement<HTMLButtonElement>("stop-all"),
  copyMcp: requiredElement<HTMLButtonElement>("copy-mcp"),
  copyOwner: requiredElement<HTMLButtonElement>("copy-owner"),
  openChatGpt: requiredElement<HTMLButtonElement>("open-chatgpt"),
};

function currentPort(): number {
  const port = Number(elements.port.value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 7676;
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

function renderControls(): void {
  const hasProject = state.projectRoot.length > 0;
  const hasPublicUrl = elements.publicBaseUrl.value.trim().length > 0;
  elements.saveConfig.disabled = !hasProject;
  elements.startTunnel.disabled = state.tunnelRunning;
  elements.startServer.disabled = !hasProject || !hasPublicUrl || state.serverRunning;
  elements.stopAll.disabled = !state.tunnelRunning && !state.serverRunning;
  elements.copyMcp.disabled = !state.mcpUrl;
  elements.copyOwner.disabled = !state.ownerPassword;
}

function renderAll(): void {
  renderChecks();
  renderSummary();
  renderLogs();
  renderControls();
}

async function loadConfig(): Promise<void> {
  const summary = await window.bridgeDesk.getConfig();
  state.projectRoot = summary.config.allowedRoots?.[0] ?? "";
  state.publicBaseUrl = summary.config.publicBaseUrl ?? "";
  state.ownerPassword = summary.ownerPassword ?? "";
  state.mcpUrl = state.publicBaseUrl ? `${state.publicBaseUrl.replace(/\/+$/, "")}/mcp` : "";
  elements.projectRoot.value = state.projectRoot;
  elements.publicBaseUrl.value = state.publicBaseUrl;
  elements.port.value = String(summary.config.port ?? 7676);
  elements.ownerPassword.value = state.ownerPassword;
  elements.mcpUrl.value = state.mcpUrl;
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
    const summary = await window.bridgeDesk.saveConfig({
      projectRoot: state.projectRoot,
      publicBaseUrl: elements.publicBaseUrl.value || null,
      port: currentPort(),
    });
    state.ownerPassword = summary.ownerPassword ?? "";
    state.publicBaseUrl = summary.config.publicBaseUrl ?? "";
    state.mcpUrl = state.publicBaseUrl ? `${state.publicBaseUrl.replace(/\/+$/, "")}/mcp` : "";
    elements.ownerPassword.value = state.ownerPassword;
    elements.mcpUrl.value = state.mcpUrl;
    setMessage("Configuration saved.");
    renderAll();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
}

elements.refreshChecks.addEventListener("click", () => void refreshChecks());
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
elements.startTunnel.addEventListener("click", async () => {
  try {
    await window.bridgeDesk.startTunnel({ projectRoot: state.projectRoot || null, port: currentPort() });
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
});
elements.startServer.addEventListener("click", async () => {
  try {
    await window.bridgeDesk.startServer({
      projectRoot: state.projectRoot,
      publicBaseUrl: elements.publicBaseUrl.value || null,
      port: currentPort(),
    });
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
});
elements.stopAll.addEventListener("click", async () => {
  await window.bridgeDesk.stopAll();
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
elements.publicBaseUrl.addEventListener("input", () => {
  state.publicBaseUrl = elements.publicBaseUrl.value;
  state.mcpUrl = state.publicBaseUrl ? `${state.publicBaseUrl.replace(/\/+$/, "")}/mcp` : "";
  elements.mcpUrl.value = state.mcpUrl;
  renderAll();
});
elements.port.addEventListener("change", () => void refreshChecks());

window.bridgeDesk.onLog((entry) => {
  state.logs.unshift(entry);
  state.logs = state.logs.slice(0, 300);
  renderLogs();
});

window.bridgeDesk.onStateUpdate((nextState) => {
  state.tunnelRunning = nextState.tunnelRunning;
  state.serverRunning = nextState.serverRunning;
  if (nextState.publicBaseUrl) {
    state.publicBaseUrl = nextState.publicBaseUrl;
    elements.publicBaseUrl.value = nextState.publicBaseUrl;
  }
  state.mcpUrl = nextState.mcpUrl ?? "";
  elements.mcpUrl.value = state.mcpUrl;
  renderAll();
});

void loadConfig().then(() => refreshChecks());
