import { timingSafeEqual, randomBytes, randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { AccessDeniedError, InvalidGrantError, InvalidRequestError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  OAuthClientInformationFullSchema,
  OAuthClientMetadataSchema,
  type OAuthClientMetadata,
  type OAuthClientInformationFull,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { checkResourceAllowed, resourceUrlFromServerUrl } from "@modelcontextprotocol/sdk/shared/auth-utils.js";

export interface OAuthConfig {
  ownerToken: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  scopes: string[];
  allowedRedirectHosts: string[];
  clientStorePath?: string;
}

interface AuthorizationCodeRecord {
  clientId: string;
  params: AuthorizationParams;
  expiresAtMs: number;
}

interface AccessTokenRecord {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

interface RefreshTokenRecord {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

const CODE_TTL_MS = 5 * 60 * 1000;
const CLIENT_METADATA_TIMEOUT_MS = 5000;
const LEGACY_BRIDGEDESK_CLIENT_ID = /^bridgedesk-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHATGPT_REDIRECT_URIS = [
  "https://oauth.openai.com/aip/oauth/callback",
  "https://chatgpt.com/aip/oauth/callback",
  "https://chat.openai.com/aip/oauth/callback",
  "https://connect.chatgpt.com/oauth/callback",
  "https://chatgpt.com/backend-api/aip/oauth/callback",
  "https://chat.openai.com/backend-api/aip/oauth/callback",
];

type FetchClientMetadata = typeof fetch;

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formHtml(params: {
  error?: string;
  clientName: string;
  scopes: string[];
  resource?: URL;
  fields: Record<string, string | undefined>;
}): string {
  const scopeText = params.scopes.length > 0 ? params.scopes.join(" ") : "bridgedesk";
  const resourceText = params.resource?.href ?? "BridgeDesk MCP endpoint";
  const error = params.error
    ? `<p class="error">${htmlEscape(params.error)}</p>`
    : "";
  const hiddenFields = Object.entries(params.fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `        <input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value)}" />`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Connect BridgeDesk</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
      main { max-width: 440px; margin: 12vh auto; padding: 32px; background: #111827; border: 1px solid #334155; border-radius: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { line-height: 1.5; color: #cbd5e1; }
      dl { padding: 16px; background: #020617; border-radius: 12px; }
      dt { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
      dd { margin: 4px 0 12px; word-break: break-word; }
      label { display: block; margin: 18px 0 8px; font-weight: 600; }
      input { box-sizing: border-box; width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #475569; background: #020617; color: #e2e8f0; font-size: 16px; }
      button { margin-top: 18px; width: 100%; border: 0; border-radius: 10px; padding: 12px 14px; font-weight: 700; color: #020617; background: #38bdf8; cursor: pointer; }
      .error { color: #fecaca; background: #7f1d1d; border-radius: 10px; padding: 10px 12px; }
      .warning { color: #fde68a; }
    </style>
  </head>
  <body>
    <main>
      <h1>Connect BridgeDesk</h1>
      <p class="warning">Only approve this if you are intentionally connecting your own ChatGPT or MCP client to this local machine.</p>
      ${error}
      <dl>
        <dt>Client</dt><dd>${htmlEscape(params.clientName)}</dd>
        <dt>Scope</dt><dd>${htmlEscape(scopeText)}</dd>
        <dt>Resource</dt><dd>${htmlEscape(resourceText)}</dd>
      </dl>
      <form method="post">
${hiddenFields}
        <label for="owner_token">Owner password</label>
        <input id="owner_token" name="owner_token" type="password" autocomplete="current-password" autofocus required />
        <button type="submit">Authorize BridgeDesk</button>
      </form>
    </main>
  </body>
</html>`;
}

function requestedScopesAllowed(requested: string[], supported: string[]): boolean {
  return requested.every((scope) => supported.includes(scope));
}

function redirectHostAllowed(redirectUri: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return true;
  return allowedHosts.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    if (!allowed) return false;
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1);
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
    }
    if (allowed.startsWith(".")) {
      const root = allowed.slice(1);
      return hostname === root || hostname.endsWith(allowed);
    }
    return hostname === allowed;
  });
}

function clientMetadataDocumentAllowed(clientId: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(clientId);
  } catch {
    return false;
  }

  return parsed.protocol === "https:" && redirectHostAllowed(clientId, allowedHosts);
}

function normalizeClientMetadata(
  clientId: string,
  metadata: OAuthClientMetadata,
): OAuthClientInformationFull | undefined {
  if ((metadata.token_endpoint_auth_method ?? "none") !== "none") return undefined;

  return {
    ...metadata,
    client_id: clientId,
    token_endpoint_auth_method: "none",
    grant_types: metadata.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: metadata.response_types ?? ["code"],
  };
}

function legacyBridgeDeskClient(
  clientId: string,
  allowedHosts: string[],
): OAuthClientInformationFull | undefined {
  if (!LEGACY_BRIDGEDESK_CLIENT_ID.test(clientId)) return undefined;

  const redirectUris = CHATGPT_REDIRECT_URIS.filter((uri) => redirectHostAllowed(uri, allowedHosts));
  if (redirectUris.length === 0) return undefined;

  return {
    client_id: clientId,
    client_name: "ChatGPT",
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export class InMemoryOAuthClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  constructor(
    private readonly allowedRedirectHosts: string[],
    private readonly fetchClientMetadata: FetchClientMetadata = fetch,
    private readonly persistencePath?: string,
  ) {
    this.loadPersistedClients();
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined | Promise<OAuthClientInformationFull | undefined> {
    const registered = this.clients.get(clientId);
    if (registered) return registered;
    const legacyClient = legacyBridgeDeskClient(clientId, this.allowedRedirectHosts);
    if (legacyClient) {
      this.clients.set(legacyClient.client_id, legacyClient);
      this.persistClients();
      return legacyClient;
    }
    if (!clientMetadataDocumentAllowed(clientId, this.allowedRedirectHosts)) return undefined;
    return this.getClientFromMetadataDocument(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    if (!client.redirect_uris.every((uri) => redirectHostAllowed(uri, this.allowedRedirectHosts))) {
      throw new InvalidRequestError("Client redirect_uri is not allowed for this BridgeDesk server");
    }

    const now = Math.floor(Date.now() / 1000);
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: `bridgedesk-${randomUUID()}`,
      client_id_issued_at: now,
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
      grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: client.response_types ?? ["code"],
    };
    this.clients.set(registered.client_id, registered);
    this.persistClients();
    return registered;
  }

  private async getClientFromMetadataDocument(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_METADATA_TIMEOUT_MS);
    try {
      const response = await this.fetchClientMetadata(clientId, {
        headers: { "User-Agent": "BridgeDesk" },
        signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const result = OAuthClientMetadataSchema.safeParse(await response.json());
      if (!result.success) return undefined;
      if (!result.data.redirect_uris.every((uri) => redirectHostAllowed(uri, this.allowedRedirectHosts))) {
        return undefined;
      }

      const client = normalizeClientMetadata(clientId, result.data);
      if (!client) return undefined;
      this.clients.set(client.client_id, client);
      return client;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private loadPersistedClients(): void {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;

    try {
      const parsed = JSON.parse(readFileSync(this.persistencePath, "utf8")) as unknown;
      const entries =
        typeof parsed === "object" && parsed !== null && "clients" in parsed && Array.isArray(parsed.clients)
          ? parsed.clients
          : Array.isArray(parsed)
            ? parsed
            : [];

      for (const entry of entries) {
        const result = OAuthClientInformationFullSchema.safeParse(entry);
        if (!result.success) continue;
        if (!result.data.redirect_uris.every((uri) => redirectHostAllowed(uri, this.allowedRedirectHosts))) continue;
        this.clients.set(result.data.client_id, result.data);
      }
    } catch {
      // A corrupt cache should not prevent BridgeDesk from starting.
    }
  }

  private persistClients(): void {
    if (!this.persistencePath) return;

    const clients = Array.from(this.clients.values()).filter((client) => client.client_id.startsWith("bridgedesk-"));
    try {
      mkdirSync(dirname(this.persistencePath), { recursive: true });
      writeFileSync(this.persistencePath, JSON.stringify({ version: 1, clients }, null, 2) + "\n", { mode: 0o600 });
    } catch {
      // Persistence is best-effort; OAuth still works for the current process.
    }
  }
}

export class SingleUserOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly resourceServerUrl: URL;

  constructor(
    private readonly config: OAuthConfig,
    resourceServerUrl: URL,
  ) {
    this.resourceServerUrl = resourceUrlFromServerUrl(resourceServerUrl);
    this.clientsStore = new InMemoryOAuthClientsStore(
      config.allowedRedirectHosts,
      fetch,
      config.clientStorePath,
    );
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (!params.resource || !checkResourceAllowed({ requestedResource: params.resource, configuredResource: this.resourceServerUrl })) {
      throw new InvalidRequestError("Invalid or missing OAuth resource");
    }
    if (!requestedScopesAllowed(params.scopes ?? [], this.config.scopes)) {
      throw new InvalidRequestError("Requested scope is not supported");
    }

    if (res.req.method !== "POST") {
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        formHtml({
          clientName: client.client_name ?? client.client_id,
          scopes: params.scopes ?? this.config.scopes,
          resource: params.resource,
          fields: authorizationFormFields(client, params),
        }),
      );
      return;
    }

    const providedToken = String(res.req.body?.owner_token ?? "");
    if (!safeEquals(providedToken, this.config.ownerToken)) {
      res.status(401).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        formHtml({
          error: "The Owner password was not accepted.",
          clientName: client.client_name ?? client.client_id,
          scopes: params.scopes ?? this.config.scopes,
          resource: params.resource,
          fields: authorizationFormFields(client, params),
        }),
      );
      return;
    }

    const code = `code-${randomUUID()}`;
    this.codes.set(code, {
      clientId: client.client_id,
      params,
      expiresAtMs: Date.now() + CODE_TTL_MS,
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state !== undefined) redirectUrl.searchParams.set("state", params.state);
    res.redirect(302, redirectUrl.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = this.validCodeRecord(client, authorizationCode);
    return record.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const record = this.validCodeRecord(client, authorizationCode);
    if (redirectUri && redirectUri !== record.params.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request");
    }
    if (resource && !checkResourceAllowed({ requestedResource: resource, configuredResource: this.resourceServerUrl })) {
      throw new InvalidGrantError("Invalid resource");
    }

    this.codes.delete(authorizationCode);
    return this.issueTokens(client.client_id, record.params.scopes ?? this.config.scopes, record.params.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const record = this.refreshTokens.get(hashToken(refreshToken));
    if (!record || record.clientId !== client.client_id || record.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    if (resource && !checkResourceAllowed({ requestedResource: resource, configuredResource: this.resourceServerUrl })) {
      throw new InvalidGrantError("Invalid resource");
    }

    const requestedScopes = scopes ?? record.scopes;
    if (!requestedScopes.every((scope) => record.scopes.includes(scope))) {
      throw new AccessDeniedError("Refresh token cannot grant requested scopes");
    }

    this.refreshTokens.delete(hashToken(refreshToken));
    return this.issueTokens(client.client_id, requestedScopes, resource ?? record.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.accessTokens.get(hashToken(token));
    if (!record || record.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new InvalidTokenError("Invalid or expired access token");
    }

    return {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      resource: record.resource,
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const hashed = hashToken(request.token);
    this.accessTokens.delete(hashed);
    this.refreshTokens.delete(hashed);
  }

  private validCodeRecord(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): AuthorizationCodeRecord {
    const record = this.codes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id || record.expiresAtMs < Date.now()) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return record;
  }

  private issueTokens(clientId: string, scopes: string[], resource?: URL): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const accessExpiresAt = now + this.config.accessTokenTtlSeconds;
    const refreshExpiresAt = now + this.config.refreshTokenTtlSeconds;

    this.accessTokens.set(hashToken(accessToken), {
      token: accessToken,
      clientId,
      scopes,
      expiresAt: accessExpiresAt,
      resource,
    });
    this.refreshTokens.set(hashToken(refreshToken), {
      token: refreshToken,
      clientId,
      scopes,
      expiresAt: refreshExpiresAt,
      resource,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: this.config.accessTokenTtlSeconds,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }
}

function authorizationFormFields(
  client: OAuthClientInformationFull,
  params: AuthorizationParams,
): Record<string, string | undefined> {
  return {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    scope: params.scopes?.join(" "),
    state: params.state,
    resource: params.resource?.href,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
