#!/usr/bin/env node

/**
 * Remote MCP OAuth handshake probe.
 *
 * This validates the same hosted OAuth route family that ChatGPT/Claude use:
 * discovery -> protected resource -> dynamic registration -> authorize redirect
 * -> auth portal handoff -> token exchange -> authenticated /mcp call.
 *
 * Required env:
 *   none
 *
 * Optional env:
 *   OAUTH_BASE_URL                 Defaults to https://courtlistenermcp.blakeoxford.com
 *   OAUTH_CLIENT_ORIGIN            Defaults to https://chatgpt.com
 *   OAUTH_REDIRECT_URI             Defaults to https://oauth-debug.example/callback
 *   OAUTH_SCOPE                    Defaults to legal:read legal:search legal:analyze
 *   OAUTH_AUTHORIZATION_BEARER     Clerk template bearer token for /api/session/oauth-complete
 *   OAUTH_REQUIRE_FULL_FLOW        Set to true to fail when no bearer token is provided
 */

import crypto from 'node:crypto';

const cfg = {
  baseUrl: (process.env.OAUTH_BASE_URL || 'https://courtlistenermcp.blakeoxford.com').replace(/\/+$/, ''),
  clientOrigin: (process.env.OAUTH_CLIENT_ORIGIN || 'https://chatgpt.com').trim(),
  redirectUri: (process.env.OAUTH_REDIRECT_URI || 'https://oauth-debug.example/callback').trim(),
  scope: (process.env.OAUTH_SCOPE || 'legal:read legal:search legal:analyze').trim(),
  authorizationBearer: (process.env.OAUTH_AUTHORIZATION_BEARER || '').trim(),
  requireFullFlow: /^(1|true|yes)$/i.test(process.env.OAUTH_REQUIRE_FULL_FLOW || ''),
};

async function main() {
  console.log('Starting remote MCP OAuth handshake probe');
  console.log(`Base URL: ${cfg.baseUrl}`);
  console.log(`Client origin: ${cfg.clientOrigin}`);

  const discoveryUrl = `${cfg.baseUrl}/.well-known/oauth-authorization-server`;
  const protectedResourceUrl = `${cfg.baseUrl}/.well-known/oauth-protected-resource`;

  const discovery = await step('Fetch authorization-server metadata', async () => {
    const response = await fetchJson(discoveryUrl, { headers: { Origin: cfg.clientOrigin } });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.body?.authorization_endpoint, 'Missing authorization_endpoint');
    assert(response.body?.token_endpoint, 'Missing token_endpoint');
    assert(response.body?.registration_endpoint, 'Missing registration_endpoint');
    return response.body;
  });

  await step('Fetch protected-resource metadata', async () => {
    const response = await fetchJson(protectedResourceUrl, { headers: { Origin: cfg.clientOrigin } });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    assert(response.body?.resource === cfg.baseUrl, `Expected resource=${cfg.baseUrl}, got ${String(response.body?.resource)}`);
  });

  const registration = await step('Register public OAuth client', async () => {
    const response = await fetchJson(discovery.registration_endpoint, {
      method: 'POST',
      headers: {
        Origin: cfg.clientOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_name: 'Remote OAuth Probe',
        redirect_uris: [cfg.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: cfg.scope,
      }),
    });
    assert(response.status === 201, `Expected 201, got ${response.status}`);
    assert(typeof response.body?.client_id === 'string' && response.body.client_id.length > 0, 'Missing client_id');
    assert(response.headers.get('location'), 'Missing registration Location header');
    return response.body;
  });

  const pkce = createPkce();
  const state = randomId('state');
  const authorizeUrl = new URL(discovery.authorization_endpoint);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', registration.client_id);
  authorizeUrl.searchParams.set('redirect_uri', cfg.redirectUri);
  authorizeUrl.searchParams.set('scope', cfg.scope);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
  authorizeUrl.searchParams.set('resource', cfg.baseUrl);

  const authRedirect = await step('Request /authorize and capture auth portal redirect', async () => {
    const response = await fetch(authorizeUrl, { method: 'GET', redirect: 'manual' });
    assert(isRedirect(response.status), `Expected redirect, got ${response.status}`);
    const location = response.headers.get('location');
    assert(location, 'Missing authorize redirect location');
    const redirectUrl = new URL(location, cfg.baseUrl);
    assert(redirectUrl.pathname === '/auth/start', `Expected /auth/start redirect, got ${redirectUrl.pathname}`);
    assert(redirectUrl.searchParams.get('return_to') === authorizeUrl.toString(), 'return_to did not preserve /authorize URL');
    return redirectUrl;
  });

  await step('Fetch auth portal handoff page', async () => {
    const response = await fetch(authRedirect, { redirect: 'manual' });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const html = await response.text();
    assert(
      html.includes('Complete the Clerk handoff') || html.includes('Loading auth handoff'),
      'Auth portal page did not render expected handoff UI',
    );
  });

  if (!cfg.authorizationBearer) {
    const message =
      'No OAUTH_AUTHORIZATION_BEARER provided; completed hosted pre-auth checks through /authorize -> /auth/start only.';
    if (cfg.requireFullFlow) {
      throw new Error(message);
    }
    console.log(`\n${message}`);
    console.log('Set OAUTH_AUTHORIZATION_BEARER to continue through /api/session/oauth-complete, /token, and authenticated /mcp.');
    return;
  }

  const oauthCompletion = await step('Complete browser OAuth handoff', async () => {
    const response = await fetchJson(`${cfg.baseUrl}/api/session/oauth-complete`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.authorizationBearer}`,
        'content-type': 'application/json',
        Origin: authRedirect.origin,
      },
      body: JSON.stringify({ return_to: authorizeUrl.toString() }),
    });
    assert(response.status === 200, `Expected 200, got ${response.status}: ${stringify(response.body)}`);
    assert(typeof response.body?.redirectTo === 'string' && response.body.redirectTo.length > 0, 'Missing redirectTo');
    return response.body;
  });

  const callbackUrl = new URL(oauthCompletion.redirectTo);
  const code = callbackUrl.searchParams.get('code');
  const returnedState = callbackUrl.searchParams.get('state');

  assert(code, 'OAuth completion redirect did not include a code');
  assert(returnedState === state, `Expected returned state ${state}, got ${String(returnedState)}`);

  const tokenResponse = await step('Exchange authorization code for tokens', async () => {
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: registration.client_id,
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: pkce.verifier,
      }),
    });
    const body = await response.json().catch(() => ({}));
    assert(response.status === 200, `Expected 200, got ${response.status}: ${stringify(body)}`);
    assert(typeof body.access_token === 'string' && body.access_token.length > 0, 'Missing access_token');
    return body;
  });

  await step('Call authenticated /mcp initialize', async () => {
    const response = await fetch(`${cfg.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenResponse.access_token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2024-11-05',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'Remote OAuth Probe', version: '1.0.0' },
        },
      }),
    });

    const body = await response.json().catch(() => ({}));
    assert(response.status === 200, `Expected 200, got ${response.status}: ${stringify(body)}`);
    assert(typeof body?.result?.serverInfo?.name === 'string', 'Missing MCP serverInfo.name');
  });

  console.log('\nRemote MCP OAuth handshake probe passed');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, body };
}

async function step(name, fn) {
  process.stdout.write(`- ${name} ... `);
  const result = await fn();
  console.log('ok');
  return result;
}

function isRedirect(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

main().catch((error) => {
  console.error('\nRemote MCP OAuth handshake probe failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
