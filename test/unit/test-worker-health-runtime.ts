#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildWorkerHealthPayload } from '../../src/server/worker-health-runtime.js';

describe('buildWorkerHealthPayload', () => {
  it('normalizes session topology and latency into the health payload shape', () => {
    const payload = buildWorkerHealthPayload(
      {
        version: 'v2',
        shardCount: 16,
        idleTtlMs: 1800,
        absoluteTtlMs: 86400,
        evictionSweepLimit: 64,
      },
      { routes: { '/health': { count: 1 } } },
    );

    assert.equal(payload.status, 'ok');
    assert.equal(payload.service, 'courtlistener-mcp');
    assert.deepEqual(payload.metrics, { latency_ms: { routes: { '/health': { count: 1 } } } });
    assert.deepEqual(payload.session_topology, {
      version: 'v2',
      shard_count: 16,
      idle_ttl_ms: 1800,
      absolute_ttl_ms: 86400,
      eviction_sweep_limit: 64,
    });
  });
});
