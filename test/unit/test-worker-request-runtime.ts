#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerLegacyFetchHandler } from '../../src/server/worker-request-runtime.js';

interface TestEnv {
  MCP_ALLOWED_ORIGINS?: string;
  MCP_AUTH_UI_ORIGIN?: string;
  oauthEnabled?: boolean;
}

function buildLegacyFetchHandler(routeLatency: Array<{ route: string; elapsedMs: number }>) {
  return createWorkerLegacyFetchHandler<TestEnv>({
    getRequestOrigin: (request) => request.headers.get('origin'),
    getCachedAllowedOrigins: () => ['https://chatgpt.com'],
    isMcpPath: (pathname) => pathname === '/mcp',
    buildWorkerRouteMetricKey: (method, pathname) => `${method} ${pathname}`,
    recordRouteLatency: (route, elapsedMs) => {
      routeLatency.push({ route, elapsedMs });
    },
    now: (() => {
      let tick = 1000;
      return () => {
        tick += 25;
        return tick;
      };
    })(),
    workerCoreRouteDeps: {
      isAllowedOrigin: (origin, allowedOrigins) => origin === null || allowedOrigins.includes(origin),
      buildCorsHeaders: (origin) => {
        const headers = new Headers();
        if (origin) headers.set('access-control-allow-origin', origin);
        return headers;
      },
      withCors: (response, origin) => {
        const headers = new Headers(response.headers);
        if (origin) headers.set('access-control-allow-origin', origin);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      },
      jsonError: (message, status, errorCode, extra, extraHeaders) =>
        new Response(JSON.stringify({ error: message, error_code: errorCode, ...(extra ?? {}) }), {
          status,
          headers: extraHeaders,
        }),
      jsonResponse: (payload, status = 200, extraHeaders) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: extraHeaders,
        }),
      redirectResponse: (location, status = 302, extraHeaders) =>
        new Response(null, {
          status,
          headers: {
            Location: location,
            ...(extraHeaders ? Object.fromEntries(new Headers(extraHeaders).entries()) : {}),
          },
        }),
      isCloudflareOAuthBackendEnabled: (env) => env.oauthEnabled === true,
      isRemovedLegacyUiRoute: (pathname) => pathname === '/api/login',
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => 'user-1',
        getSessionBootstrapRateLimitedResponse: async () => null,
        getUiSessionSecret: () => 'session-secret',
        verifyBootstrapUserIdFromAuthorization: async () => ({ userId: 'user-1', error: null }),
        createUiSessionToken: async () => 'signed-session',
        parseUiSessionToken: () => ({ sub: 'user-1', exp: 9999999999, jti: 'jti-1' }),
        buildUiSessionBootstrapHeaders: () => new Headers({ 'set-cookie': 'clmcp_ui=signed-session' }),
        createUiSessionState: async () => ({
          sessionToken: 'signed-session',
          expiresInSeconds: 43200,
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
      now: () => Date.now(),
    },
    workerDelegatedRouteDeps: {
      jsonError: () => new Response(),
      jsonResponse: () => new Response(),
      rejectDisallowedUiOrigin: () => null,
      requireCsrfToken: () => null,
      parseJsonBody: async () => null,
      authenticateUiApiRequest: async () => ({ userId: 'user-1', authType: 'session' as const }),
      applyAiChatLifetimeQuota: async () => null,
      isPlainObject: (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
      aiToolFromPrompt: () => ({ tool: 'search_cases', reason: 'test' }),
      callMcpJsonRpc: async () => ({ payload: {}, sessionId: null }),
      hasValidMcpRpcShape: () => true,
      aiToolArguments: () => ({}),
      buildLowCostSummary: () => '',
      buildMcpSystemPrompt: () => '',
      extractMcpContext: () => '',
      preferredMcpProtocolVersion: '2025-03-26',
      defaultCfAiModelBalanced: '',
      defaultCfAiModelCheap: '',
      cheapModeMaxTokens: 1,
      balancedModeMaxTokens: 1,
      spaJs: '',
      spaCss: '',
      spaBuildId: 'test',
      spaAssetResponse: () => new Response(),
      generateCspNonce: () => 'nonce',
      getOrCreateCsrfCookieHeader: () => null,
      htmlResponse: () => new Response(),
      renderSpaShellHtml: () => '',
      redirectResponse: () => new Response(),
      mcpBoundaryPolicy: {
        supportedProtocolVersions: new Set(['2025-03-26']),
        mcpStreamableHandler: { fetch: async () => new Response('stream') },
        mcpSseCompatibilityHandler: { fetch: async () => new Response('sse') },
        withCors: (response: Response) => response,
        buildCorsHeaders: () => new Headers(),
        getClientIdentifier: () => 'client-1',
        getAuthRateLimitedResponse: async () => null,
        recordAuthFailure: async () => {},
        clearAuthFailures: async () => {},
        evaluateMcpBoundaryRequest: async () => null,
        validateSessionRequest: async () => ({ ok: true as const, sessionId: null, response: null }),
        finalizeSessionResponse: (response: Response) => response,
        onAuthorizedRequest: async () => {},
      },
    } as never,
  });
}

describe('createWorkerLegacyFetchHandler', () => {
  it('short-circuits on core routes and records latency', async () => {
    const routeLatency: Array<{ route: string; elapsedMs: number }> = [];
    const handler = buildLegacyFetchHandler(routeLatency);

    const response = await handler(
      new Request('https://worker.example/health'),
      { oauthEnabled: true },
      {} as ExecutionContext,
    );
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ok');
    assert.deepEqual(routeLatency, [{ route: 'GET /health', elapsedMs: 25 }]);
  });

  it('falls through to 404 when no core or delegated route matches', async () => {
    const routeLatency: Array<{ route: string; elapsedMs: number }> = [];
    const handler = buildLegacyFetchHandler(routeLatency);

    const response = await handler(
      new Request('https://worker.example/not-found'),
      { oauthEnabled: true },
      {} as ExecutionContext,
      { skipGatewayAuth: true },
    );

    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
    assert.deepEqual(routeLatency, [{ route: 'GET /not-found', elapsedMs: 25 }]);
  });
});
