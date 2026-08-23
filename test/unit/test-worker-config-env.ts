import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { getConfig } from '../../src/infrastructure/config.js';

describe('Worker configuration environment', () => {
  it('keeps Code Mode disabled by default in the split Worker configs', () => {
    const parseConfig = (path: string) =>
      JSON.parse(
        readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|\s)\/\/.*$/gm, '$1')
          .replace(/,\s*([}\]])/g, '$1'),
      ) as { vars: Record<string, string>; worker_loaders?: unknown };
    const edge = parseConfig('wrangler.edge.jsonc');
    const mcp = parseConfig('wrangler.mcp.jsonc');

    assert.equal(edge.vars.CODEMODE_ENABLED, 'false');
    assert.equal(mcp.vars.CODEMODE_ENABLED, 'false');
    assert.equal(edge.worker_loaders, undefined);
    assert.equal(mcp.worker_loaders, undefined);
    assert.equal(mcp.routes, undefined);
  });

  it('uses the explicit Worker API key without mutating process.env', () => {
    const originalApiKey = process.env.COURTLISTENER_API_KEY;
    delete process.env.COURTLISTENER_API_KEY;

    try {
      const config = getConfig({ COURTLISTENER_API_KEY: 'worker-secret' });

      assert.equal(config.courtListener.apiKey, 'worker-secret');
      assert.equal(process.env.COURTLISTENER_API_KEY, undefined);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.COURTLISTENER_API_KEY;
      } else {
        process.env.COURTLISTENER_API_KEY = originalApiKey;
      }
    }
  });

  it('resolves non-secret Worker configuration from the explicit environment', () => {
    const config = getConfig({
      CACHE_ENABLED: 'false',
      CACHE_TTL: '42',
      LOG_LEVEL: 'debug',
      MCP_REQUIRE_PROTOCOL_VERSION: 'true',
    });

    assert.equal(config.cache.enabled, false);
    assert.equal(config.cache.ttl, 42);
    assert.equal(config.logging.level, 'debug');
  });

  it('does not inherit a host API key when the Worker binding is absent', () => {
    const originalApiKey = process.env.COURTLISTENER_API_KEY;
    process.env.COURTLISTENER_API_KEY = 'host-only-secret';

    try {
      const config = getConfig({});

      assert.equal(config.courtListener.apiKey, undefined);
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.COURTLISTENER_API_KEY;
      } else {
        process.env.COURTLISTENER_API_KEY = originalApiKey;
      }
    }
  });
});
