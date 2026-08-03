#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getStartupDiagnostics } from '../../src/infrastructure/config.js';

describe('startup diagnostics session topology', () => {
  it('surfaces invalid MCP session TTL configuration in startup invariants', () => {
    const previousIdle = process.env.MCP_SESSION_IDLE_TTL_SECONDS;
    const previousAbsolute = process.env.MCP_SESSION_ABSOLUTE_TTL_SECONDS;

    process.env.MCP_SESSION_IDLE_TTL_SECONDS = '7200';
    process.env.MCP_SESSION_ABSOLUTE_TTL_SECONDS = '3600';

    try {
      const diagnostics = getStartupDiagnostics();
      assert.equal(diagnostics.status, 'error');
      assert.ok(
        diagnostics.invariants.errors.some((error) =>
          error.includes('must be greater than MCP_SESSION_IDLE_TTL_SECONDS'),
        ),
      );
    } finally {
      if (previousIdle === undefined) {
        delete process.env.MCP_SESSION_IDLE_TTL_SECONDS;
      } else {
        process.env.MCP_SESSION_IDLE_TTL_SECONDS = previousIdle;
      }

      if (previousAbsolute === undefined) {
        delete process.env.MCP_SESSION_ABSOLUTE_TTL_SECONDS;
      } else {
        process.env.MCP_SESSION_ABSOLUTE_TTL_SECONDS = previousAbsolute;
      }
    }
  });
});
