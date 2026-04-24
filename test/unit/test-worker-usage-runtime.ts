#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveWorkerUsage } from '../../src/server/worker-usage-runtime.js';

describe('resolveWorkerUsage', () => {
  it('uses the prevalidated context user id when present', async () => {
    const request = new Request('https://worker.example/api/usage');

    const result = await resolveWorkerUsage({
      request,
      env: {},
      ctx: { props: { userId: 'user-7', authMethod: 'oidc' } } as ExecutionContext,
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
      ctx: {} as ExecutionContext,
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
      ctx: {} as ExecutionContext,
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => 'user-9',
      },
      getUsageSnapshot: async () => null,
    });

    assert.deepEqual(result, { kind: 'unavailable' });
  });

  it('ignores spoofed oauth headers without a prevalidated context', async () => {
    const result = await resolveWorkerUsage({
      request: new Request('https://worker.example/api/usage', {
        headers: { 'x-oauth-user-id': 'spoofed-user' },
      }),
      env: {},
      ctx: {} as ExecutionContext,
      workerUiSessionRuntime: {
        resolveCloudflareOAuthUserId: async () => 'resolved-user',
      },
      getUsageSnapshot: async (_env, userId) => ({ userId, count: 1 }),
    });

    assert.deepEqual(result, { kind: 'ok', snapshot: { userId: 'resolved-user', count: 1 } });
  });
});
