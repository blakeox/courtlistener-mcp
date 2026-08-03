#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateSessionTopologyEnvironment } from '../../src/infrastructure/session-topology-config.js';

describe('session topology config validation', () => {
  it('accepts empty env and leaves defaults untouched', () => {
    const report = validateSessionTopologyEnvironment({});
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.warnings, []);
  });

  it('rejects non-positive session TTL values', () => {
    const report = validateSessionTopologyEnvironment({
      MCP_SESSION_IDLE_TTL_SECONDS: '0',
      MCP_SESSION_ABSOLUTE_TTL_SECONDS: '-5',
    });

    assert.ok(report.errors.some((error) => error.includes('MCP_SESSION_IDLE_TTL_SECONDS')));
    assert.ok(report.errors.some((error) => error.includes('MCP_SESSION_ABSOLUTE_TTL_SECONDS')));
  });

  it('requires absolute TTL to exceed idle TTL when both are configured', () => {
    const report = validateSessionTopologyEnvironment({
      MCP_SESSION_IDLE_TTL_SECONDS: '3600',
      MCP_SESSION_ABSOLUTE_TTL_SECONDS: '1800',
    });

    assert.ok(
      report.errors.some((error) =>
        error.includes('must be greater than MCP_SESSION_IDLE_TTL_SECONDS'),
      ),
    );
  });

  it('accepts consistent explicit session topology values', () => {
    const report = validateSessionTopologyEnvironment({
      MCP_SESSION_SHARD_COUNT: '16',
      MCP_SESSION_IDLE_TTL_SECONDS: '1800',
      MCP_SESSION_ABSOLUTE_TTL_SECONDS: '86400',
      MCP_SESSION_EVICTION_SWEEP_LIMIT: '64',
    });

    assert.deepEqual(report.errors, []);
  });
});
