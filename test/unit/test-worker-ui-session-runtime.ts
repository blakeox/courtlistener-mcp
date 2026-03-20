#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerUiSessionRuntime } from '../../src/server/worker-ui-session-runtime.js';

interface TestEnv {
  MCP_UI_SESSION_SECRET?: string;
  MCP_AUTH_UI_ORIGIN?: string;
  MCP_ALLOW_DEV_FALLBACK?: string;
  MCP_OAUTH_DEV_USER_ID?: string;
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS?: string;
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

function createRuntime(
  overrides: {
    isUiSessionRevoked?: boolean;
    revocationUnavailable?: boolean;
    bootstrapRateLimited?: boolean;
    bootstrapLimiterUnavailable?: boolean;
    verifyOidcUserIdFromToken?: (
      token: string,
      env: TestEnv,
    ) => Promise<{ userId: string | null; error: string | null }>;
  } = {},
) {
  return createWorkerUiSessionRuntime<TestEnv>({
    jsonError,
    getClientIdentifier: () => 'client-1',
    isUiSessionRevoked: async () =>
      overrides.revocationUnavailable
        ? { kind: 'unavailable' }
        : { kind: 'ok', value: overrides.isUiSessionRevoked ?? false },
    recordSessionBootstrapRateLimit: async () =>
      overrides.bootstrapLimiterUnavailable
        ? { kind: 'unavailable' }
        : {
            kind: 'ok',
            value: overrides.bootstrapRateLimited
              ? { blocked: true, retryAfterSeconds: 123 }
              : { blocked: false, retryAfterSeconds: 0 },
          },
    ...(overrides.verifyOidcUserIdFromToken
      ? { verifyOidcUserIdFromToken: overrides.verifyOidcUserIdFromToken }
      : {}),
  });
}

describe('worker UI session runtime', () => {
  it('authenticates a request from a signed UI session cookie', async () => {
    const runtime = createRuntime();
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };
    const token = await runtime.createUiSessionToken('user-42', env.MCP_UI_SESSION_SECRET!);
    const request = new Request('https://worker.example/api/ai-chat', {
      headers: {
        cookie: `clmcp_ui=${token}`,
      },
    });

    const result = await runtime.authenticateUiApiRequest(request, env);

    assert.ok(!(result instanceof Response));
    assert.equal(result.userId, 'user-42');
    assert.equal(result.authType, 'session');
  });

  it('rejects a revoked UI session cookie', async () => {
    const runtime = createRuntime({ isUiSessionRevoked: true });
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };
    const token = await runtime.createUiSessionToken('user-42', env.MCP_UI_SESSION_SECRET!);
    const request = new Request('https://worker.example/api/ai-chat', {
      headers: {
        cookie: `clmcp_ui=${token}`,
      },
    });

    const result = await runtime.authenticateUiApiRequest(request, env);

    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
  });

