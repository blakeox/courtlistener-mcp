#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRemoteEndpoints } from '../../scripts/resolve-remote-endpoints.js';

describe('resolve-remote-endpoints', () => {
  it('normalizes a /health URL', () => {
    const result = normalizeRemoteEndpoints('https://example.workers.dev/health');
    assert.equal(result.baseUrl, 'https://example.workers.dev');
    assert.equal(result.healthUrl, 'https://example.workers.dev/health');
    assert.equal(result.mcpUrl, 'https://example.workers.dev/mcp');
  });

  it('normalizes an /mcp URL without duplicating suffixes', () => {
    const result = normalizeRemoteEndpoints('https://example.workers.dev/mcp');
    assert.equal(result.baseUrl, 'https://example.workers.dev');
    assert.equal(result.healthUrl, 'https://example.workers.dev/health');
    assert.equal(result.mcpUrl, 'https://example.workers.dev/mcp');
  });

  it('normalizes an /sse URL to /mcp canonical endpoint', () => {
    const result = normalizeRemoteEndpoints('https://example.workers.dev/sse');
    assert.equal(result.baseUrl, 'https://example.workers.dev');
    assert.equal(result.healthUrl, 'https://example.workers.dev/health');
    assert.equal(result.mcpUrl, 'https://example.workers.dev/mcp');
  });

  it('preserves nested base paths', () => {
    const result = normalizeRemoteEndpoints('https://example.com/legal/health');
    assert.equal(result.baseUrl, 'https://example.com/legal');
    assert.equal(result.healthUrl, 'https://example.com/legal/health');
    assert.equal(result.mcpUrl, 'https://example.com/legal/mcp');
  });

  it('normalizes nested /mcp/health URLs', () => {
    const result = normalizeRemoteEndpoints('https://example.com/legal/mcp/health');
    assert.equal(result.baseUrl, 'https://example.com/legal');
    assert.equal(result.healthUrl, 'https://example.com/legal/health');
    assert.equal(result.mcpUrl, 'https://example.com/legal/mcp');
  });
});
