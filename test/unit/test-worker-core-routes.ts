#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerCoreRoutes } from '../../src/server/worker-core-routes.js';

interface TestEnv {
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
    env: {},
    ctx: {} as ExecutionContext,
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
    isRemovedLegacyUiRoute: (pathname: string) => pathname === '/api/login',
    workerUiSessionRuntime: {
      resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-1' }),
      resolveUiSessionUserId: async () => 'user-1',
      resolveCloudflareOAuthUserId: async () => 'user-1',
      resolveCloudflareOAuthIdentity: async () => ({
        kind: 'authenticated',
        userId: 'user-1',
        authSource: 'ui_session',
      }),
      getSessionBootstrapRateLimitedResponse: async () => null,
      getUiSessionSecret: () => 'session-secret',
      verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
      createUiSessionToken: async () => 'signed-session',
      parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
      buildUiSessionBootstrapHeaders: () =>
        new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
      buildUiSessionLogoutHeaders: () =>
        new Headers({
          'set-cookie':
            'clmcp_ui=; Path=/; SameSite=Lax; Max-Age=0, clmcp_ui_present=; Path=/; SameSite=Lax; Max-Age=0, clmcp_csrf=; Path=/; SameSite=Lax; Max-Age=0',
        }),
      createUiSessionState: async () => ({
        sessionToken: 'signed-session',
        expiresInSeconds: 12 * 60 * 60,
        headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
      }),
      requireCsrfToken: () => null,
    },
    workerDurableRuntime: {
      consumeBrowserBootstrapHandoff: async () => ({ kind: 'ok', value: true }),
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
    const response = await handleWorkerCoreRoutes(
      buildContext('/health'),
      buildDeps({
        getWorkerLatencySnapshot: () => ({
          routes: {},
          durable_objects: {
            auth_limiter: { count: 0, avg_ms: 0, max_ms: 0, last_ms: 0, unavailable_count: 0 },
            session_revocation: {
              count: 1,
              avg_ms: 12,
              max_ms: 12,
              last_ms: 12,
              unavailable_count: 1,
            },
            mcp_session_lifecycle: {
              count: 2,
              avg_ms: 8,
              max_ms: 9,
              last_ms: 7,
              unavailable_count: 1,
            },
            ai_chat_quota: { count: 0, avg_ms: 0, max_ms: 0, last_ms: 0, unavailable_count: 0 },
          },
        }),
      }),
    );
    const payload = (await response?.json()) as Record<string, unknown>;

    assert.ok(response);
    assert.equal(response?.status, 200);
    assert.equal(payload.status, 'ok');
    assert.deepEqual(payload.metrics, {
      latency_ms: {
        routes: {},
        durable_objects: {
          auth_limiter: { count: 0, avg_ms: 0, max_ms: 0, last_ms: 0, unavailable_count: 0 },
          session_revocation: {
            count: 1,
            avg_ms: 12,
            max_ms: 12,
            last_ms: 12,
            unavailable_count: 1,
          },
          mcp_session_lifecycle: {
            count: 2,
            avg_ms: 8,
            max_ms: 9,
            last_ms: 7,
            unavailable_count: 1,
          },
          ai_chat_quota: { count: 0, avg_ms: 0, max_ms: 0, last_ms: 0, unavailable_count: 0 },
        },
      },
    });
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
          resolveUiSession: async () => ({ kind: 'invalid' }),
          resolveUiSessionUserId: async () => null,
          resolveCloudflareOAuthUserId: async () => 'user-1',
          resolveCloudflareOAuthIdentity: async () => ({
            kind: 'authenticated',
            userId: 'user-1',
            authSource: 'ui_session',
          }),
          getSessionBootstrapRateLimitedResponse: async () => null,
          getUiSessionSecret: () => 'session-secret',
          verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
          createUiSessionToken: async () => 'signed-session',
          parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
          buildUiSessionBootstrapHeaders: () =>
            new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          buildUiSessionLogoutHeaders: () => new Headers(),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 12 * 60 * 60,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          }),
          requireCsrfToken: () => null,
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

  it('returns a 503 for /api/session when revocation validation is unavailable', async () => {
    const response = await handleWorkerCoreRoutes(
      buildContext('/api/session'),
      buildDeps({
        workerUiSessionRuntime: {
          resolveUiSession: async () => ({ kind: 'revocation_unavailable' }),
          resolveUiSessionUserId: async () => null,
          resolveCloudflareOAuthUserId: async () => null,
          resolveCloudflareOAuthIdentity: async () => ({ kind: 'missing' }),
          getSessionBootstrapRateLimitedResponse: async () => null,
          getUiSessionSecret: () => 'session-secret',
          verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
          createUiSessionToken: async () => 'signed-session',
          parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
          buildUiSessionBootstrapHeaders: () =>
            new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          buildUiSessionLogoutHeaders: () => new Headers(),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 12 * 60 * 60,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          }),
          requireCsrfToken: () => null,
        },
      }),
    );

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to validate session revocation.',
      error_code: 'session_revocation_unavailable',
    });
  });

  it('allows OIDC bootstrap without the legacy shared secret', async () => {
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
        MCP_UI_SESSION_SECRET: 'session-secret',
        OIDC_ISSUER: 'https://issuer.example',
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
          resolveUiSession: async () => ({ kind: 'authenticated', userId: 'user-1' }),
          resolveUiSessionUserId: async () => 'user-1',
          resolveCloudflareOAuthUserId: async () => 'user-1',
          resolveCloudflareOAuthIdentity: async () => ({
            kind: 'authenticated',
            userId: 'user-1',
            authSource: 'ui_session',
          }),
          getSessionBootstrapRateLimitedResponse: async () => null,
          getUiSessionSecret: () => 'session-secret',
          verifyBootstrapUserIdFromAuthorization: async (incomingRequest) => ({
            userId:
              incomingRequest.headers.get('authorization') === 'Bearer header.payload.signature'
                ? 'oidc-user-123'
                : null,
            error: null,
          }),
          createUiSessionToken: async () => 'signed-session',
          parseUiSessionToken: () => ({ sub: 'oidc-user-123', exp: 9999999999, jti: 'jti-1' }),
          buildUiSessionBootstrapHeaders: () =>
            new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          buildUiSessionLogoutHeaders: () => new Headers(),
          createUiSessionState: async () => ({
            sessionToken: 'signed-session',
            expiresInSeconds: 12 * 60 * 60,
            headers: new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
          }),
          requireCsrfToken: () => null,
        },
      }),
    );

    assert.ok(response);
    assert.equal(response?.status, 200);
    const payload = (await response?.json()) as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.userId, 'oidc-user-123');
    assert.equal(
      response?.headers.get('access-control-allow-origin'),
      'https://auth.courtlistenermcp.blakeoxford.com',
    );
  });

  it('clears UI session cookies on POST /api/logout when CSRF is valid', async () => {
    const request = new Request('https://worker.example/api/logout', {
      method: 'POST',
      headers: {
        cookie: 'clmcp_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
    });

    const response = await handleWorkerCoreRoutes(
      {
        request,
        url: new URL(request.url),
        origin: null,
        allowedOrigins: ['https://chatgpt.com'],
        env: {},
        ctx: {} as ExecutionContext,
        pathname: '/api/logout',
        requestMethod: 'POST',
        mcpPath: false,
      },
      buildDeps(),
    );

    assert.ok(response);
    assert.equal(response?.status, 200);
    assert.deepEqual(await response?.json(), { ok: true });
    assert.match(String(response?.headers.get('set-cookie')), /clmcp_ui=/);
    assert.match(String(response?.headers.get('set-cookie')), /clmcp_ui_present=/);
    assert.match(String(response?.headers.get('set-cookie')), /clmcp_csrf=/);
  });

  it('rejects POST /api/logout when CSRF validation fails', async () => {
    const request = new Request('https://worker.example/api/logout', {
      method: 'POST',
      headers: {
        cookie: 'clmcp_csrf=csrf-token',
        'x-csrf-token': 'wrong-token',
      },
    });

    const response = await handleWorkerCoreRoutes(
      {
        request,
        url: new URL(request.url),
        origin: null,
        allowedOrigins: ['https://chatgpt.com'],
        env: {},
        ctx: {} as ExecutionContext,
        pathname: '/api/logout',
        requestMethod: 'POST',
        mcpPath: false,
      },
      buildDeps({
        workerUiSessionRuntime: {
          ...buildDeps().workerUiSessionRuntime,
          requireCsrfToken: () =>
            jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed'),
        },
      }),
    );

    assert.ok(response);
    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), {
      error: 'CSRF token validation failed.',
      error_code: 'csrf_validation_failed',
    });
  });

  it('returns null when the route should fall through', async () => {
    const response = await handleWorkerCoreRoutes(buildContext('/not-handled'), buildDeps());
    assert.equal(response, null);
  });
});