  it('fails closed when session revocation cannot be validated', async () => {
    const runtime = createRuntime({ revocationUnavailable: true });
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };
    const token = await runtime.createUiSessionToken('user-42', env.MCP_UI_SESSION_SECRET!);
    const request = new Request('https://worker.example/api/ai-chat', {
      headers: {
        cookie: `clmcp_ui=${token}`,
      },
    });

    const result = await runtime.authenticateUiApiRequest(request, env);

    assert.ok(result instanceof Response);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), {
      error: 'Unable to validate session revocation.',
      error_code: 'session_revocation_unavailable',
    });
  });

  it('creates and validates CSRF cookies and headers', () => {
    const runtime = createRuntime();
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };
    const csrfCookieHeader = runtime.getOrCreateCsrfCookieHeader(
      new Request('https://worker.example/app'),
      env,
    );

    assert.ok(csrfCookieHeader);
    assert.match(csrfCookieHeader, /clmcp_csrf=/);

    const tokenMatch = csrfCookieHeader?.match(/^clmcp_csrf=([^;]+)/);
    assert.ok(tokenMatch);
    const token = tokenMatch[1];
    const validRequest = new Request('https://worker.example/api/ai-chat', {
      headers: {
        cookie: `clmcp_csrf=${token}`,
        'x-csrf-token': token,
      },
    });
    const invalidRequest = new Request('https://worker.example/api/ai-chat', {
      headers: {
        cookie: `clmcp_csrf=${token}`,
        'x-csrf-token': 'wrong-token',
      },
    });

    assert.equal(runtime.requireCsrfToken(validRequest), null);
    const invalid = runtime.requireCsrfToken(invalidRequest);
    assert.ok(invalid instanceof Response);
    assert.equal(invalid.status, 403);
  });

  it('creates a reusable UI session state for bootstrap flows', async () => {
    const runtime = createRuntime();
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };

    const state = await runtime.createUiSessionState(
      new Request('https://worker.example/api/session/bootstrap'),
      env,
      'user-99',
      env.MCP_UI_SESSION_SECRET!,
    );

    assert.ok(state);
    assert.equal(state?.expiresInSeconds, 12 * 60 * 60);
    assert.match(String(state?.sessionToken), /\./);
    assert.ok(state?.headers.get('Set-Cookie'));
  });

  it('resolves UI session user id only from the signed worker cookie', async () => {
    const runtime = createRuntime();
    const env: TestEnv = { MCP_UI_SESSION_SECRET: 'session-secret' };
    const token = await runtime.createUiSessionToken('user-42', env.MCP_UI_SESSION_SECRET!);
    const request = new Request('https://worker.example/api/session', {
      headers: {
        cookie: `clmcp_ui=${token}`,
        authorization: 'Bearer header.payload.signature',
      },
    });

    const result = await runtime.resolveUiSessionUserId(request, env);

    assert.equal(result, 'user-42');
  });

  it('accepts Clerk/OIDC-style JWT bootstrap tokens via OIDC verification', async () => {
    const env: TestEnv = {
      MCP_AUTH_UI_ORIGIN: 'https://auth.example',
      OIDC_ISSUER: 'https://clerk.example',
      OIDC_AUDIENCE: 'mcp',
    };
    const runtime = createRuntime({
      verifyOidcUserIdFromToken: async (token) => ({
        userId: token === 'header.payload.signature' ? 'clerk_user_123' : null,
        error: token === 'header.payload.signature' ? null : 'invalid oidc token',
      }),
    });

    const result = await runtime.verifyBootstrapUserIdFromAuthorization(
      new Request('https://worker.example/api/session/bootstrap', {
        headers: { authorization: 'Bearer header.payload.signature' },
      }),
      env,
    );

    assert.equal(result.userId, 'clerk_user_123');
    assert.equal(result.error, null);
  });

  it('rejects malformed non-JWT bootstrap bearer tokens', async () => {
    const env: TestEnv = {
      OIDC_ISSUER: 'https://clerk.example',
      OIDC_AUDIENCE: 'mcp',
    };
    const runtime = createRuntime({
      verifyOidcUserIdFromToken: async () => ({
        userId: null,
        error: 'should not be called',
      }),
    });

    const result = await runtime.verifyBootstrapUserIdFromAuthorization(
      new Request('https://worker.example/api/session/bootstrap', {
        headers: { authorization: 'Bearer not-a-jwt' },
      }),
      env,
    );

    assert.equal(result.userId, null);
    assert.match(String(result.error), /Malformed OIDC bearer token/i);
  });

  it('returns a bootstrap rate-limit response with retry headers', async () => {
    const runtime = createRuntime({ bootstrapRateLimited: true });
    const env: TestEnv = {};
    const request = new Request('https://worker.example/api/session/bootstrap');

    const response = await runtime.getSessionBootstrapRateLimitedResponse(request, env, Date.now());

    assert.ok(response instanceof Response);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '123');
  });

  it('fails closed when bootstrap rate limiting is unavailable', async () => {
    const runtime = createRuntime({ bootstrapLimiterUnavailable: true });
    const env: TestEnv = {};
    const request = new Request('https://worker.example/api/session/bootstrap');

    const response = await runtime.getSessionBootstrapRateLimitedResponse(request, env, Date.now());

    assert.ok(response instanceof Response);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'Unable to validate session bootstrap rate limit.',
      error_code: 'session_bootstrap_rate_limit_unavailable',
    });
  });
});
