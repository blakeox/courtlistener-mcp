#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { handleWorkerAuthHandoffRoutes } from '../../src/server/worker-auth-handoff-routes.js';
import { htmlResponse as secureHtmlResponse } from '../../src/server/worker-response-runtime.js';
import { installNodeWebCryptoForTests } from '../utils/node-webcrypto.ts';

installNodeWebCryptoForTests();

type FetchCall = { url: string; init?: RequestInit };

const originalFetch = globalThis.fetch;

function htmlResponse(
  html: string,
  nonce?: string,
  extraHeaders?: HeadersInit,
  securityOptions?: { formActionOrigins?: string[] },
): Response {
  return secureHtmlResponse(html, nonce ?? 'nonce', extraHeaders, securityOptions);
}

function jsonError(message: string, status: number, errorCode: string): Response {
  return Response.json({ error: errorCode, message }, { status });
}

function getCookieValue(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader);
  const value = setCookieHeader.split(';', 1)[0];
  assert.ok(value);
  return value;
}

function getCookieByName(setCookieHeader: string | null, name: string): string | null {
  assert.ok(setCookieHeader);
  return (
    setCookieHeader
      .split(', ')
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split(';', 1)[0] ?? null
  );
}

async function createAccessToken(): Promise<{
  accessToken: string;
  publicJwk: Record<string, unknown>;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';

  const accessToken = await new SignJWT({ scope: 'openid profile email' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://issuer.example')
    .setAudience('https://worker.example')
    .setSubject('user-123')
    .setExpirationTime('5m')
    .sign(privateKey);

  return { accessToken, publicJwk };
}

async function createJwtToken(params: {
  issuer?: string;
  audience: string;
  subject?: string;
}): Promise<{
  token: string;
  publicJwk: Record<string, unknown>;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';

  const token = await new SignJWT({ scope: 'openid profile email' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(params.issuer ?? 'https://issuer.example')
    .setAudience(params.audience)
    .setSubject(params.subject ?? 'user-123')
    .setExpirationTime('5m')
    .sign(privateKey);

  return { token, publicJwk };
}

describe('handleWorkerAuthHandoffRoutes', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders a setup page when same-origin hosted auth is not configured', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start'),
      url: new URL('https://worker.example/auth/start'),
      env: {},
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => null,
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response?.status, 200);
    const html = await response.text();
    assert.match(html, /Hosted auth is not configured/i);
    assert.match(html, /hosted auth is not fully configured/i);
  });

  it('surfaces missing MCP_UI_SESSION_SECRET before starting hosted auth', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start?continue=1'),
      url: new URL('https://worker.example/auth/start?continue=1'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'worker-native-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'worker-native-client-secret',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => null,
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /MCP_UI_SESSION_SECRET/i);
    assert.equal(response.headers.get('x-hosted-auth-signal'), 'config_missing');
    assert.equal(response.headers.get('x-hosted-auth-failure'), 'true');
    assert.equal(response.headers.get('x-hosted-auth-terminal'), 'true');
    assert.match(
      String(response.headers.get('x-hosted-auth-correlation-id')),
      /^[A-Za-z0-9_-]{8,}$/,
    );
  });

  it('surfaces partial Worker-native OIDC config instead of silently falling back', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start?continue=1'),
      url: new URL('https://worker.example/auth/start?continue=1'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'worker-native-client-id',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /MCP_AUTH_OIDC_CLIENT_ID/i);
    assert.doesNotMatch(body, /Continue to sign in/i);
  });

  it('rate limits auth start before upstream handoff work begins', async () => {
    let rateLimitCalls = 0;
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start?continue=1'),
      url: new URL('https://worker.example/auth/start?continue=1'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'worker-native-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'worker-native-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
        getClientIdentifier: () => '127.0.0.1',
        getAuthRouteRateLimitedResponse: async () => {
          rateLimitCalls += 1;
          return Response.json({ error: 'oauth_route_rate_limited' }, { status: 429 });
        },
        now: () => 123,
      },
    });

    assert.equal(rateLimitCalls, 1);
    assert.equal(response?.status, 429);
  });

  it('redirects to the upstream OIDC provider and stores signed auth state', async () => {
    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return Response.json({
        authorization_endpoint: 'https://issuer.example/authorize',
        token_endpoint: 'https://issuer.example/token',
      });
    }) as typeof fetch;

    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1&continue=1',
      ),
      url: new URL(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1&continue=1',
      ),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'worker-native-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'worker-native-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response?.status, 302);
    assert.equal(fetchCalls.length, 1);
    const location = response.headers.get('location');
    assert.ok(location);
    const redirect = new URL(location);
    assert.equal(redirect.origin, 'https://issuer.example');
    assert.equal(redirect.pathname, '/authorize');
    assert.equal(redirect.searchParams.get('client_id'), 'worker-native-client-id');
    assert.equal(redirect.searchParams.get('resource'), 'https://worker.example');
    assert.ok(response.headers.get('set-cookie')?.includes('clauth_state='));
    assert.match(String(response.headers.get('set-cookie')), /clauth_flow=/);
    assert.match(String(response.headers.get('set-cookie')), /SameSite=Lax/);
    assert.equal(response.headers.get('x-hosted-auth-ready'), 'true');
    assert.equal(response.headers.get('x-hosted-auth-status'), 'ready');
    assert.equal(response.headers.get('x-hosted-auth-route'), 'auth-start');
    assert.equal(response.headers.get('x-hosted-auth-outcome'), 'redirect');
    assert.equal(response.headers.get('x-hosted-auth-category'), 'ok');
    assert.equal(response.headers.get('x-hosted-auth-signal'), 'ready_redirect');
    assert.equal(response.headers.get('x-hosted-auth-failure'), 'false');
    assert.equal(response.headers.get('x-hosted-auth-terminal'), 'false');
    assert.match(
      String(response.headers.get('x-hosted-auth-correlation-id')),
      /^[A-Za-z0-9_-]{8,}$/,
    );
    assert.equal(response.headers.get('x-hosted-auth-credential-source'), 'worker_native');
    assert.equal(response.headers.get('x-hosted-auth-config-error-count'), '0');
    assert.match(String(response.headers.get('x-hosted-auth-duration-ms')), /^\d+$/);
    assert.match(
      String(response.headers.get('x-hosted-auth-upstream-discovery-duration-ms')),
      /^\d+$/,
    );
    assert.equal(response.headers.get('x-hosted-auth-upstream-discovery-cache'), 'miss');
  });

  it('requires approval when a same-origin session already exists', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256',
      ),
      url: new URL(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256',
      ),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read', 'unknown:scope'] }),
          completeAuthorization: async () => {
            throw new Error('completeAuthorization should not run before approval');
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(response);
    assert.equal(response?.status, 302);
    assert.equal(
      response?.headers.get('location'),
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256',
    );
  });

  it('bootstraps a UI session from trusted Cloudflare Access identity on the approval route', async () => {
    const approvalUrl =
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256';

    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(approvalUrl, {
        headers: {
          'cf-access-authenticated-user-email': 'user@example.com',
        },
      }),
      url: new URL(approvalUrl),
      env: {
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
        MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS: 'true',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          resolveCloudflareOAuthIdentity: async () => ({
            kind: 'authenticated',
            userId: 'cf_user_123',
            authSource: 'cloudflare_access',
          }),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 3600,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session; Path=/; HttpOnly' }),
          }),
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), approvalUrl);
    assert.match(String(response.headers.get('set-cookie')), /clmcp_ui=signed-session/);
    assert.equal(response.headers.get('x-hosted-auth-status'), 'ready');
    assert.equal(response.headers.get('x-hosted-auth-route'), 'auth-approve');
    assert.equal(response.headers.get('x-hosted-auth-outcome'), 'redirect');
  });

  it('renders the approval page with only a session secret when a trusted session already exists', async () => {
    const approvalUrl =
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256';

    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(approvalUrl, {
        headers: {
          cookie: 'clmcp_ui=signed-session',
        },
      }),
      url: new URL(approvalUrl),
      env: {
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'cf_user_123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => 'clmcp_csrf=csrf-token-123; Path=/; SameSite=Lax',
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            throw new Error('completeAuthorization should not run before approval');
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Approve OAuth access/);
    assert.match(String(response.headers.get('set-cookie')), /clauth_approve=/);
    assert.equal(response.headers.get('x-hosted-auth-status'), 'ready');
    assert.equal(response.headers.get('x-hosted-auth-route'), 'auth-approve');
    assert.equal(response.headers.get('x-hosted-auth-outcome'), 'interactive');
  });

  it('rejects unsupported scopes before rendering or completing hosted approval', async () => {
    const authorizeUrl =
      'https://worker.example/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback&scope=unknown%3Ascope&state=state-1&code_challenge=challenge&code_challenge_method=S256';
    const approvalUrl = `https://worker.example/oauth/approve?return_to=${encodeURIComponent(authorizeUrl)}`;

    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(approvalUrl, {
        headers: { cookie: 'clmcp_ui=signed-session' },
      }),
      url: new URL(approvalUrl),
      env: { MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456' },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => 'clmcp_csrf=csrf-token-123; Path=/; SameSite=Lax',
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({
            scope: ['unknown:scope'],
            redirectUri: 'https://chatgpt.com/callback',
            state: 'state-1',
          }),
          completeAuthorization: async () => {
            throw new Error('completeAuthorization should not run for invalid_scope');
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 302);
    const location = new URL(String(response.headers.get('location')));
    assert.equal(location.origin, 'https://chatgpt.com');
    assert.equal(location.pathname, '/callback');
    assert.equal(location.searchParams.get('error'), 'invalid_scope');
    assert.equal(location.searchParams.get('state'), 'state-1');
    assert.equal(response.headers.get('x-hosted-auth-error'), 'invalid_scope');
    assert.equal(response.headers.get('x-hosted-auth-outcome'), 'rejected');
    assert.equal(response.headers.get('x-hosted-auth-failure'), 'true');
    assert.doesNotMatch(String(response.headers.get('set-cookie')), /clauth_approve=/);
  });

  it('falls back to the default same-origin success path for hostile absolute return targets', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        'https://worker.example/auth/start?return_to=https%3A%2F%2Fevil.example%2Fpwn',
      ),
      url: new URL('https://worker.example/auth/start?return_to=https%3A%2F%2Fevil.example%2Fpwn'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://worker.example/app/account');
  });

  it('uses /app/account as the default success destination when no return_to is provided', async () => {
    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start'),
      url: new URL('https://worker.example/auth/start'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://worker.example/app/account');
  });

  it('redirects callback into the approval step instead of completing OAuth immediately', async () => {
    const { accessToken, publicJwk } = await createAccessToken();

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      const target = String(url);
      if (target === 'https://issuer.example/.well-known/openid-configuration') {
        return Response.json({
          authorization_endpoint: 'https://issuer.example/authorize',
          token_endpoint: 'https://issuer.example/token',
          jwks_uri: 'https://issuer.example/jwks',
        });
      }
      if (target === 'https://issuer.example/token') {
        return Response.json({ access_token: accessToken });
      }
      if (target === 'https://issuer.example/jwks') {
        return Response.json({ keys: [publicJwk] });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const commonEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      OIDC_AUDIENCE: 'https://worker.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
      MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    const startResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256&continue=1',
      ),
      url: new URL(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256&continue=1',
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    const authRedirect = new URL(String(startResponse?.headers.get('location')));
    const startCorrelationId = startResponse?.headers.get('x-hosted-auth-correlation-id');
    const cookieHeader = getCookieValue(startResponse?.headers.get('set-cookie'));

    const callbackResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
        {
          headers: {
            cookie: cookieHeader,
          },
        },
      ),
      url: new URL(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 3600,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session; Path=/; HttpOnly' }),
          }),
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => ({
            redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1',
          }),
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(callbackResponse);
    assert.equal(callbackResponse?.status, 302);
    assert.equal(
      callbackResponse?.headers.get('location'),
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256',
    );
    assert.equal(callbackResponse?.headers.get('x-hosted-auth-correlation-id'), startCorrelationId);
    assert.match(String(callbackResponse?.headers.get('set-cookie')), /clmcp_ui=signed-session/);
    assert.ok(fetchCalls.some((call) => call.url === 'https://issuer.example/token'));
    assert.ok(fetchCalls.some((call) => call.url === 'https://issuer.example/jwks'));
    assert.match(String(callbackResponse?.headers.get('x-hosted-auth-duration-ms')), /^\d+$/);
    assert.match(
      String(callbackResponse?.headers.get('x-hosted-auth-upstream-discovery-duration-ms')),
      /^\d+$/,
    );
    assert.equal(callbackResponse?.headers.get('x-hosted-auth-upstream-discovery-cache'), 'hit');
    assert.match(
      String(callbackResponse?.headers.get('x-hosted-auth-token-exchange-duration-ms')),
      /^\d+$/,
    );
    assert.match(
      String(callbackResponse?.headers.get('x-hosted-auth-token-verification-duration-ms')),
      /^\d+$/,
    );
    assert.match(
      String(callbackResponse?.headers.get('x-hosted-auth-jwks-fetch-duration-ms')),
      /^\d+$/,
    );
    assert.match(
      String(callbackResponse?.headers.get('x-hosted-auth-session-creation-duration-ms')),
      /^\d+$/,
    );
  });

  it('creates the hosted UI session from id_token when the upstream access token is opaque', async () => {
    const { token: idToken, publicJwk } = await createJwtToken({
      audience: 'oidc-client-id',
      subject: 'logto-user-123',
    });

    const fetchCalls: FetchCall[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      const target = String(url);
      if (target === 'https://issuer.example/.well-known/openid-configuration') {
        return Response.json({
          authorization_endpoint: 'https://issuer.example/authorize',
          token_endpoint: 'https://issuer.example/token',
          jwks_uri: 'https://issuer.example/jwks',
        });
      }
      if (target === 'https://issuer.example/token') {
        return Response.json({ access_token: 'opaque-access-token', id_token: idToken });
      }
      if (target === 'https://issuer.example/jwks') {
        return Response.json({ keys: [publicJwk] });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const commonEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
      MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    const startResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256&continue=1',
      ),
      url: new URL(
        'https://worker.example/auth/start?return_to=%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256&continue=1',
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    const authRedirect = new URL(String(startResponse?.headers.get('location')));
    const cookieHeader = getCookieValue(startResponse?.headers.get('set-cookie'));

    const callbackResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
        {
          headers: {
            cookie: cookieHeader,
          },
        },
      ),
      url: new URL(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async (_request, _env, identity) => ({
            sessionToken: `signed-session:${identity.userId}`,
            expiresInSeconds: 3600,
            headers: new Headers({
              'set-cookie': `clmcp_ui=signed-session:${identity.userId}; Path=/; HttpOnly`,
            }),
          }),
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => ({
            redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1',
          }),
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(callbackResponse);
    assert.equal(callbackResponse.status, 302);
    assert.match(
      String(callbackResponse.headers.get('set-cookie')),
      /clmcp_ui=signed-session:logto-user-123/,
    );
    assert.equal(
      callbackResponse.headers.get('location'),
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256',
    );
    assert.ok(fetchCalls.some((call) => call.url === 'https://issuer.example/token'));
    assert.ok(fetchCalls.some((call) => call.url === 'https://issuer.example/jwks'));
  });

  it('renders an approval form and only completes OAuth on CSRF-bound POST', async () => {
    let completionCount = 0;
    const approvalUrl =
      'https://worker.example/oauth/approve?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1%26redirect_uri%3Dhttps%253A%252F%252Fchatgpt.com%252Fcallback%26response_type%3Dcode%26state%3Dstate-1%26scope%3Dlegal%253Aread%26code_challenge%3Dchallenge%26code_challenge_method%3DS256';
    const getResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(approvalUrl, {
        headers: {
          cookie: 'clmcp_ui=signed-session',
        },
      }),
      url: new URL(approvalUrl),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => 'clmcp_csrf=csrf-token-123; Path=/; SameSite=Lax',
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            completionCount += 1;
            return { redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1' };
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.ok(getResponse);
    assert.equal(getResponse.status, 200);
    const approvalHtml = await getResponse.text();
    assert.match(approvalHtml, /Approve OAuth access/);
    assert.match(approvalHtml, /name="return_to"/);
    assert.match(approvalHtml, /action="\/oauth\/approve"/);
    assert.match(approvalHtml, /worker\.example\/authorize\?/);
    const responseCookies = getResponse.headers.getSetCookie();
    const setCookie = String(getResponse.headers.get('set-cookie'));
    assert.match(setCookie, /clauth_approve=/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /clauth_flow=/);
    assert.match(setCookie, /clmcp_csrf=csrf-token-123/);
    assert.ok(responseCookies.some((cookie) => cookie.startsWith('clauth_approve=')));
    assert.ok(responseCookies.some((cookie) => cookie.startsWith('clauth_flow=')));
    assert.ok(responseCookies.some((cookie) => cookie.startsWith('clmcp_csrf=csrf-token-123')));
    const approvalCsp = getResponse.headers.get('content-security-policy') ?? '';
    assert.doesNotMatch(approvalCsp, /form-action/);
    assert.match(approvalCsp, /sha256-CsRg1c\/uAShTQr6MSbfT26yXsxtsm7ZpMgc41yupCOo=/);
    const approvalCorrelationId = getResponse.headers.get('x-hosted-auth-correlation-id');
    assert.match(String(approvalCorrelationId), /^[A-Za-z0-9_-]{8,}$/);
    assert.equal(completionCount, 0);

    const invalidPostResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/approve', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: 'clmcp_ui=signed-session; clauth_approve=invalid; clmcp_csrf=csrf-token-123',
        },
        body: 'csrf_token=wrong-token',
      }),
      url: new URL('https://worker.example/oauth/approve'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            completionCount += 1;
            return { redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1' };
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(invalidPostResponse.status, 403);
    assert.equal(invalidPostResponse.headers.get('x-hosted-auth-error'), 'csrf_validation_failed');
    assert.equal(invalidPostResponse.headers.get('x-hosted-auth-route'), 'auth-approve');
    assert.equal(invalidPostResponse.headers.get('x-hosted-auth-outcome'), 'rejected');
    assert.equal(invalidPostResponse.headers.get('x-hosted-auth-category'), 'security');
    assert.equal(completionCount, 0);

    const approvalCookie = setCookie
      .split(', ')
      .find((cookie) => cookie.startsWith('clauth_approve='))
      ?.split(';', 1)[0];
    const flowCookie = getCookieByName(setCookie, 'clauth_flow');
    assert.ok(approvalCookie);
    assert.ok(flowCookie);

    const postResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/approve', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `clmcp_ui=signed-session; ${approvalCookie}; ${flowCookie}; clmcp_csrf=csrf-token-123`,
        },
        body: 'csrf_token=csrf-token-123',
      }),
      url: new URL('https://worker.example/oauth/approve'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            completionCount += 1;
            return { redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1' };
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(postResponse.status, 302);
    assert.equal(
      postResponse.headers.get('location'),
      'https://chatgpt.com/callback?code=worker-code&state=state-1',
    );
    assert.equal(postResponse.headers.get('x-hosted-auth-route'), 'auth-approve');
    assert.equal(postResponse.headers.get('x-hosted-auth-outcome'), 'completed');
    assert.equal(postResponse.headers.get('x-hosted-auth-category'), 'ok');
    assert.equal(postResponse.headers.get('x-hosted-auth-correlation-id'), approvalCorrelationId);
    assert.match(String(postResponse.headers.get('x-hosted-auth-duration-ms')), /^\d+$/);
    assert.match(String(postResponse.headers.get('x-hosted-auth-approval-duration-ms')), /^\d+$/);
    assert.match(String(postResponse.headers.get('set-cookie')), /clauth_approve=;/);
    assert.equal(completionCount, 1);

    completionCount = 0;
    const cursorAuthorizeUrl =
      'https://worker.example/oauth/authorize?response_type=code&client_id=cursor-client&redirect_uri=cursor%3A%2F%2Fanysphere.cursor-mcp%2Foauth%2Fcallback&state=cursor-state&scope=legal%3Aread&code_challenge=challenge&code_challenge_method=S256';
    const cursorApprovalUrl = `https://worker.example/oauth/approve?return_to=${encodeURIComponent(cursorAuthorizeUrl)}`;
    const cursorApprovalResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(cursorApprovalUrl, {
        headers: { cookie: 'clmcp_ui=signed-session' },
      }),
      url: new URL(cursorApprovalUrl),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => 'clmcp_csrf=csrf-token-123; Path=/; SameSite=Lax',
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => ({
            redirectTo:
              'cursor://anysphere.cursor-mcp/oauth/callback?code=worker-code&state=cursor-state',
          }),
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(cursorApprovalResponse.status, 200);
    const cursorApprovalHtml = await cursorApprovalResponse.text();
    assert.match(cursorApprovalHtml, /action="\/oauth\/approve"/);
    assert.match(cursorApprovalHtml, /anysphere\.cursor-mcp/);
    const cursorCsp = cursorApprovalResponse.headers.get('content-security-policy') ?? '';
    assert.doesNotMatch(cursorCsp, /form-action/);
    assert.doesNotMatch(cursorCsp, /cursor:/);

    completionCount = 0;
    const returnToParam = new URL(approvalUrl).searchParams.get('return_to');
    assert.ok(returnToParam);
    const postWithoutApprovalCookie = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/approve', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `clmcp_ui=signed-session; ${flowCookie}; clmcp_csrf=csrf-token-123`,
        },
        body: `csrf_token=csrf-token-123&return_to=${encodeURIComponent(returnToParam)}`,
      }),
      url: new URL('https://worker.example/oauth/approve'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            completionCount += 1;
            return { redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1' };
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(postWithoutApprovalCookie.status, 302);
    assert.equal(
      postWithoutApprovalCookie.headers.get('location'),
      'https://chatgpt.com/callback?code=worker-code&state=state-1',
    );
    assert.equal(completionCount, 1);

    completionCount = 0;
    const postWithFlowCookieOnly = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/approve', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `clmcp_ui=signed-session; ${flowCookie}; clmcp_csrf=csrf-token-123`,
        },
        body: 'csrf_token=csrf-token-123',
      }),
      url: new URL('https://worker.example/oauth/approve'),
      env: {
        OIDC_ISSUER: 'https://issuer.example',
        OIDC_AUDIENCE: 'https://worker.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-123' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => {
            completionCount += 1;
            return { redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1' };
          },
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(postWithFlowCookieOnly.status, 302);
    assert.equal(completionCount, 1);
  });

  it('redirects callback state failures back to auth start with invalid_return_state', async () => {
    const commonEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      OIDC_AUDIENCE: 'https://worker.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
      MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    globalThis.fetch = (async () =>
      Response.json({
        authorization_endpoint: 'https://issuer.example/authorize',
        token_endpoint: 'https://issuer.example/token',
      })) as typeof fetch;

    const startResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start?continue=1'),
      url: new URL('https://worker.example/auth/start?continue=1'),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    const authRedirect = new URL(String(startResponse?.headers.get('location')));
    const cookieHeader = getCookieValue(startResponse?.headers.get('set-cookie'));

    for (const callbackUrl of [
      'https://worker.example/auth/callback?code=code-123',
      `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}-tampered`,
    ]) {
      const response = await handleWorkerAuthHandoffRoutes({
        request: new Request(callbackUrl, {
          headers: {
            cookie: cookieHeader,
          },
        }),
        url: new URL(callbackUrl),
        env: commonEnv,
        deps: {
          jsonError,
          generateCspNonce: () => 'nonce',
          htmlResponse,
          workerUiSessionRuntime: {
            getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
            resolveUiSession: async () => ({ kind: 'invalid' }),
            createUiSessionState: async () => null,
            isSecureCookieRequest: () => true,
          },
          getOAuthHelpers: () => {
            throw new Error('not used');
          },
          buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
          resolveGrantedScopes: () => [],
        },
      });

      assert.ok(response);
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get('location'),
        'https://worker.example/auth/start?return_to=https%3A%2F%2Fworker.example%2Fapp%2Faccount&auth_error=invalid_return_state',
      );
      assert.match(String(response.headers.get('set-cookie')), /clauth_state=;/);
    }
  });

  it('redirects callback failures back to auth start with distinct failure reasons', async () => {
    const { accessToken, publicJwk } = await createAccessToken();
    const commonEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      OIDC_AUDIENCE: 'https://worker.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
      MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    for (const scenario of [
      {
        name: 'token exchange failure',
        expectedAuthError: 'upstream_token_failed',
        createUiSessionState: async () => ({
          sessionToken: 'signed-session',
          expiresInSeconds: 3600,
          headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session; Path=/; HttpOnly' }),
        }),
        tokenResponse: () => jsonError('token exchange failed', 502, 'upstream_failure'),
      },
      {
        name: 'session creation failure',
        expectedAuthError: 'callback_failed',
        createUiSessionState: async () => null,
        tokenResponse: () => Response.json({ access_token: accessToken }),
      },
    ]) {
      const fetchCalls: FetchCall[] = [];
      globalThis.fetch = (async (url: string | URL) => {
        fetchCalls.push({ url: String(url) });
        const target = String(url);
        if (target === 'https://issuer.example/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: 'https://issuer.example/authorize',
            token_endpoint: 'https://issuer.example/token',
            jwks_uri: 'https://issuer.example/jwks',
          });
        }
        if (target === 'https://issuer.example/token') {
          return scenario.tokenResponse();
        }
        if (target === 'https://issuer.example/jwks') {
          return Response.json({ keys: [publicJwk] });
        }
        throw new Error(`Unexpected fetch: ${target}`);
      }) as typeof fetch;

      const startResponse = await handleWorkerAuthHandoffRoutes({
        request: new Request('https://worker.example/auth/start?continue=1'),
        url: new URL('https://worker.example/auth/start?continue=1'),
        env: commonEnv,
        deps: {
          jsonError,
          generateCspNonce: () => 'nonce',
          htmlResponse,
          workerUiSessionRuntime: {
            getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
            resolveUiSession: async () => ({ kind: 'invalid' }),
            createUiSessionState: async () => null,
            isSecureCookieRequest: () => true,
          },
          getOAuthHelpers: () => {
            throw new Error('not used');
          },
          buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
          resolveGrantedScopes: () => [],
        },
      });

      const authRedirect = new URL(String(startResponse?.headers.get('location')));
      const cookieHeader = getCookieValue(startResponse?.headers.get('set-cookie'));
      const callbackResponse = await handleWorkerAuthHandoffRoutes({
        request: new Request(
          `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
          {
            headers: {
              cookie: cookieHeader,
            },
          },
        ),
        url: new URL(
          `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
        ),
        env: commonEnv,
        deps: {
          jsonError,
          generateCspNonce: () => 'nonce',
          htmlResponse,
          workerUiSessionRuntime: {
            getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
            resolveUiSession: async () => ({ kind: 'invalid' }),
            createUiSessionState: scenario.createUiSessionState,
            isSecureCookieRequest: () => true,
          },
          getOAuthHelpers: () => ({
            parseAuthRequest: async () => ({ scope: ['legal:read'] }),
            completeAuthorization: async () => ({
              redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1',
            }),
          }),
          buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
          resolveGrantedScopes: () => ['legal:read'],
        },
      });

      assert.ok(callbackResponse, scenario.name);
      assert.equal(callbackResponse.status, 302, scenario.name);
      assert.equal(
        callbackResponse.headers.get('location'),
        `https://worker.example/auth/start?return_to=${encodeURIComponent('https://worker.example/app/account')}&auth_error=${scenario.expectedAuthError}`,
        scenario.name,
      );
      assert.equal(
        callbackResponse.headers.get('x-hosted-auth-error'),
        scenario.expectedAuthError,
        scenario.name,
      );
      assert.equal(
        callbackResponse.headers.get('x-hosted-auth-outcome'),
        'rejected',
        scenario.name,
      );
      assert.match(
        String(callbackResponse.headers.get('set-cookie')),
        /clauth_state=;/,
        scenario.name,
      );
      if (scenario.expectedAuthError === 'callback_failed') {
        assert.match(
          String(callbackResponse.headers.get('x-hosted-auth-token-verification-duration-ms')),
          /^\d+$/,
          scenario.name,
        );
        assert.match(
          String(callbackResponse.headers.get('x-hosted-auth-jwks-fetch-duration-ms')),
          /^\d+$/,
          scenario.name,
        );
        assert.match(
          String(callbackResponse.headers.get('x-hosted-auth-session-creation-duration-ms')),
          /^\d+$/,
          scenario.name,
        );
      }
      assert.ok(
        fetchCalls.some((call) => call.url === 'https://issuer.example/token'),
        scenario.name,
      );
    }
  });

  it('preserves explicit return_to when callback completion fails', async () => {
    const { accessToken, publicJwk } = await createAccessToken();
    const returnTo = 'https://worker.example/authorize?client_id=client-1';
    const commonEnv = {
      OIDC_ISSUER: 'https://issuer.example',
      OIDC_AUDIENCE: 'https://worker.example',
      MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
      MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
      MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
    };

    globalThis.fetch = (async (url: string | URL) => {
      const target = String(url);
      if (target === 'https://issuer.example/.well-known/openid-configuration') {
        return Response.json({
          authorization_endpoint: 'https://issuer.example/authorize',
          token_endpoint: 'https://issuer.example/token',
          jwks_uri: 'https://issuer.example/jwks',
        });
      }
      if (target === 'https://issuer.example/token') {
        return Response.json({ access_token: accessToken });
      }
      if (target === 'https://issuer.example/jwks') {
        return Response.json({ keys: [publicJwk] });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const startResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        `https://worker.example/auth/start?return_to=${encodeURIComponent(returnTo)}&continue=1`,
      ),
      url: new URL(
        `https://worker.example/auth/start?return_to=${encodeURIComponent(returnTo)}&continue=1`,
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    const authRedirect = new URL(String(startResponse?.headers.get('location')));
    const cookieHeader = getCookieValue(startResponse?.headers.get('set-cookie'));
    const callbackResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
        {
          headers: { cookie: cookieHeader },
        },
      ),
      url: new URL(
        `https://worker.example/auth/callback?code=code-123&state=${authRedirect.searchParams.get('state')}`,
      ),
      env: commonEnv,
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => ({
          parseAuthRequest: async () => ({ scope: ['legal:read'] }),
          completeAuthorization: async () => ({
            redirectTo: 'https://chatgpt.com/callback?code=worker-code&state=state-1',
          }),
        }),
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => ['legal:read'],
      },
    });

    assert.equal(
      callbackResponse.headers.get('location'),
      `https://worker.example/auth/start?return_to=${encodeURIComponent(returnTo)}&auth_error=callback_failed`,
    );
  });

  it('surfaces upstream discovery timeouts without throwing', async () => {
    globalThis.fetch = (async () => {
      const error = new Error('timed out');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch;

    const response = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/auth/start?continue=1'),
      url: new URL('https://worker.example/auth/start?continue=1'),
      env: {
        OIDC_ISSUER: 'https://timeout-issuer.example',
        MCP_AUTH_OIDC_CLIENT_ID: 'oidc-client-id',
        MCP_AUTH_OIDC_CLIENT_SECRET: 'oidc-client-secret',
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-hosted-auth-ready'), 'false');
    assert.equal(response.headers.get('x-hosted-auth-status'), 'upstream_discovery_timeout');
    assert.equal(response.headers.get('x-hosted-auth-error'), 'upstream_discovery_timeout');
    assert.equal(response.headers.get('x-hosted-auth-route'), 'auth-start');
    assert.equal(response.headers.get('x-hosted-auth-outcome'), 'unavailable');
    assert.equal(response.headers.get('x-hosted-auth-category'), 'timeout');
    assert.equal(response.headers.get('x-hosted-auth-credential-source'), 'worker_native');
    assert.match(
      await response.text(),
      /timed out while contacting the upstream identity provider/i,
    );
  });

  it('logout requires a CSRF-bound POST before expiring cookies', async () => {
    const getResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/logout'),
      url: new URL('https://worker.example/oauth/logout'),
      env: {
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => 'clmcp_csrf=csrf-token-123; Path=/; SameSite=Lax',
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(getResponse);
    assert.equal(getResponse.status, 200);
    assert.match(await getResponse.text(), /<h1>Sign out<\/h1>/);
    assert.equal(getResponse.headers.get('x-hosted-auth-ready'), 'true');
    assert.equal(getResponse.headers.get('x-hosted-auth-status'), 'logout_confirmation_required');
    assert.equal(getResponse.headers.get('x-hosted-auth-route'), 'auth-logout');
    assert.equal(getResponse.headers.get('x-hosted-auth-outcome'), 'interactive');
    assert.equal(getResponse.headers.get('x-hosted-auth-category'), 'operator_action');
    const logoutCorrelationId = getResponse.headers.get('x-hosted-auth-correlation-id');
    assert.match(String(logoutCorrelationId), /^[A-Za-z0-9_-]{8,}$/);
    assert.match(String(getResponse.headers.get('set-cookie')), /clmcp_csrf=csrf-token-123/);
    assert.match(String(getResponse.headers.get('set-cookie')), /clauth_flow=/);
    assert.doesNotMatch(String(getResponse.headers.get('set-cookie')), /Max-Age=0/);
    const logoutFlowCookie = getCookieByName(
      String(getResponse.headers.get('set-cookie')),
      'clauth_flow',
    );
    assert.ok(logoutFlowCookie);

    const postResponse = await handleWorkerAuthHandoffRoutes({
      request: new Request('https://worker.example/oauth/logout', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `clmcp_ui=signed-session; clauth_approve=approval; clauth_state=state; ${logoutFlowCookie}; clmcp_csrf=csrf-token-123`,
        },
        body: `csrf_token=csrf-token-123&return_to=${encodeURIComponent('https://worker.example/authorize?client_id=client-1')}`,
      }),
      url: new URL('https://worker.example/oauth/logout'),
      env: {
        MCP_UI_SESSION_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      },
      deps: {
        jsonError,
        generateCspNonce: () => 'nonce',
        htmlResponse,
        workerUiSessionRuntime: {
          getUiSessionSecret: () => 'abcdefghijklmnopqrstuvwxyz123456',
          resolveUiSession: async () => ({ kind: 'invalid' }),
          createUiSessionState: async () => null,
          getOrCreateCsrfCookieHeader: () => null,
          isSecureCookieRequest: () => true,
        },
        getOAuthHelpers: () => {
          throw new Error('not used');
        },
        buildHostedOAuthCompletionDetails: () => ({ metadata: {}, props: {} }),
        resolveGrantedScopes: () => [],
      },
    });

    assert.ok(postResponse);
    assert.equal(postResponse.status, 302);
    assert.equal(postResponse.headers.get('x-hosted-auth-ready'), 'true');
    assert.equal(postResponse.headers.get('x-hosted-auth-status'), 'logged_out');
    assert.equal(postResponse.headers.get('x-hosted-auth-route'), 'auth-logout');
    assert.equal(postResponse.headers.get('x-hosted-auth-outcome'), 'completed');
    assert.equal(postResponse.headers.get('x-hosted-auth-category'), 'operator_action');
    assert.equal(postResponse.headers.get('x-hosted-auth-correlation-id'), logoutCorrelationId);
    assert.match(String(postResponse.headers.get('x-hosted-auth-duration-ms')), /^\d+$/);
    assert.match(String(postResponse.headers.get('x-hosted-auth-logout-duration-ms')), /^\d+$/);
    assert.equal(
      postResponse.headers.get('location'),
      'https://worker.example/auth/start?return_to=https%3A%2F%2Fworker.example%2Fauthorize%3Fclient_id%3Dclient-1',
    );
    const setCookie = String(postResponse.headers.get('set-cookie'));
    assert.match(setCookie, /clmcp_ui=;/);
    assert.match(setCookie, /clmcp_ui_present=;/);
    assert.match(setCookie, /clauth_state=;/);
    assert.match(setCookie, /clauth_approve=;/);
    assert.match(setCookie, /clauth_flow=;/);
    assert.match(setCookie, /clmcp_csrf=;/);
    assert.equal(setCookie.match(/Max-Age=0/g)?.length, 6);
  });
});
