#!/usr/bin/env node

/**
 * Remote MCP OAuth handshake probe.
 *
 * This validates the same Worker-owned hosted OAuth route family that
 * ChatGPT/Claude use: discovery -> protected resource -> dynamic registration
 * -> authorize redirect -> same-origin /auth/start handoff.
 *
 * Required env:
 *   OAUTH_BASE_URL or REMOTE_SERVER_URL
 *
 * Optional env:
 *   OAUTH_CLIENT_ORIGIN            Defaults to https://chatgpt.com
 *   OAUTH_REDIRECT_URI             Defaults to https://oauth-debug.example/callback
 *   OAUTH_SCOPE                    Defaults to legal:read legal:search legal:analyze
 */

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizeRemoteEndpoints } from '../resolve-remote-endpoints.js';

export function resolveProbeConfig(env = process.env) {
  const baseUrlInput = env.OAUTH_BASE_URL?.trim() || env.REMOTE_SERVER_URL?.trim() || '';
  if (!baseUrlInput) {
    return {
      skipReason: 'Set OAUTH_BASE_URL or REMOTE_SERVER_URL to run the hosted OAuth handshake probe.',
    };
  }

  return {
    baseUrl: normalizeRemoteEndpoints(baseUrlInput).baseUrl.replace(/\/+$/, ''),
    clientOrigin: (env.OAUTH_CLIENT_ORIGIN || 'https://chatgpt.com').trim(),
    redirectUri: (env.OAUTH_REDIRECT_URI || 'https://oauth-debug.example/callback').trim(),
    scope: (env.OAUTH_SCOPE || 'legal:read legal:search legal:analyze').trim(),
  };
}

export async function main() {
  const cfg = resolveProbeConfig();
  if ('skipReason' in cfg) {
    console.log(`Skipping remote MCP OAuth handshake probe: ${cfg.skipReason}`);
    return;
  }

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

  const readinessProbe = await step('Probe same-origin hosted auth readiness', async () => {
    const response = await probeHostedAuthReadiness(cfg.baseUrl, authorizeUrl.toString());
    assertHostedAuthReadinessContract(response);
    return response;
  });

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
    assert(isRedirect(response.status) || response.status === 200, `Expected redirect or 200, got ${response.status}`);
    if (isRedirect(response.status)) {
      assert(response.headers.get('location'), 'Missing auth portal redirect location');
      return;
    }
    const html = await response.text();
    assertAuthPortalHandoffContent(html, { readinessProbeReady: readinessProbe.ready });
  });

  console.log('\nRemote MCP OAuth handshake probe passed (through Worker-owned /auth/start handoff)');
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

export async function probeHostedAuthReadiness(baseUrl, returnTo = null, fetchImpl = fetch) {
  const probeUrl = new URL('/auth/start', `${baseUrl.replace(/\/+$/, '')}/`);
  probeUrl.searchParams.set('continue', '1');
  if (returnTo?.trim()) {
    probeUrl.searchParams.set('return_to', returnTo.trim());
  }

  const response = await fetchImpl(probeUrl, {
    method: 'GET',
    redirect: 'manual',
  });

  return summarizeHostedAuthProbeResponse(response);
}

export function summarizeHostedAuthProbeResponse(response) {
  const location = response.headers.get('location')?.trim() || null;
  return {
    status: response.status,
    location,
    ready: isRedirect(response.status) && response.headers.get('x-hosted-auth-ready') === 'true' && Boolean(location),
    hostedAuthReady: response.headers.get('x-hosted-auth-ready'),
    hostedAuthStatus: trimHeader(response.headers, 'x-hosted-auth-status'),
    hostedAuthError: trimHeader(response.headers, 'x-hosted-auth-error'),
    hostedAuthRoute: trimHeader(response.headers, 'x-hosted-auth-route'),
    hostedAuthOutcome: trimHeader(response.headers, 'x-hosted-auth-outcome'),
    hostedAuthCategory: trimHeader(response.headers, 'x-hosted-auth-category'),
    hostedAuthCorrelationId: trimHeader(response.headers, 'x-hosted-auth-correlation-id'),
    hostedAuthCredentialSource: trimHeader(response.headers, 'x-hosted-auth-credential-source'),
    hostedAuthConfigErrorCount: trimHeader(response.headers, 'x-hosted-auth-config-error-count'),
    hostedAuthDurationMs: trimHeader(response.headers, 'x-hosted-auth-duration-ms'),
    hostedAuthUpstreamDiscoveryDurationMs: trimHeader(response.headers, 'x-hosted-auth-upstream-discovery-duration-ms'),
  };
}

