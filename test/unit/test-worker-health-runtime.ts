#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

describe('buildWorkerHealthPayload', () => {
  it('normalizes session topology and latency into the unified diagnostics shape', () => {
    const payload = buildWorkerHealthPayload(
      {
        version: 'v2',
        shardCount: 16,
        idleTtlMs: 1800,
        absoluteTtlMs: 86400,
        evictionSweepLimit: 64,
      },
      { routes: { '/health': { count: 1 } } },
      {
        analyticsEnabled: true,
        asyncQueueConfigured: true,
        asyncJobsKvConfigured: true,
        turnstileEnforcedRoutes: ['session_bootstrap', 'ai_chat'],
      },
    );

    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'courtlistener-mcp');
    assert.deepEqual(payload.diagnostics.cloudflare, {
      analytics_enabled: true,
      async_queue_configured: true,
      async_jobs_kv_configured: true,
      turnstile_enforced_routes: ['session_bootstrap', 'ai_chat'],
    });
    assert.deepEqual(payload.diagnostics.metrics, {
      latency_ms: { routes: { '/health': { count: 1 } } },
    });
    assert.deepEqual(payload.diagnostics.session_topology, {
      version: 'v2',
      shard_count: 16,
      idle_ttl_ms: 1800,
      absolute_ttl_ms: 86400,
      eviction_sweep_limit: 64,
    });
  });
});
