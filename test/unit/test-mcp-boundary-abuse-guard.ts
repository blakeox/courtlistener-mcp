import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMcpReplayFingerprint,
  deriveAdaptiveBoundaryRateLimit,
  getMcpBoundaryGuardConfig,
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
        'mcp-request-id': 'request-1',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    const fingerprint = await buildMcpReplayFingerprint(request);
    assert.equal(fingerprint, 'POST|id:request-1');
  });

  it('does not fingerprint a stateless JSON-RPC tuple without an explicit request id', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/call' });
    const request = new Request('https://example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body,
    });
    const fingerprint = await buildMcpReplayFingerprint(request);
    assert.equal(fingerprint, null);
  });

  it('does not share stateless replay state across clients in one rate-limit bucket', async () => {
    const request = new Request('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'tools/call' }),
    });

    const fingerprint = await buildMcpReplayFingerprint(request);

    assert.equal(fingerprint, null);
  });

  it('does not classify a stateless request without an explicit request id as replay', async () => {
    const request = new Request('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    const fingerprint = await buildMcpReplayFingerprint(request);

    assert.equal(fingerprint, null);
  });
});
