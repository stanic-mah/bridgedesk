import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expandHomePath } from "./roots.js";

export interface BridgeDeskUserConfig {
  host?: string;
  port?: number;
  allowedRoots?: string[];
  publicBaseUrl?: string | null;
  tunnelMode?: "quick" | "permanent";
  permanentTunnelName?: string | null;
  permanentHostname?: string | null;
  allowedHosts?: string[];
  stateDir?: string;
  worktreeRoot?: string;
  agentDir?: string;
}

export interface BridgeDeskAuthConfig {
  ownerToken?: string;
}

export interface BridgeDeskFiles {
  dir: string;
  configPath: string;
  authPath: string;
  configExists: boolean;
  authExists: boolean;
  config: BridgeDeskUserConfig;
  auth: BridgeDeskAuthConfig;
}

export function bridgedeskConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(expandHomePath(env.BRIDGEDESK_CONFIG_DIR ?? join(homedir(), ".bridgedesk")));
}

export function bridgedeskConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(bridgedeskConfigDir(env), "config.json");
}

export function bridgedeskAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(bridgedeskConfigDir(env), "auth.json");
}

export function loadBridgeDeskFiles(env: NodeJS.ProcessEnv = process.env): BridgeDeskFiles {
  const dir = bridgedeskConfigDir(env);
  const configPath = join(dir, "config.json");
  const authPath = join(dir, "auth.json");
  const configExists = existsSync(configPath);
  const authExists = existsSync(authPath);

  return {
    dir,
    configPath,
    authPath,
    configExists,
    authExists,
    config: configExists ? readJsonFile<BridgeDeskUserConfig>(configPath) : {},
    auth: authExists ? readJsonFile<BridgeDeskAuthConfig>(authPath) : {},
  };
}

export function writeBridgeDeskConfig(
  config: BridgeDeskUserConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const filePath = bridgedeskConfigPath(env);
  mkdirSync(bridgedeskConfigDir(env), { recursive: true });
  writeJsonFile(filePath, config, 0o600);
  return filePath;
}

export function writeBridgeDeskAuth(
  auth: BridgeDeskAuthConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const filePath = bridgedeskAuthPath(env);
  mkdirSync(bridgedeskConfigDir(env), { recursive: true });
  writeJsonFile(filePath, auth, 0o600);
  return filePath;
}

export function generateOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

function readJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${filePath}: ${reason}`);
  }
}

function writeJsonFile(filePath: string, value: unknown, mode: number): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", { mode });
}
