import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expandHomePath } from "./roots.js";
import type { LoggingConfig, LogFormat, LogLevel } from "./logger.js";
import type { OAuthConfig } from "./oauth-provider.js";
import { loadBridgeDeskFiles } from "./user-config.js";

export type ToolNamingMode = "legacy" | "short";
export type WidgetMode = "off" | "changes" | "full";
const DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const DEFAULT_OAUTH_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface ServerConfig {
  host: string;
  port: number;
  oauth: OAuthConfig;
  allowedRoots: string[];
  allowedHosts: string[];
  publicBaseUrl: string;
  minimalTools: boolean;
  toolNaming: ToolNamingMode;
  widgets: WidgetMode;
  stateDir: string;
  worktreeRoot: string;
  skillsEnabled: boolean;
  skillPaths: string[];
  agentDir: string;
  logging: LoggingConfig;
}

function parsePort(value: string | number | undefined): number {
  if (value === undefined || value === "") return 7676;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }

  return port;
}

function parseAllowedRoots(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    const roots = value.map((entry) => entry.trim()).filter(Boolean);
    return (roots.length > 0 ? roots : [process.cwd()]).map((root) => resolve(expandHomePath(root)));
  }

  const rawRoots =
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  const roots = rawRoots.length > 0 ? rawRoots : [process.cwd()];
  return roots.map((root) => resolve(expandHomePath(root)));
}

function parseAllowedHosts(value: string | string[] | undefined, derivedHosts: string[]): string[] {
  if (Array.isArray(value)) {
    return normalizeAllowedHosts(value, derivedHosts);
  }

  const rawHosts =
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];

  return normalizeAllowedHosts(rawHosts, derivedHosts);
}

function normalizeAllowedHosts(rawHosts: string[], derivedHosts: string[]): string[] {
  const hosts = rawHosts.length > 0 ? rawHosts : derivedHosts;
  if (hosts.includes("*")) return ["*"];
  return Array.from(new Set(hosts.map((host) => host.trim()).filter(Boolean)));
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.toLowerCase() ?? "");
}

function parseMinimalTools(env: NodeJS.ProcessEnv): boolean {
  if (env.BRIDGEDESK_TOOL_MODE === "minimal") return true;
  if (env.BRIDGEDESK_TOOL_MODE === "full") return false;
  if (env.BRIDGEDESK_TOOL_MODE) {
    throw new Error(`Invalid BRIDGEDESK_TOOL_MODE: ${env.BRIDGEDESK_TOOL_MODE}`);
  }
  if (env.BRIDGEDESK_MINIMAL_TOOLS !== undefined) return parseBoolean(env.BRIDGEDESK_MINIMAL_TOOLS);
  return true;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value || value === "info") return "info";
  if (["silent", "error", "warn", "debug"].includes(value)) return value as LogLevel;

  throw new Error(`Invalid BRIDGEDESK_LOG_LEVEL: ${value}`);
}

function parseLogFormat(value: string | undefined): LogFormat {
  if (!value || value === "json") return "json";
  if (value === "pretty") return "pretty";

  throw new Error(`Invalid BRIDGEDESK_LOG_FORMAT: ${value}`);
}

function parsePathList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => resolve(expandHomePath(entry))) ?? []
  );
}

