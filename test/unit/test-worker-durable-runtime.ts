#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AuthFailureLimiterDO,
  createWorkerDurableRuntime,
} from '../../src/server/worker-durable-runtime.js';

interface TestEnv {
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_MAX?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN?: string;
  MCP_BOUNDARY_GUARDS_ENABLED?: string;
  MCP_BOUNDARY_FAIL_OPEN?: string;
  MCP_SESSION_LIFECYCLE_FAIL_OPEN?: string;
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
}

function createLimiterNamespace(
  handler: (request: Request, objectName?: string) => Promise<Response> | Response,
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(id: DurableObjectId) {
      return {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : new Request(String(input), init);
          return handler(request, String(id));
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function createRuntime() {
  return createWorkerDurableRuntime<TestEnv>({
    now: () => 1_700_000_000_000,
    recordDurableObjectLatency: () => {},
    recordDurableObjectUnavailable: () => {},
    getCachedSessionTopology: () => ({
      version: 'v2',
      shardCount: 16,
      idleTtlMs: 1800,
      absoluteTtlMs: 86400,
      evictionSweepLimit: 64,
    }),
    jsonError: (message, status, errorCode, extra, extraHeaders) =>
      new Response(
        JSON.stringify({
          error: message,
          error_code: errorCode,
          ...(extra ?? {}),
        }),
        {
          status,
          headers: extraHeaders,
        },
      ),
  });
}

class MockDurableObjectStorage {
  private readonly values = new Map<string, unknown>();
  alarmAt: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }

  async list<T>({ prefix = '', limit }: { prefix?: string; limit?: number } = {}): Promise<
    Map<string, T>
  > {
    const entries = new Map<string, T>();
    for (const [key, value] of this.values.entries()) {
      if (!key.startsWith(prefix)) continue;
      entries.set(key, value as T);
      if (typeof limit === 'number' && entries.size >= limit) {
        break;
      }
    }
    return entries;
  }

  async setAlarm(when: number): Promise<void> {
    this.alarmAt = when;
  }

  async deleteAlarm(): Promise<void> {
    this.alarmAt = null;
  }
}

function createLimiterObject() {
  const storage = new MockDurableObjectStorage();
  const state = {
    storage,
    id: {
      toString: () => 'test-do-id',
    },
  } as unknown as DurableObjectState;

  return {
    object: new AuthFailureLimiterDO(state),
    storage,
  };
}

describe('createWorkerDurableRuntime', () => {
  it('returns a 429 response when an extracted auth rate-limit handler sees a blocked client', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () =>
        Response.json({
          blocked: true,
          retryAfterSeconds: 17,
          state: {
            count: 3,
            windowStartedAtMs: 1_700_000_000_000,
            blockedUntilMs: 1_700_000_017_000,
          },
        }),
      ),
    };

    const getAuthRateLimitedResponse = runtime.getAuthRateLimitedResponse;
    const response = await getAuthRateLimitedResponse('client-1', env, 1_700_000_000_000);
    assert.ok(response);
    assert.equal(response?.status, 429);
    assert.equal(response?.headers.get('Retry-After'), '17');
    const payload = (await response?.json()) as Record<string, unknown>;
    assert.equal(payload.error_code, 'auth_rate_limited');
    assert.equal(payload.retry_after_seconds, 17);
  });

  it('records route metadata when incrementing usage', async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async (request) => {
        capturedBodies.push((await request.json()) as Record<string, unknown>);
        return Response.json({ ok: true });
      }),
    };

    await runtime.incrementUserUsage(env, 'user-42', {
      route: '/mcp',
      method: 'POST',
    });

    assert.equal(capturedBodies.length, 1);
    assert.deepEqual(capturedBodies[0], {
      action: 'usage_increment',
      nowMs: 1_700_000_000_000,
      route: '/mcp',
      method: 'POST',
    });
  });

  it('fails open for OAuth frontdoor when auth rate limiter is unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
      MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN: 'true',
    };

    const response = await runtime.getAuthRouteRateLimitedResponse(
      'authorize:GET:client-1',
      env,
      1_700_000_000_000,
    );

    assert.equal(response, null);
  });

  it('fails closed for OAuth frontdoor when fail-open is disabled', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
      MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN: 'false',
    };

    const response = await runtime.getAuthRouteRateLimitedResponse(
      'authorize:GET:client-1',
      env,
      1_700_000_000_000,
    );

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to validate OAuth route rate limit.',
      error_code: 'oauth_route_rate_limit_unavailable',
    });
  });

  it('fails closed when auth rate limiter is unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(
        async () => new Response('unavailable', { status: 503 }),
      ),
    };

    const response = await runtime.getAuthRateLimitedResponse('client-1', env, 1_700_000_000_000);

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to validate authentication rate limit.',
      error_code: 'auth_rate_limiter_unavailable',
    });
  });

  it('returns unavailable when session revocation checks fail', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(
        async () => new Response('unavailable', { status: 503 }),
      ),
    };

    const result = await runtime.isUiSessionRevoked(env, 'session-jti');

    assert.deepEqual(result, { kind: 'unavailable' });
  });

  it('consumes browser bootstrap handoffs exactly once', async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async (request) => {
        const body = (await request.json()) as Record<string, unknown>;
        capturedBodies.push(body);
        return Response.json({ accepted: capturedBodies.length === 1 });
      }),
    };

    const first = await runtime.consumeBrowserBootstrapHandoff(
      env,
      'handoff-jti-1',
      1_700_000_060_000,
    );
    const second = await runtime.consumeBrowserBootstrapHandoff(
      env,
      'handoff-jti-1',
      1_700_000_060_000,
    );

    assert.deepEqual(first, { kind: 'ok', value: true });
    assert.deepEqual(second, { kind: 'ok', value: false });
    assert.deepEqual(capturedBodies[0], {
      action: 'browser_bootstrap_consume',
      nowMs: 1_700_000_000_000,
      expiresAtMs: 1_700_000_060_000,
    });
  });

  it('returns a 503 when MCP boundary protections are unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
      MCP_BOUNDARY_GUARDS_ENABLED: 'true',
      MCP_BOUNDARY_FAIL_OPEN: 'false',
      MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN: 'false',
    };
    const request = new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '18',
      },
      body: '{"jsonrpc":"2.0"}',
    });

    const response = await runtime.evaluateMcpBoundaryRequest(
      request,
      env,
      'client-1',
      1_700_000_000_000,
    );

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to enforce MCP boundary protections.',
      error_code: 'mcp_boundary_unavailable',
    });
  });

  it('returns a 503 when MCP replay protections are unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        return new Response('unavailable', { status: 503 });
      }),
      MCP_BOUNDARY_GUARDS_ENABLED: 'true',
      MCP_BOUNDARY_FAIL_OPEN: 'false',
      MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN: 'false',
    };
    const request = new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '57',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    });

    const response = await runtime.evaluateMcpBoundaryRequest(
      request,
      env,
      'client-1',
      1_700_000_000_000,
    );

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to enforce MCP boundary protections.',
      error_code: 'mcp_boundary_unavailable',
    });
  });

  it('returns retry metadata when the MCP replay limiter blocks a request', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async (request) => {
        const body = (await request.json()) as { action?: string; replay?: unknown };
        assert.equal(body.action, 'mcp_boundary_evaluate');
        assert.ok(body.replay);
        return Response.json({
          blocked: true,
          retryAfterSeconds: 23,
          reason: 'replay_detected',
        });
      }),
      MCP_BOUNDARY_GUARDS_ENABLED: 'true',
      MCP_BOUNDARY_FAIL_OPEN: 'false',
    };
    const request = new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': 'session-1',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: 1 }),
    });

    const response = await runtime.evaluateMcpBoundaryRequest(
      request,
      env,
      'client-1',
      1_700_000_000_000,
    );

    assert.ok(response);
    assert.equal(response?.status, 409);
    assert.equal(response?.headers.get('Retry-After'), '23');
    assert.deepEqual(await response?.json(), {
      error: 'Replay request detected at MCP boundary.',
      error_code: 'mcp_replay_detected',
      retry_after_seconds: 23,
    });
  });

  it('fails open when MCP session lifecycle checks are unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(
        async () => new Response('unavailable', { status: 503 }),
      ),
      MCP_SESSION_LIFECYCLE_FAIL_OPEN: 'true',
    };
    const request = new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: { 'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000' },
    });

    const response = await runtime.validateSessionRequest(request, env, 1_700_000_000_000);

    assert.equal(response, null);
  });

  it('skips auth failure clear when the client has no failure state', async () => {
    const runtime = createRuntime();
    const capturedActions: string[] = [];
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async (request) => {
        const body = (await request.json()) as { action?: string };
        capturedActions.push(body.action ?? 'unknown');
        return Response.json({
          blocked: false,
          retryAfterSeconds: 0,
          state: { count: 0, windowStartedAtMs: 0, blockedUntilMs: 0 },
        });
      }),
    };

    await runtime.clearAuthFailures('client-1', env, 1_700_000_000_000, false);

    assert.deepEqual(capturedActions, []);
  });

  it('treats session lifecycle validation failures as unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(
        async () => new Response('unavailable', { status: 503 }),
      ),
      MCP_SESSION_LIFECYCLE_FAIL_OPEN: 'false',
    };
    const request = new Request('https://worker.example/mcp', {
      method: 'POST',
      headers: { 'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000' },
    });

    const response = await runtime.validateSessionRequest(request, env, 1_700_000_000_000);

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session lifecycle service unavailable',
      },
    });
  });

  it('treats session lifecycle mutation failures as unavailable for register and close', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(
        async () => new Response('unavailable', { status: 503 }),
      ),
      MCP_SESSION_LIFECYCLE_FAIL_OPEN: 'false',
    };

    const registerOverride = await runtime.finalizeSessionResponse(
      new Request('https://worker.example/mcp', { method: 'POST' }),
      new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000',
        },
      }),
      env,
      1_700_000_000_000,
    );

    assert.ok(registerOverride);
    assert.equal(registerOverride?.status, 503);
    assert.deepEqual(await registerOverride?.json(), {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session lifecycle service unavailable',
      },
    });

    const closeOverride = await runtime.finalizeSessionResponse(
      new Request('https://worker.example/mcp', {
        method: 'DELETE',
        headers: {
          'mcp-session-id': '123e4567-e89b-12d3-a456-426614174000',
        },
      }),
      new Response(null, { status: 204 }),
      env,
      1_700_000_000_000,
    );

    assert.ok(closeOverride);
    assert.equal(closeOverride?.status, 503);
    assert.deepEqual(await closeOverride?.json(), {
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session lifecycle service unavailable',
      },
    });
  });

  it('degrades increment usage failures without throwing', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
    };

    await assert.doesNotReject(() =>
      runtime.incrementUserUsage(env, 'user-42', {
        route: '/mcp',
        method: 'POST',
      }),
    );
  });

  it('degrades usage snapshot failures to unavailable', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
    };

    const snapshot = await runtime.getUserUsageSnapshot(env, 'user-42');

    assert.equal(snapshot, null);
  });

  it('degrades AI chat quota fetch errors to a 503 response', async () => {
    const runtime = createRuntime();
    const env: TestEnv = {
      AUTH_FAILURE_LIMITER: createLimiterNamespace(async () => {
        throw new Error('do offline');
      }),
    };

    const response = await runtime.applyAiChatLifetimeQuota(env, 'user-42');

    assert.ok(response);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), {
      error: 'Unable to validate hosted AI chat quota.',
      error_code: 'ai_chat_quota_unavailable',
    });
  });
});

