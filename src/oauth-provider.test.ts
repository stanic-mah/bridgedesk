import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryOAuthClientsStore } from "./oauth-provider.js";

const store = new InMemoryOAuthClientsStore([".openai.com", ".chatgpt.com"]);

const registered = store.registerClient({
  client_name: "ChatGPT",
  redirect_uris: [
    "https://oauth.openai.com/aip/oauth/callback",
    "https://chatgpt.com/aip/oauth/callback",
    "https://connect.chatgpt.com/oauth/callback",
  ],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
});

assert.ok(registered.client_id.startsWith("bridgedesk-"));

assert.throws(
  () =>
    store.registerClient({
      client_name: "Untrusted",
      redirect_uris: ["https://example.com/oauth/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  /redirect_uri is not allowed/,
);

const metadataStore = new InMemoryOAuthClientsStore(
  [".openai.com", ".chatgpt.com"],
  async () =>
    new Response(
      JSON.stringify({
        client_name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/aip/oauth/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
);
const metadataClient = await metadataStore.getClient("https://chatgpt.com/oauth/bridgedesk/client.json");
assert.equal(metadataClient?.client_id, "https://chatgpt.com/oauth/bridgedesk/client.json");
assert.equal(metadataClient?.token_endpoint_auth_method, "none");

const metadataClientStorePath = join(
  mkdtempSync(join(tmpdir(), "bridgedesk-oauth-metadata-clients-")),
  "oauth-clients.json",
);
let metadataFetchCount = 0;
const persistentMetadataStore = new InMemoryOAuthClientsStore(
  [".openai.com", ".chatgpt.com"],
  async () => {
    metadataFetchCount += 1;
    return new Response(
      JSON.stringify({
        client_name: "ChatGPT",
        redirect_uris: ["https://chatgpt.com/connector/oauth/ARgQFmJ3Oml"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
  metadataClientStorePath,
);
const chatGptClientId = "https://chatgpt.com/oauth/ARgQFmJ3Oml/client.json?token_endpoint_auth_method=none";
const persistentMetadataClient = await persistentMetadataStore.getClient(chatGptClientId);
assert.equal(persistentMetadataClient?.client_id, chatGptClientId);
assert.equal(metadataFetchCount, 1);

const reloadedMetadataStore = new InMemoryOAuthClientsStore(
  [".openai.com", ".chatgpt.com"],
  async () => {
    throw new Error("metadata should be loaded from cache");
  },
  metadataClientStorePath,
);
const cachedMetadataClient = await reloadedMetadataStore.getClient(chatGptClientId);
assert.equal(cachedMetadataClient?.client_id, chatGptClientId);

const untrustedMetadataStore = new InMemoryOAuthClientsStore(
  [".openai.com", ".chatgpt.com"],
  async () =>
    new Response(
      JSON.stringify({
        client_name: "Untrusted",
        redirect_uris: ["https://example.com/oauth/callback"],
        token_endpoint_auth_method: "none",
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
);
assert.equal(await untrustedMetadataStore.getClient("https://chatgpt.com/oauth/bad/client.json"), undefined);
assert.equal(await metadataStore.getClient("https://example.com/oauth/client.json"), undefined);

const clientStorePath = join(mkdtempSync(join(tmpdir(), "bridgedesk-oauth-clients-")), "oauth-clients.json");
const persistentStore = new InMemoryOAuthClientsStore([".openai.com", ".chatgpt.com"], fetch, clientStorePath);
const persistentClient = persistentStore.registerClient({
  client_name: "Persistent ChatGPT",
  redirect_uris: ["https://chatgpt.com/aip/oauth/callback"],
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
});
assert.equal(existsSync(clientStorePath), true);
assert.match(readFileSync(clientStorePath, "utf8"), /Persistent ChatGPT/);

const reloadedStore = new InMemoryOAuthClientsStore([".openai.com", ".chatgpt.com"], fetch, clientStorePath);
const reloadedClient = await reloadedStore.getClient(persistentClient.client_id);
assert.equal(reloadedClient?.client_id, persistentClient.client_id);
assert.deepEqual(reloadedClient?.redirect_uris, ["https://chatgpt.com/aip/oauth/callback"]);

const legacyClient = await reloadedStore.getClient("bridgedesk-00000000-0000-4000-8000-000000000000");
assert.equal(legacyClient?.client_id, "bridgedesk-00000000-0000-4000-8000-000000000000");
assert.ok(legacyClient?.redirect_uris.includes("https://chatgpt.com/aip/oauth/callback"));
