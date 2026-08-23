#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertOAuthFrontdoorRateLimitDeps,
  getOAuthFrontdoorRateLimitedResponse,
} from '../../src/server/worker-oauth-frontdoor-rate-limit.js';

describe('worker-oauth-frontdoor-rate-limit', () => {
  it('rejects incomplete production limiter wiring', () => {
    assert.throws(() => assertOAuthFrontdoorRateLimitDeps({ now: () => 123 }), {
      message:
        'OAuth front-door rate limiting is unavailable: all limiter dependencies are required.',
    });
  });

  it('returns null when rate-limit deps are not fully provided', async () => {
    const response = await getOAuthFrontdoorRateLimitedResponse(
      new Request('https://worker.example/auth/start'),
      {},
      'auth-start',
      { now: () => 123 },
    );

    assert.equal(response, null);
  });

  it('builds a route/method/client bucket and delegates to the limiter', async () => {
    let receivedBucketId = '';
    let receivedNow = 0;
    const response = await getOAuthFrontdoorRateLimitedResponse(
      new Request('https://worker.example/auth/start', { method: 'post' }),
      { name: 'env' },
      'auth-start',
      {
        getClientIdentifier: () => 'client-123',
        getAuthRouteRateLimitedResponse: async (bucketId, _env, nowMs) => {
          receivedBucketId = bucketId;
          receivedNow = nowMs;
          return Response.json({ error: 'rate_limited' }, { status: 429 });
        },
        now: () => 456,
      },
    );

    assert.equal(receivedBucketId, 'auth-start:POST:client-123');
    assert.equal(receivedNow, 456);
    assert.equal(response?.status, 429);
  });
});