export function assertHostedAuthReadinessContract(probe) {
  assert(probe.hostedAuthRoute === 'auth-start', `Expected X-Hosted-Auth-Route=auth-start, got ${String(probe.hostedAuthRoute)}`);
  assert(probe.hostedAuthStatus, 'Missing X-Hosted-Auth-Status');
  assert(probe.hostedAuthOutcome, 'Missing X-Hosted-Auth-Outcome');
  assert(probe.hostedAuthCategory, 'Missing X-Hosted-Auth-Category');
  assert(probe.hostedAuthCorrelationId, 'Missing X-Hosted-Auth-Correlation-Id');
  assert(/^[A-Za-z0-9_-]{8,}$/.test(probe.hostedAuthCorrelationId), `Invalid X-Hosted-Auth-Correlation-Id: ${String(probe.hostedAuthCorrelationId)}`);
  assertDigitsHeader(probe.hostedAuthConfigErrorCount, 'X-Hosted-Auth-Config-Error-Count');
  assertDigitsHeader(probe.hostedAuthDurationMs, 'X-Hosted-Auth-Duration-Ms');

  if (probe.ready) {
    assert(isRedirect(probe.status), `Expected readiness probe redirect, got ${probe.status}`);
    assert(probe.hostedAuthReady === 'true', `Expected X-Hosted-Auth-Ready=true, got ${String(probe.hostedAuthReady)}`);
    assert(probe.hostedAuthStatus === 'ready', `Expected X-Hosted-Auth-Status=ready, got ${String(probe.hostedAuthStatus)}`);
    assert(probe.hostedAuthOutcome === 'redirect', `Expected X-Hosted-Auth-Outcome=redirect, got ${String(probe.hostedAuthOutcome)}`);
    assert(probe.hostedAuthCategory === 'ok', `Expected X-Hosted-Auth-Category=ok, got ${String(probe.hostedAuthCategory)}`);
    assert(probe.location, 'Missing readiness probe redirect location');
    assert(probe.hostedAuthConfigErrorCount === '0', `Expected X-Hosted-Auth-Config-Error-Count=0, got ${String(probe.hostedAuthConfigErrorCount)}`);
    assertDigitsHeader(
      probe.hostedAuthUpstreamDiscoveryDurationMs,
      'X-Hosted-Auth-Upstream-Discovery-Duration-Ms',
    );
    if (probe.hostedAuthCredentialSource) {
      assert(
        probe.hostedAuthCredentialSource === 'worker_native' || probe.hostedAuthCredentialSource === 'logto_legacy',
        `Unexpected X-Hosted-Auth-Credential-Source: ${String(probe.hostedAuthCredentialSource)}`,
      );
    }
    return;
  }

  assert(!isRedirect(probe.status), `Expected non-redirect failure probe response, got ${probe.status}`);
  assert(probe.hostedAuthReady === 'false', `Expected X-Hosted-Auth-Ready=false, got ${String(probe.hostedAuthReady)}`);
  assert(probe.hostedAuthStatus !== 'ready', 'Failure readiness probe unexpectedly reported ready');
  assert(
    probe.hostedAuthOutcome === 'unavailable',
    `Expected X-Hosted-Auth-Outcome=unavailable, got ${String(probe.hostedAuthOutcome)}`,
  );
  assert(
    probe.hostedAuthCategory !== 'ok',
    `Expected non-ok X-Hosted-Auth-Category for failure probe, got ${String(probe.hostedAuthCategory)}`,
  );
  if (probe.hostedAuthError) {
    assert(probe.hostedAuthError.length > 0, 'X-Hosted-Auth-Error was empty');
  }
  if (probe.hostedAuthStatus.startsWith('upstream_discovery')) {
    assertDigitsHeader(
      probe.hostedAuthUpstreamDiscoveryDurationMs,
      'X-Hosted-Auth-Upstream-Discovery-Duration-Ms',
    );
  }
}

export function assertAuthPortalHandoffContent(html, { readinessProbeReady }) {
  const handoffPage =
    html.includes('Complete the Clerk handoff') ||
    html.includes('Loading auth handoff');
  if (handoffPage) {
    return;
  }

  if (!readinessProbeReady) {
    const failClosedPage =
      html.includes('Worker-native auth is required for this flow.') ||
      html.includes('did not advertise same-origin hosted auth') ||
      html.includes('hosted auth readiness could be confirmed') ||
      html.includes('reported a previous hosted-auth callback failure') ||
      html.includes('hosted auth is not fully configured');
    assert(failClosedPage, 'Auth portal page did not render expected fail-closed guidance');
    return;
  }

  throw new Error('Auth portal page did not render expected handoff UI');
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

function trimHeader(headers, name) {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

function assertDigitsHeader(value, name) {
  assert(typeof value === 'string' && /^\d+$/.test(value), `Missing or invalid ${name}: ${String(value)}`);
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error('\nRemote MCP OAuth handshake probe failed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
