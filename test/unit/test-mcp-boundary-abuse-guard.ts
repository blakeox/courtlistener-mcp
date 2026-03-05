import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMcpReplayFingerprint,
  deriveAdaptiveBoundaryRateLimit,
  getMcpBoundaryGuardConfig,
  getRequestContentLength,
} from '../../src/server/mcp-boundary-abuse-guard.js';

describe('mcp-boundary-abuse-guard', () => {
  it('parses defaults when env values are missing', () => {
    const cfg = getMcpBoundaryGuardConfig({});
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.maxAttempts, 90);
    assert.equal(cfg.maxPayloadBytes, 256 * 1024);
  });

  it('derives stricter adaptive limits for heavy payload requests', () => {
    const request = new Request('https://example.com/mcp', { method: 'POST' });
    const maxAttempts = deriveAdaptiveBoundaryRateLimit(
      request,
      { maxAttempts: 100, heavyPayloadBytes: 1024 },
      4096,
    );
    assert.equal(maxAttempts, 50);
  });

  it('builds replay fingerprint from idempotency headers', async () => {
    const request = new Request('https://example.com/mcp', {
      method: 'POST',
      headers: {
        'mcp-session-id': 'session-1',
        'mcp-request-id': 'request-1',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    const fingerprint = await buildMcpReplayFingerprint(request, getRequestContentLength(request), 64 * 1024);
    assert.equal(fingerprint, 'POST|session-1|id:request-1');
  });

  it('falls back to json-rpc tuple when no request id headers are present', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/call' });
    const request = new Request('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const fingerprint = await buildMcpReplayFingerprint(request, getRequestContentLength(request), 64 * 1024);
    assert.equal(fingerprint, 'POST|-|rpc:tools/call|id:42');
  });
});