function parseStringList(value: string | undefined, fallback: string[]): string[] {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries && entries.length > 0 ? entries : fallback;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function parseToolNaming(value: string | undefined): ToolNamingMode {
  if (!value || value === "short") return "short";
  if (value === "legacy") return "legacy";

  throw new Error(`Invalid BRIDGEDESK_TOOL_NAMING: ${value}`);
}

function parseLoggingConfig(env: NodeJS.ProcessEnv, defaultTrustProxy = false): LoggingConfig {
  return {
    level: parseLogLevel(env.BRIDGEDESK_LOG_LEVEL),
    format: parseLogFormat(env.BRIDGEDESK_LOG_FORMAT),
    requests: env.BRIDGEDESK_LOG_REQUESTS === undefined ? true : parseBoolean(env.BRIDGEDESK_LOG_REQUESTS),
    assets: parseBoolean(env.BRIDGEDESK_LOG_ASSETS),
    toolCalls: env.BRIDGEDESK_LOG_TOOL_CALLS === undefined ? true : parseBoolean(env.BRIDGEDESK_LOG_TOOL_CALLS),
    shellCommands: parseBoolean(env.BRIDGEDESK_LOG_SHELL_COMMANDS),
    trustProxy: env.BRIDGEDESK_TRUST_PROXY === undefined ? defaultTrustProxy : parseBoolean(env.BRIDGEDESK_TRUST_PROXY),
  };
}

function parseWidgetMode(value: string | undefined): WidgetMode {
  if (!value || value === "full") return "full";
  if (value === "off" || value === "changes") return value;

  throw new Error(`Invalid BRIDGEDESK_WIDGETS: ${value}`);
}

function parseRequiredSecret(value: string | undefined, name: string): string {
  const secret = value?.trim();
  if (!secret) {
    throw new Error(`${name} is required for BridgeDesk OAuth. Run: bridgedesk init`);
  }
  if (secret.length < 16) {
    throw new Error(`${name} must be at least 16 characters long.`);
  }
  return secret;
}

function parseOAuthConfig(
  env: NodeJS.ProcessEnv,
  ownerToken: string | undefined,
  clientStorePath: string,
): OAuthConfig {
  return {
    ownerToken: parseRequiredSecret(env.BRIDGEDESK_OAUTH_OWNER_TOKEN ?? ownerToken, "BRIDGEDESK_OAUTH_OWNER_TOKEN"),
    accessTokenTtlSeconds: parsePositiveInteger(
      env.BRIDGEDESK_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      "BRIDGEDESK_OAUTH_ACCESS_TOKEN_TTL_SECONDS",
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      env.BRIDGEDESK_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
      DEFAULT_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
      "BRIDGEDESK_OAUTH_REFRESH_TOKEN_TTL_SECONDS",
    ),
    scopes: parseStringList(env.BRIDGEDESK_OAUTH_SCOPES, ["bridgedesk", "offline_access"]),
    allowedRedirectHosts: parseStringList(env.BRIDGEDESK_OAUTH_ALLOWED_REDIRECT_HOSTS, [
      "chatgpt.com",
      ".chatgpt.com",
      "www.chatgpt.com",
      "chat.openai.com",
      ".openai.com",
      "localhost",
      "127.0.0.1",
    ]),
    clientStorePath: resolve(expandHomePath(env.BRIDGEDESK_OAUTH_CLIENT_STORE ?? clientStorePath)),
  };
}

function defaultStateDir(): string {
  return join(homedir(), ".local", "share", "bridgedesk");
}

function defaultWorktreeRoot(): string {
  return join(homedir(), ".bridgedesk", "worktrees");
}

function defaultAgentDir(): string {
  return join(homedir(), ".codex");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const files = loadBridgeDeskFiles(env);
  const host = env.HOST ?? files.config.host ?? "127.0.0.1";
  const port = parsePort(env.PORT ?? files.config.port);
  const publicBaseUrl = parsePublicBaseUrl(
    env.BRIDGEDESK_PUBLIC_BASE_URL ?? files.config.publicBaseUrl ?? localPublicBaseUrl(host, port),
  );
  const derivedAllowedHosts = [
    "localhost",
    "127.0.0.1",
    "::1",
    host,
    new URL(publicBaseUrl).hostname,
    ...(files.config.allowedHosts ?? []),
  ];

  return {
    host,
    port,
    oauth: parseOAuthConfig(env, files.auth.ownerToken, join(files.dir, "oauth-clients.json")),
    allowedRoots: parseAllowedRoots(env.BRIDGEDESK_ALLOWED_ROOTS ?? files.config.allowedRoots),
    allowedHosts: parseAllowedHosts(env.BRIDGEDESK_ALLOWED_HOSTS, derivedAllowedHosts),
    publicBaseUrl,
    minimalTools: parseMinimalTools(env),
    toolNaming: parseToolNaming(env.BRIDGEDESK_TOOL_NAMING),
    widgets: parseWidgetMode(env.BRIDGEDESK_WIDGETS),
    stateDir: resolve(expandHomePath(env.BRIDGEDESK_STATE_DIR ?? files.config.stateDir ?? defaultStateDir())),
    worktreeRoot: resolve(expandHomePath(env.BRIDGEDESK_WORKTREE_ROOT ?? files.config.worktreeRoot ?? defaultWorktreeRoot())),
    skillsEnabled: env.BRIDGEDESK_SKILLS === undefined ? true : parseBoolean(env.BRIDGEDESK_SKILLS),
    skillPaths: parsePathList(env.BRIDGEDESK_SKILL_PATHS),
    agentDir: resolve(expandHomePath(env.BRIDGEDESK_AGENT_DIR ?? files.config.agentDir ?? defaultAgentDir())),
    logging: parseLoggingConfig(env, publicUrlNeedsTrustedProxy(publicBaseUrl)),
  };
}

function parsePublicBaseUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function publicUrlNeedsTrustedProxy(value: string): boolean {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") return false;
  return !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function localPublicBaseUrl(host: string, port: number): string {
  const publicHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  const formattedHost = publicHost.includes(":") && !publicHost.startsWith("[")
    ? `[${publicHost}]`
    : publicHost;
  return `http://${formattedHost}:${port}`;
}
