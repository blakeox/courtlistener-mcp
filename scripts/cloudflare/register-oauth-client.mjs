#!/usr/bin/env node

const serverOrigin = (process.env.MCP_SERVER_ORIGIN || 'https://courtlistenermcp.blakeoxford.com').trim();
const redirectUri = (process.env.OAUTH_REDIRECT_URI || '').trim();
const clientName = (process.env.OAUTH_CLIENT_NAME || 'chatgpt-static-client').trim();
const authMethod = (process.env.OAUTH_TOKEN_AUTH_METHOD || 'client_secret_post').trim();

if (!redirectUri) {
  console.error('OAUTH_REDIRECT_URI is required.');
  console.error('Example: OAUTH_REDIRECT_URI=https://chat.openai.com/aip/callback pnpm run cloudflare:register:oauth');
  process.exit(1);
}

const registerUrl = new URL('/register', serverOrigin).toString();
const payload = {
  redirect_uris: [redirectUri],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: authMethod,
  client_name: clientName,
};

const response = await fetch(registerUrl, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

if (!response.ok) {
  console.error(`Registration failed (${response.status}).`);
  console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  register_url: registerUrl,
  client_id: body.client_id,
  client_secret: body.client_secret || null,
  redirect_uris: body.redirect_uris,
  token_endpoint_auth_method: body.token_endpoint_auth_method,
  grant_types: body.grant_types,
  response_types: body.response_types,
}, null, 2));
