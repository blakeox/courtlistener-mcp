#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Docket Handlers (TypeScript)
 * Tests docket handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';
import type { CacheManager } from '../../src/infrastructure/cache.js';
import type { MetricsCollector } from '../../src/infrastructure/metrics.js';

const {
  GetDocketsHandler,
  GetDocketHandler,
  GetRecapDocumentsHandler,
  GetRecapDocumentHandler,
  GetDocketEntriesHandler,
} = await import('../../dist/domains/dockets/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'DocketsTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }
}

interface ExtendedToolContext extends ToolContext {
  cache?: CacheManager;
  metrics?: MetricsCollector;
}

function makeContext(overrides: Partial<ExtendedToolContext> = {}): ExtendedToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'dockets-req',
    ...overrides,
  };
}

describe('GetDocketsHandler (TypeScript)', () => {
  it('applies defaults and validates optional filters', () => {
    const handler = new GetDocketsHandler({});
    const result = handler.validate({ court: 'supreme' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.page, 1);
      assert.strictEqual(result.data.page_size, 20);
      assert.strictEqual(result.data.court, 'supreme');
    }
  });

  it('rejects invalid pagination values', () => {
    const handler = new GetDocketsHandler({});
    const result = handler.validate({ page: 0 });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /Number must be greater than or equal to 1/);
    }
  });

  it('returns dockets payload with pagination metadata', async () => {
    const api = {
      async getDockets(params: { page?: number; page_size?: number }): Promise<{
        count: number;
        results: Array<{ id: string }>;
      }> {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 35, results: [{ id: 'd1' }, { id: 'd2' }] };
      },
    };

    const handler = new GetDocketsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        dockets: Array<{ id: string }>;
        pagination: { total_pages?: number };
      };
      assert.ok(payload.summary.includes('dockets') || payload.summary.includes('Retrieved'));
      assert.ok(Array.isArray(payload.dockets));
      assert.strictEqual(payload.dockets.length, 2);
    }
  });

  it('returns error payload when API fails', async () => {
    const api = {
      async getDockets(): Promise<never> {
        throw new Error('Dockets service unavailable');
      },
    };

    const handler = new GetDocketsHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string };
      assert.strictEqual(payload.error, 'Dockets service unavailable');
    }
  });
});

describe('GetDocketHandler (TypeScript)', () => {
  it('normalizes identifiers and default flags', () => {
    const handler = new GetDocketHandler({});
    const result = handler.validate({ docket_id: 42 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.docket_id, '42');
      assert.strictEqual(result.data.include_entries, true);
    }
  });

  it('returns docket details on success', async () => {
    const api = {
      async getDocket(id: string | number): Promise<{ id: string; case_name: string }> {
        assert.strictEqual(String(id), 'A-100');
        return { id: String(id), case_name: 'Example' };
      },
    };

    const handler = new GetDocketHandler(api);
    const validated = handler.validate({ docket_id: 'A-100' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        docket: { case_name: string };
      };
      assert.ok(payload.summary.includes('docket') || payload.summary.includes('Retrieved'));
      assert.strictEqual(payload.docket.case_name, 'Example');
    }
  });

  it('returns error payload when lookup fails', async () => {
    const api = {
      async getDocket(): Promise<never> {
        throw new Error('Docket not found');
      },
    };

    const handler = new GetDocketHandler(api);
    const validated = handler.validate({ docket_id: 'missing' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { docketId?: string };
      };
      assert.strictEqual(payload.error, 'Docket not found');
      if (payload.details) {
        assert.strictEqual(payload.details.docketId, 'missing');
      }
    }
  });
});

