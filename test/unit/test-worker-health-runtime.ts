#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

describe('buildWorkerHealthPayload', () => {
  it('normalizes worker control-plane diagnostics and latency', () => {
    const payload = buildWorkerHealthPayload(
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
  });
});
