#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerDurableRuntime } from '../../src/server/worker-durable-runtime.js';

interface TestEnv {
  AUTH_FAILURE_LIMITER: DurableObjectNamespace;
  MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_MAX?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_WINDOW_SECONDS?: string;
  MCP_AUTH_FAILURE_RATE_LIMIT_BLOCK_SECONDS?: string;
  MCP_UI_RATE_LIMIT_ENABLED?: string;
  MCP_UI_AI_CHAT_RATE_LIMIT_MAX?: string;
}

function createLimiterNamespace(
  handler: (request: Request) => Promise<Response> | Response,
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(_id: DurableObjectId) {
      return {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = input instanceof Request ? input : new Request(String(input), init);
          return handler(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function createRuntime() {
  return createWorkerDurableRuntime<TestEnv>({
    now: () => 1_700_000_000_000,
    recordDurableObjectLatency: () => {},
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

describe('createWorkerDurableRuntime', () => {
  it('returns a 429 response when auth failures are already blocked', async () => {
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

    const response = await runtime.getAuthRateLimitedResponse('client-1', env, 1_700_000_000_000);
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
});
