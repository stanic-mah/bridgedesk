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