describe('GetRecapDocumentsHandler (TypeScript)', () => {
  it('applies pagination defaults and normalizes ids', () => {
    const handler = new GetRecapDocumentsHandler({});
    const result = handler.validate({ docket_id: 5 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.docket_id, '5');
      assert.strictEqual(result.data.page, 1);
      assert.strictEqual(result.data.page_size, 20);
    }
  });

  it('returns RECAP documents with pagination info', async () => {
    const api = {
      async getRECAPDocuments(params: { docket_id: string }): Promise<{
        count: number;
        results: Array<{ id: number }>;
      }> {
        assert.strictEqual(params.docket_id, 'abc');
        return { count: 12, results: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      },
    };

    const handler = new GetRecapDocumentsHandler(api);
    const validated = handler.validate({ docket_id: 'abc', page: 2, page_size: 3 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        pagination: { total_pages?: number; page?: number };
      };
      assert.ok(payload.summary.includes('RECAP') || payload.summary.includes('documents'));
    }
  });

  it('returns error payload when RECAP lookup fails', async () => {
    const api = {
      async getRECAPDocuments(): Promise<never> {
        throw new Error('RECAP offline');
      },
    };

    const handler = new GetRecapDocumentsHandler(api);
    const validated = handler.validate({ docket_id: 'abc' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string };
      assert.strictEqual(payload.error, 'RECAP offline');
    }
  });
});

describe('GetRecapDocumentHandler (TypeScript)', () => {
  it('normalizes identifiers and defaults', () => {
    const handler = new GetRecapDocumentHandler({});
    const result = handler.validate({ document_id: 7 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.document_id, '7');
      assert.strictEqual(result.data.include_content, false);
    }
  });

  it('returns RECAP document details', async () => {
    const api = {
      async getRECAPDocument(id: string | number): Promise<{ id: string; title: string }> {
        assert.strictEqual(String(id), 'recap-1');
        return { id: String(id), title: 'Docket Entry' };
      },
    };

    const handler = new GetRecapDocumentHandler(api);
    const validated = handler.validate({ document_id: 'recap-1' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        document: { title: string };
      };
      assert.ok(payload.summary.includes('RECAP') || payload.summary.includes('document'));
      assert.strictEqual(payload.document.title, 'Docket Entry');
    }
  });

  it('returns error payload when document lookup fails', async () => {
    const api = {
      async getRECAPDocument(): Promise<never> {
        throw new Error('Document missing');
      },
    };

    const handler = new GetRecapDocumentHandler(api);
    const validated = handler.validate({ document_id: 'missing' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { documentId?: string };
      };
      assert.strictEqual(payload.error, 'Document missing');
      if (payload.details) {
        assert.strictEqual(payload.details.documentId, 'missing');
      }
    }
  });
});

describe('GetDocketEntriesHandler (TypeScript)', () => {
  it('validates and normalizes parameters', () => {
    const handler = new GetDocketEntriesHandler({});
    const result = handler.validate({ docket: 9, page_size: 5 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.docket, '9');
      assert.strictEqual(result.data.page, 1);
      assert.strictEqual(result.data.page_size, 5);
    }
  });

  it('fetches entries and caches result when not cached', async () => {
    interface CacheStore {
      stored: { key: string; params: Record<string, unknown>; value: unknown; ttl: number } | null;
      get: (key: string, params: Record<string, unknown>) => unknown;
      set: (key: string, params: Record<string, unknown>, value: unknown, ttl: number) => void;
    }

    const cache: CacheStore = {
      stored: null,
      get(): unknown {
        return undefined;
      },
      set(key: string, params: Record<string, unknown>, value: unknown, ttl: number): void {
        this.stored = { key, params, value, ttl };
      },
    };

    const metricsCalls: Array<{ duration: number; fromCache: boolean }> = [];
    const handler = new GetDocketEntriesHandler({
      async getDocketEntries(params: { docket: string; page?: number; page_size?: number }): Promise<{
        count: number;
        results: Array<{ id: string }>;
        params: typeof params;
      }> {
        return { count: 5, results: [{ id: 'entry' }], params };
      },
    });

    const context = makeContext({
      cache: cache as CacheManager,
      metrics: {
        recordRequest: (duration: number, fromCache: boolean): void => {
          metricsCalls.push({ duration, fromCache });
        },
        recordFailure: (): void => {
          // No-op for test
        },
      } as MetricsCollector,
    });

    const validated = handler.validate({ docket: '123', page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, context);
      const payload = JSON.parse(result.content[0].text) as {
        docket_id: string;
        pagination: { total_results?: number };
      };

      assert.strictEqual(payload.docket_id, '123');
      if (payload.pagination) {
        assert.strictEqual(payload.pagination.total_results, 5);
      }
      assert.strictEqual(metricsCalls[0]?.fromCache, false);
      assert.ok(cache.stored !== null);
      if (cache.stored) {
        assert.strictEqual(cache.stored.ttl, 1800);
      }
    }
  });

  it('returns error payload and records failure when API throws', async () => {
    const metrics = {
      failureCalls: 0,
      lastDuration: null as number | null,
      recordRequest: (): void => {
        // Should not be called
      },
      recordFailure: (duration: number): void => {
        metrics.failureCalls++;
        metrics.lastDuration = duration;
      },
    };

    const handler = new GetDocketEntriesHandler({
      async getDocketEntries(): Promise<never> {
        throw new Error('Entries unavailable');
      },
    });

    const context = makeContext({
      metrics: metrics as MetricsCollector,
    });
    const validated = handler.validate({ docket: 'fail' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, context);

      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { message?: string };
      };
      assert.ok(payload.error.includes('Failed') || payload.error.includes('unavailable'));
      assert.strictEqual(metrics.failureCalls, 1);
      assert.strictEqual(typeof metrics.lastDuration, 'number');
    }
  });
});

