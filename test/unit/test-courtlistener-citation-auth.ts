import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CourtListenerAPI } from '../../src/courtlistener.js';
import type { CacheManager } from '../../src/infrastructure/cache.js';
import type { Logger } from '../../src/infrastructure/logger.js';
import type { MetricsCollector } from '../../src/infrastructure/metrics.js';

function createNoopLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startTimer: () => ({ end: () => 0, endWithError: () => 0 }),
    apiCall: () => {},
    toolExecution: () => {},
    child: () => createNoopLogger(),
  } as Logger;
}

function createNoopMetrics(): MetricsCollector {
  return {
    recordRequest: () => {},
    recordFailure: () => {},
    recordLatencyMetric: () => {},
    recordCostGuardrail: () => {},
  } as MetricsCollector;
}

function createDisabledCache(): CacheManager {
  return {
    isEnabled: () => false,
    get: () => null,
    set: () => {},
  } as CacheManager;
}

describe('CourtListener citation-lookup auth', () => {
  it('POSTs citation text with Token authorization', async () => {
    let observedMethod = '';
    let observedAuth = '';
    let observedBody = '';

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      observedMethod = req.method ?? '';
      observedAuth = String(req.headers.authorization ?? '');
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        observedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ citation: '410 U.S. 113', clusters: [] }]));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind citation mock server');
    }

    const api = new CourtListenerAPI(
      {
        baseUrl: `http://127.0.0.1:${address.port}`,
        version: 'v4',
        timeout: 5000,
        retryAttempts: 1,
        rateLimitPerMinute: 100,
        apiKey: 'test-token-abc',
      },
      createDisabledCache(),
      createNoopLogger(),
      createNoopMetrics(),
    );

    const result = await api.lookupCitation({ citation: '410 U.S. 113' });
    assert.ok(Array.isArray(result));

    assert.strictEqual(observedMethod, 'POST');
    assert.strictEqual(observedAuth, 'Token test-token-abc');
    assert.ok(
      observedBody.includes('text=410+U.S.+113') || observedBody.includes('text=410%20U.S.%20113'),
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
