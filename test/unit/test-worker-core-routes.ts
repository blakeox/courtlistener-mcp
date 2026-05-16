#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerCoreRoutes } from '../../src/server/worker-core-routes.js';

interface TestEnv {
  MCP_UI_SESSION_SECRET?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  MCP_TURNSTILE_ENFORCED_ROUTES?: string;
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
        email: null,
        displayName: null,
        authSource: 'ui_session',
      }),
      getSessionBootstrapRateLimitedResponse: async () => null,
      getUiSessionSecret: () => 'session-secret',
      verifyBootstrapUserIdFromAuthorization: async () => ({
        identity: { userId: 'user-1' },
        error: null,
      }),
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
      recordUserUiEvent: async () => undefined,
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
    getClientIdentifier: () => '127.0.0.1',
    recordTurnstileVerdict: () => undefined,
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
    assert.deepEqual(payload.cloudflare, {
      analytics_enabled: false,
      async_queue_configured: false,
      async_jobs_kv_configured: false,
      turnstile_enforced_routes: [],
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
    assert.equal(payload.turnstile_site_key, null);
  });

  it('returns turnstile site key in session payload when configured', async () => {
    const response = await handleWorkerCoreRoutes(
      {
        ...buildContext('/api/session'),
        env: { TURNSTILE_SITE_KEY: 'site-key-1' },
      },
      buildDeps(),
    );
    const payload = (await response?.json()) as Record<string, unknown>;

    assert.equal(payload.turnstile_site_key, 'site-key-1');
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
            email: null,
            displayName: null,
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
            identity:
              incomingRequest.headers.get('authorization') === 'Bearer header.payload.signature'
                ? { userId: 'oidc-user-123' }
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

  it('blocks bootstrap when Turnstile is enforced and token is missing', async () => {
    const request = new Request('https://worker.example/api/session/bootstrap', {
      method: 'POST',
    });

    const response = await handleWorkerCoreRoutes(
      {
        request,
        url: new URL(request.url),
        origin: null,
        allowedOrigins: ['https://chatgpt.com'],
        env: {
          MCP_UI_SESSION_SECRET: 'session-secret',
          TURNSTILE_SITE_KEY: 'site-key-1',
          TURNSTILE_SECRET_KEY: 'secret-key-1',
          MCP_TURNSTILE_ENFORCED_ROUTES: 'session_bootstrap',
        },
        ctx: {} as ExecutionContext,
        pathname: '/api/session/bootstrap',
        requestMethod: 'POST',
        mcpPath: false,
      },
      buildDeps(),
    );

    assert.equal(response?.status, 403);
    const payload = (await response?.json()) as { error_code?: string };
    assert.equal(payload.error_code, 'turnstile_token_missing');
  });

  it('accepts allowlisted UI telemetry events and records them to the telemetry sink', async () => {
    const request = new Request('https://worker.example/api/telemetry', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://chatgpt.com',
      },
      body: JSON.stringify({
        name: 'browser_session_bootstrap_succeeded',
        route: '/app/account',
        outcome: 'success',
      }),
    });
    const recorded: Array<{
      eventName: string;
      userId: string | null;
      route: string;
      outcome: string;
    }> = [];

    const response = await handleWorkerCoreRoutes(
      {
        request,
        url: new URL(request.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://chatgpt.com'],
        env: {},
        ctx: {} as ExecutionContext,
        pathname: '/api/telemetry',
        requestMethod: 'POST',
        mcpPath: false,
      },
      buildDeps({
        recordUiEvent: (eventName, userId, route, outcome) => {
          recorded.push({ eventName, userId, route, outcome });
        },
      }),
    );

    assert.equal(response?.status, 200);
    assert.deepEqual(await response?.json(), { ok: true });
    assert.deepEqual(recorded, [
      {
        eventName: 'browser_session_bootstrap_succeeded',
        userId: 'user-1',
        route: '/app/account',
        outcome: 'success',
      },
    ]);
  });

  it('rejects non-allowlisted UI telemetry events', async () => {
    const request = new Request('https://worker.example/api/telemetry', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'not_allowed',
        route: '/app/account',
        outcome: 'success',
      }),
    });

    const response = await handleWorkerCoreRoutes(
      {
        request,
        url: new URL(request.url),
        origin: null,
        allowedOrigins: ['https://chatgpt.com'],
        env: {},
        ctx: {} as ExecutionContext,
        pathname: '/api/telemetry',
        requestMethod: 'POST',
        mcpPath: false,
      },
      buildDeps(),
    );

    assert.equal(response?.status, 400);
    assert.deepEqual(await response?.json(), {
      error: 'Telemetry event is not allowed.',
      error_code: 'invalid_event_name',
    });
  });

  it('returns usage snapshots with browser bootstrap analytics', async () => {
    const response = await handleWorkerCoreRoutes(
      buildContext('/api/usage'),
      buildDeps({
        getUsageSnapshot: async () => ({
          userId: 'user-1',
          totalRequests: 17,
          dailyRequests: 4,
          currentDay: '2026-03-05',
          lastSeenAt: '2026-03-05T12:00:00.000Z',
          byRoute: { '/mcp': 11 },
          browserBootstrap: {
            attempted: 2,
            succeeded: 1,
            failed: 1,
            turnstileRefreshed: 3,
            lastOutcome: 'success',
            lastEventAt: '2026-03-05T11:59:00.000Z',
          },
        }),
      }),
    );

    assert.equal(response?.status, 200);
    assert.deepEqual(await response?.json(), {
      userId: 'user-1',
      totalRequests: 17,
      dailyRequests: 4,
      currentDay: '2026-03-05',
      lastSeenAt: '2026-03-05T12:00:00.000Z',
      byRoute: { '/mcp': 11 },
      browserBootstrap: {
        attempted: 2,
        succeeded: 1,
        failed: 1,
        turnstileRefreshed: 3,
        lastOutcome: 'success',
        lastEventAt: '2026-03-05T11:59:00.000Z',
      },
    });
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
