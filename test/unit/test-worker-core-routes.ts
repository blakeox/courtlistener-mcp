#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerCoreRoutes } from '../../src/server/worker-core-routes.js';

interface TestEnv {
  oauthEnabled?: boolean;
  MCP_UI_SESSION_SECRET?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
}

function jsonError(
  message: string,
  status: number,
  errorCode: string,
  extra?: Record<string, unknown>,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      error_code: errorCode,
      ...(extra ?? {}),
    }),
    {
      status,
      headers: extraHeaders,
    },
  );
}

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(extraHeaders ? Object.fromEntries(new Headers(extraHeaders).entries()) : {}),
    },
  });
}

function buildContext(pathname: string, requestMethod = 'GET') {
  const request = new Request(`https://worker.example${pathname}`, { method: requestMethod });
  return {
    request,
    url: new URL(request.url),
    origin: null,
    allowedOrigins: ['https://chatgpt.com'],
    env: { oauthEnabled: true },
    pathname,
    requestMethod,
    mcpPath: pathname === '/mcp',
  };
}

function buildDeps(overrides: Partial<Parameters<typeof handleWorkerCoreRoutes<TestEnv>>[1]> = {}) {
  return {
    isAllowedOrigin: (origin: string | null, allowedOrigins: string[]) =>
      origin === null || allowedOrigins.includes(origin),
    buildCorsHeaders: (origin: string | null) => {
      const headers = new Headers();
      if (origin) headers.set('access-control-allow-origin', origin);
      return headers;
    },
    withCors: (response: Response, origin: string | null) => {
      const headers = new Headers(response.headers);
      if (origin) headers.set('access-control-allow-origin', origin);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    jsonError,
    jsonResponse,
    isCloudflareOAuthBackendEnabled: (env: TestEnv) => env.oauthEnabled === true,
    isRemovedLegacyUiRoute: (pathname: string) => pathname === '/api/login',
    workerUiSessionRuntime: {
      resolveBrowserSessionUserId: async () => 'user-1',
      resolveCloudflareOAuthUserId: async () => 'user-1',
      getSessionBootstrapRateLimitedResponse: async () => null,
      getUiSessionSecret: () => 'session-secret',
      verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
      createUiSessionToken: async () => 'signed-session',
      parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
      buildUiSessionBootstrapHeaders: () => new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
      createUiSessionState: async () => ({
        sessionToken: 'signed-session',
        expiresInSeconds: 12 * 60 * 60,
        headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
      }),
    },
    getCachedSessionTopology: () => ({
      version: 'v2',
      shardCount: 16,
      idleTtlMs: 1800,
      absoluteTtlMs: 86400,
      evictionSweepLimit: 64,
    }),
    getWorkerLatencySnapshot: () => ({ routes: {} }),
    getUsageSnapshot: async () => ({ userId: 'user-1', count: 3 }),
    now: () => 1700000000000,
    ...overrides,
  };
}

describe('handleWorkerCoreRoutes', () => {
  it('serves health from the core route layer', async () => {
    const response = await handleWorkerCoreRoutes(buildContext('/health'), buildDeps());
    const payload = (await response?.json()) as Record<string, unknown>;

    assert.ok(response);
    assert.equal(response?.status, 200);
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.metrics, { latency_ms: { routes: {} } });
  });

  it('returns session status through the core route layer', async () => {
    const response = await handleWorkerCoreRoutes(buildContext('/api/session'), buildDeps());
    const payload = (await response?.json()) as Record<string, unknown>;

    assert.ok(response);
    assert.equal(response?.status, 200);
    assert.equal(payload.authenticated, true);
    assert.equal(payload.auth_backend, 'cloudflare_oauth');
    assert.deepEqual(payload.user, { id: 'user-1' });
    assert.equal(payload.session_authenticated, true);
    assert.equal(payload.bearer_authenticated, true);
  });

  it('does not report a healthy browser session when only bearer auth is available', async () => {
    const response = await handleWorkerCoreRoutes(
      buildContext('/api/session'),
      buildDeps({
        workerUiSessionRuntime: {
          resolveBrowserSessionUserId: async () => null,
          resolveCloudflareOAuthUserId: async () => 'user-1',
          getSessionBootstrapRateLimitedResponse: async () => null,
          getUiSessionSecret: () => 'session-secret',
          verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
          createUiSessionToken: async () => 'signed-session',
          parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
          buildUiSessionBootstrapHeaders: () => new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 12 * 60 * 60,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          }),
        },
      }),
    );
    const payload = (await response?.json()) as Record<string, unknown>;

    assert.ok(response);
    assert.equal(payload.authenticated, false);
    assert.equal(payload.session_authenticated, false);
    assert.equal(payload.bearer_authenticated, true);
    assert.equal(payload.user, null);
  });

  it('allows Clerk/OIDC bootstrap without the legacy shared secret', async () => {
    const request = new Request('https://worker.example/api/session/bootstrap', {
      method: 'POST',
      headers: {
        authorization: 'Bearer header.payload.signature',
        origin: 'https://auth.courtlistenermcp.blakeoxford.com',
      },
    });
    const context = {
      request,
      url: new URL(request.url),
      origin: 'https://auth.courtlistenermcp.blakeoxford.com',
      allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
      env: {
        oauthEnabled: true,
        MCP_UI_SESSION_SECRET: 'session-secret',
        OIDC_ISSUER: 'https://clerk.example',
        OIDC_AUDIENCE: 'mcp',
      },
      pathname: '/api/session/bootstrap',
      requestMethod: 'POST',
      mcpPath: false,
    };

    const response = await handleWorkerCoreRoutes(
      context,
      buildDeps({
        workerUiSessionRuntime: {
          resolveBrowserSessionUserId: async () => 'user-1',
          resolveCloudflareOAuthUserId: async () => 'user-1',
          getSessionBootstrapRateLimitedResponse: async () => null,
          getUiSessionSecret: () => 'session-secret',
          verifyBootstrapUserIdFromAuthorization: async (incomingRequest) => ({
            userId:
              incomingRequest.headers.get('authorization') === 'Bearer header.payload.signature'
                ? 'clerk-user-123'
                : null,
            error: null,
          }),
          createUiSessionToken: async () => 'signed-session',
          parseUiSessionToken: () => ({ sub: 'clerk-user-123', exp: 9999999999, jti: 'jti-1' }),
          buildUiSessionBootstrapHeaders: () => new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 12 * 60 * 60,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          }),
        },
      }),
    );

    assert.ok(response);
    assert.equal(response?.status, 200);
    const payload = (await response?.json()) as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.userId, 'clerk-user-123');
    assert.equal(response?.headers.get('access-control-allow-origin'), 'https://auth.courtlistenermcp.blakeoxford.com');
  });

  it('returns null when the route should fall through', async () => {
    const response = await handleWorkerCoreRoutes(buildContext('/not-handled'), buildDeps());
    assert.equal(response, null);
  });
});
