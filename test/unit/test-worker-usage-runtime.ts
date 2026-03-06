#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveWorkerUsage } from '../../src/server/worker-usage-runtime.js';

describe('resolveWorkerUsage', () => {
  it('uses the oauth header user id when present', async () => {
    const request = new Request('https://worker.example/api/usage', {
      headers: { 'x-oauth-user-id': 'user-7' },
    });

    const result = await resolveWorkerUsage({
      request,
      env: {},
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => 'should-not-be-used',
      },
      getUsageSnapshot: async (_env, userId) => ({ userId, count: 3 }),
    });

    assert.deepEqual(result, { kind: 'ok', snapshot: { userId: 'user-7', count: 3 } });
  });

  it('returns unauthenticated when no user id can be resolved', async () => {
    const result = await resolveWorkerUsage({
      request: new Request('https://worker.example/api/usage'),
      env: {},
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => null,
      },
      getUsageSnapshot: async () => ({ count: 1 }),
    });

    assert.deepEqual(result, { kind: 'unauthenticated' });
  });

  it('returns unavailable when snapshot loading fails', async () => {
    const result = await resolveWorkerUsage({
      request: new Request('https://worker.example/api/usage'),
      env: {},
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => 'user-9',
      },
      getUsageSnapshot: async () => null,
    });

    assert.deepEqual(result, { kind: 'unavailable' });
  });
});