describe('AuthFailureLimiterDO cleanup', () => {
  it('clears expired auth limiter state on alarm', async () => {
    const { object, storage } = createLimiterObject();

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          nowMs: 1_000,
          maxAttempts: 5,
          windowMs: 2_000,
          blockMs: 4_000,
        }),
      }),
    );

    assert.equal(storage.alarmAt, 3_000);
    assert.deepEqual(await storage.get('auth_failure_state'), {
      count: 1,
      windowStartedAtMs: 1_000,
      blockedUntilMs: 0,
    });

    const originalNow = Date.now;
    Date.now = () => 3_100;
    try {
      await object.alarm();
    } finally {
      Date.now = originalNow;
    }

    assert.equal(await storage.get('auth_failure_state'), undefined);
    assert.equal(await storage.get('auth_failure_window_ms'), undefined);
    assert.equal(await storage.get('auth_failure_cleanup_at_ms'), undefined);
    assert.equal(storage.alarmAt, null);
  });

  it('re-arms blocked auth limiter cleanup after the first alarm fires', async () => {
    const { object, storage } = createLimiterObject();

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          nowMs: 1_000,
          maxAttempts: 2,
          windowMs: 2_000,
          blockMs: 4_000,
        }),
      }),
    );

    assert.equal(storage.alarmAt, 3_000);

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          nowMs: 2_000,
          maxAttempts: 2,
          windowMs: 2_000,
          blockMs: 4_000,
        }),
      }),
    );

    assert.equal(storage.alarmAt, 3_000);
    assert.deepEqual(await storage.get('auth_failure_state'), {
      count: 2,
      windowStartedAtMs: 1_000,
      blockedUntilMs: 6_000,
    });

    const originalNow = Date.now;
    storage.alarmAt = null;
    Date.now = () => 3_100;
    try {
      await object.alarm();
    } finally {
      Date.now = originalNow;
    }

    assert.equal(storage.alarmAt, 6_000);
    assert.equal(await storage.get('auth_failure_cleanup_at_ms'), 6_000);
    assert.deepEqual(await storage.get('auth_failure_state'), {
      count: 2,
      windowStartedAtMs: 1_000,
      blockedUntilMs: 6_000,
    });
  });

  it('clears expired session revocations on alarm', async () => {
    const { object, storage } = createLimiterObject();

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'session_revoke',
          nowMs: 2_000,
          revokeUntilMs: 5_000,
        }),
      }),
    );

    assert.equal(storage.alarmAt, 5_000);
    assert.equal(await storage.get('ui_session_revoked_until_ms'), 5_000);

    const originalNow = Date.now;
    Date.now = () => 5_100;
    try {
      await object.alarm();
    } finally {
      Date.now = originalNow;
    }

    assert.equal(await storage.get('ui_session_revoked_until_ms'), undefined);
    assert.equal(storage.alarmAt, null);
  });

  it('drops stale auth limiter state during checks instead of persisting zero state', async () => {
    const { object, storage } = createLimiterObject();

    await storage.put('auth_failure_state', {
      count: 2,
      windowStartedAtMs: 1_000,
      blockedUntilMs: 0,
    });
    await storage.put('auth_failure_window_ms', 2_000);
    await storage.put('auth_failure_cleanup_at_ms', 3_000);

    const response = await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'check',
          nowMs: 4_000,
          maxAttempts: 5,
          windowMs: 2_000,
          blockMs: 4_000,
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      blocked: false,
      retryAfterSeconds: 0,
      state: {
        count: 0,
        windowStartedAtMs: 0,
        blockedUntilMs: 0,
      },
    });
    assert.equal(await storage.get('auth_failure_state'), undefined);
    assert.equal(await storage.get('auth_failure_window_ms'), undefined);
    assert.equal(await storage.get('auth_failure_cleanup_at_ms'), undefined);
    assert.equal(storage.alarmAt, null);
  });

  it('does not sweep expired MCP sessions on touch', async () => {
    const { object, storage } = createLimiterObject();
    await storage.put('mcp_session:expired', {
      sessionId: 'expired',
      createdAtMs: 0,
      lastSeenAtMs: 0,
      idleExpiresAtMs: 1_000,
      absoluteExpiresAtMs: 1_000,
    });
    await storage.put('mcp_session:active', {
      sessionId: 'active',
      createdAtMs: 5_000,
      lastSeenAtMs: 5_000,
      idleExpiresAtMs: 60_000,
      absoluteExpiresAtMs: 120_000,
    });

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'mcp_session_touch',
          nowMs: 10_000,
          sessionId: 'active',
          idleTtlMs: 30_000,
          absoluteTtlMs: 120_000,
          evictionSweepLimit: 64,
        }),
      }),
    );

    assert.ok(await storage.get('mcp_session:expired'), 'touch should not sweep stale sessions');
    assert.ok(await storage.get('mcp_session:active'));
  });

  it('evicts expired replay state keys on alarm', async () => {
    const { object, storage } = createLimiterObject();
    await storage.put('mcp_replay_state:deadbeef', {
      count: 1,
      windowStartedAtMs: 1_000,
      blockedUntilMs: 0,
    });
    await storage.put('mcp_replay_window_ms:deadbeef', 120_000);
    await storage.put('mcp_session_alarm_at_ms', 5_000);

    const originalNow = Date.now;
    Date.now = () => 200_000;
    try {
      await object.alarm();
    } finally {
      Date.now = originalNow;
    }

    assert.equal(await storage.get('mcp_replay_state:deadbeef'), undefined);
    assert.equal(await storage.get('mcp_replay_window_ms:deadbeef'), undefined);
  });

  it('caps usage_by_route growth during usage increments', async () => {
    const { object, storage } = createLimiterObject();
    const byRoute: Record<string, number> = {};
    for (let i = 0; i < 40; i += 1) {
      byRoute[`/route-${i}`] = i;
    }
    await storage.put('usage_by_route', byRoute);

    await object.fetch(
      new Request('https://auth-failure-limiter/internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'usage_increment',
          nowMs: 10_000,
          route: '/route-39',
        }),
      }),
    );

    const stored = (await storage.get('usage_by_route')) as Record<string, number>;
    assert.ok(stored);
    assert.equal(Object.keys(stored).length, 32);
    assert.equal(stored['/route-39'], 40);
  });
});
