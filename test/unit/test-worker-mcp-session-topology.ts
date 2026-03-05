#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeWorkerMcpSessionShard,
  getWorkerMcpSessionPlacementHint,
  getWorkerMcpSessionShardName,
  resolveWorkerMcpSessionTopologyV2,
} from '../../src/server/worker-mcp-session-topology.js';

describe('worker MCP session topology v2', () => {
  it('derives deterministic shard ownership from session id', () => {
    const topology = resolveWorkerMcpSessionTopologyV2({
      MCP_SESSION_SHARD_COUNT: '8',
    });
    const first = computeWorkerMcpSessionShard('session-alpha', topology);
    const second = computeWorkerMcpSessionShard('session-alpha', topology);
    const shardName = getWorkerMcpSessionShardName('session-alpha', topology);
    const placement = getWorkerMcpSessionPlacementHint('session-alpha', topology);

    assert.equal(first, second);
    assert.ok(first >= 0 && first < 8);
    assert.equal(shardName, `mcp-session-v2:shard:${first}`);
    assert.equal(placement.shard, first);
    assert.equal(placement.shardName, shardName);
    assert.equal(placement.placementSignal, `do-shard:${first}`);
  });

  it('applies production defaults and guardrails', () => {
    const defaults = resolveWorkerMcpSessionTopologyV2({});
    assert.equal(defaults.version, 'v2');
    assert.equal(defaults.shardCount, 16);
    assert.equal(defaults.idleTtlMs, 30 * 60 * 1000);
    assert.equal(defaults.absoluteTtlMs, 24 * 60 * 60 * 1000);
    assert.equal(defaults.evictionSweepLimit, 64);

    const clamped = resolveWorkerMcpSessionTopologyV2({
      MCP_SESSION_SHARD_COUNT: '-1',
      MCP_SESSION_IDLE_TTL_SECONDS: '0',
      MCP_SESSION_ABSOLUTE_TTL_SECONDS: '0',
      MCP_SESSION_EVICTION_SWEEP_LIMIT: '-1',
    });
    assert.equal(clamped.shardCount, defaults.shardCount);
    assert.equal(clamped.idleTtlMs, defaults.idleTtlMs);
    assert.equal(clamped.absoluteTtlMs, defaults.absoluteTtlMs);
    assert.equal(clamped.evictionSweepLimit, defaults.evictionSweepLimit);
  });
});
