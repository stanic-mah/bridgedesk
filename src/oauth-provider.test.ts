import assert from "node:assert/strict";
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
