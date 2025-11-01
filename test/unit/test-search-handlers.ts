#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Search Handlers (TypeScript)
 * Tests search handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';
import type { CacheManager } from '../../src/infrastructure/cache.js';

const { SearchCasesHandler, AdvancedSearchHandler, SearchOpinionsHandler } = await import(
  '../../dist/domains/search/handlers.js'
);
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'error', format: 'json', enabled: false }, 'Silent');
  }

  child(): SilentLogger {
    return new SilentLogger();
  }
}

interface StubCache extends Partial<CacheManager> {
  store: Map<string, unknown>;
  get(key: string, input: Record<string, unknown>): unknown;
  set(key: string, input: Record<string, unknown>, value: unknown): void;
}

class StubCacheImpl implements StubCache {
  store = new Map<string, unknown>();

  get(key: string, input: Record<string, unknown>): unknown {
    return this.store.get(JSON.stringify([key, input]));
  }

  set(key: string, input: Record<string, unknown>, value: unknown): void {
    this.store.set(JSON.stringify([key, input]), value);
  }
}

interface ExtendedToolContext extends ToolContext {
  cache?: StubCache;
}

function makeContext(overrides: Partial<ExtendedToolContext> = {}): ExtendedToolContext {
  return {
    logger: new SilentLogger().child('Test'),
    requestId: 'req-1',
    ...overrides,
  };
}

describe('SearchCasesHandler (TypeScript)', () => {
  it('normalizes query aliases and validates', () => {
    const handler = new SearchCasesHandler({});
    const result = handler.validate({ q: 'test', pageSize: '5' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.deepStrictEqual(result.data.query, 'test');
      assert.strictEqual(result.data.page_size, 5);
    }
  });

  it('fails validation on invalid page number', () => {
    const handler = new SearchCasesHandler({});
    const result = handler.validate({ page: 0 });

    assert.strictEqual(result.success, false);
    assert.ok(result.error instanceof Error);
  });

  it('executes search and returns success payload', async () => {
    const api = {
      async searchCases(params: { q: string; page?: number; page_size?: number }): Promise<{
        count: number;
        results: Array<{ id: number }>;
      }> {
        assert.strictEqual(params.q, 'rockets');
        return { count: 2, results: [{ id: 1 }, { id: 2 }] };
      },
    };

    const handler = new SearchCasesHandler(api);
    const validated = handler.validate({ q: 'rockets', page: 1, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const res = await handler.execute(validated.data, makeContext());
      assert.strictEqual(res.isError, undefined);
      const payload = JSON.parse(res.content[0].text) as {
        summary: string;
        pagination: { totalPages?: number };
      };
      assert.ok(payload.summary.includes('Found') || payload.summary.includes('cases'));
      if (payload.pagination) {
        assert.ok(typeof payload.pagination.totalPages === 'number');
      }
    }
  });

  it('returns error result when API throws', async () => {
    const api = {
      async searchCases(): Promise<never> {
        throw new Error('API down');
      },
    };

    const handler = new SearchCasesHandler(api);
    const validated = handler.validate({ q: 'fail' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string; details?: { message?: string } };
      assert.ok(payload.error.includes('Failed to search') || payload.error.includes('API down'));
      if (payload.details?.message) {
        assert.ok(payload.details.message.includes('API down'));
      }
    }
  });
});

describe('AdvancedSearchHandler (TypeScript)', () => {
  it('validates complex search parameters', () => {
    const handler = new AdvancedSearchHandler({});
    const result = handler.validate({
      query: 'test',
      court: 'supreme',
      date_filed_after: '2020-01-01',
    });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.query, 'test');
      assert.strictEqual(result.data.court, 'supreme');
    }
  });

  it('requires at least one meaningful parameter', () => {
    const handler = new AdvancedSearchHandler({});
    const result = handler.validate({});

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.ok(result.error.message.includes('At least one') || result.error.message.includes('parameter'));
    }
  });

  it('executes advanced search and returns results', async () => {
    const api = {
      async advancedSearch(params: Record<string, unknown>): Promise<{
        count: number;
        results: Array<{ id: number }>;
      }> {
        assert.ok(params.query !== undefined || params.type !== undefined);
        return { count: 5, results: [{ id: 1 }, { id: 2 }] };
      },
    };

    const handler = new AdvancedSearchHandler(api);
    const validated = handler.validate({ query: 'complex' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary?: string;
        total_results?: number;
        results?: Array<{ id: number }>;
      };
      assert.ok(payload.total_results !== undefined || payload.summary !== undefined);
      if (payload.results) {
        assert.ok(Array.isArray(payload.results));
      }
    }
  });
});

describe('SearchOpinionsHandler (TypeScript)', () => {
  it('validates search query and pagination', () => {
    const handler = new SearchOpinionsHandler({});
    const result = handler.validate({ q: 'constitutional', page: 1 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.query, 'constitutional');
      assert.strictEqual(result.data.page, 1);
    }
  });

  it('normalizes fields and executes search', async () => {
    const api = {
      async searchOpinions(params: Record<string, unknown>): Promise<{
        count: number;
        results: Array<{ id: number }>;
      }> {
        assert.strictEqual(params.order_by, 'date');
        return { count: 1, results: [{ id: 42 }] };
      },
    };

    const handler = new SearchOpinionsHandler(api);
    const validated = handler.validate({ query: 'test', orderBy: 'date', pageSize: 5 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        pagination: { totalCount?: number };
        search_parameters: { order_by?: string };
      };
      assert.strictEqual(payload.pagination.totalCount, 1);
      assert.strictEqual(payload.search_parameters.order_by, 'date');
    }
  });

  it('returns error when search fails', async () => {
    const api = {
      async searchOpinions(): Promise<never> {
        throw new Error('Search unavailable');
      },
    };

    const handler = new SearchOpinionsHandler(api);
    const validated = handler.validate({ query: 'broken' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string };
      assert.strictEqual(payload.error, 'Failed to search opinions');
    }
  });
});

