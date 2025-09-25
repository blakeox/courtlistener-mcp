#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  SearchCasesHandler,
  AdvancedSearchHandler,
  SearchOpinionsHandler
} = await import('../../dist/domains/search/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() { super({ level: 'silent' }); }
  child() { return new SilentLogger(); }
}

class StubCache {
  constructor() {
    this.store = new Map();
  }
  get(key, input) {
    return this.store.get(JSON.stringify([key, input]));
  }
  set(key, input, value) {
    this.store.set(JSON.stringify([key, input]), value);
  }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('Test'),
    requestId: 'req-1',
    cache: overrides.cache,
    ...overrides
  };
}

describe('SearchCasesHandler', () => {
  it('normalizes query aliases and validates', () => {
    const handler = new SearchCasesHandler({});
    const result = handler.validate({ q: 'test', pageSize: '5' });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data.query, 'test');
    assert.strictEqual(result.data.page_size, 5);
  });

  it('fails validation on invalid page number', () => {
    const handler = new SearchCasesHandler({});
    const result = handler.validate({ page: 0 });
    assert.strictEqual(result.success, false);
    assert.ok(result.error instanceof Error);
  });

  it('executes search and returns success payload', async () => {
    const api = {
      async searchCases(params) {
        assert.strictEqual(params.q, 'rockets');
        return { count: 2, results: [{ id: 1 }, { id: 2 }] };
      }
    };
    const handler = new SearchCasesHandler(api);
    const validated = handler.validate({ q: 'rockets', page: 1, page_size: 10 });
    const res = await handler.execute(validated.data, makeContext());
    assert.strictEqual(res.isError, undefined);
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.summary, 'Found 2 cases');
    assert.strictEqual(payload.pagination.totalPages, Math.ceil(2 / 10));
  });

  it('returns error result when API throws', async () => {
    const api = {
      async searchCases() {
        throw new Error('API down');
      }
    };
    const handler = new SearchCasesHandler(api);
    const validated = handler.validate({ q: 'fail' });
    const res = await handler.execute(validated.data, makeContext());
    assert.strictEqual(res.isError, true);
    const payload = JSON.parse(res.content[0].text);
    assert.match(payload.error, /Failed to search cases/);
  });
});

describe('AdvancedSearchHandler', () => {
  it('requires at least one meaningful parameter', () => {
    const handler = new AdvancedSearchHandler({});
    const result = handler.validate({});
    assert.strictEqual(result.success, false);
    assert.ok(/At least one search parameter/.test(result.error.message));
  });

  it('accepts valid input and normalizes defaults', () => {
    const handler = new AdvancedSearchHandler({});
    const result = handler.validate({ query: 'contract law', type: 'o' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.page_size, 20);
  });

  it('uses cache when available', async () => {
    const handler = new AdvancedSearchHandler({
      advancedSearch() {
        throw new Error('Should not call API when cached');
      }
    });
    const cache = new StubCache();
    const input = { query: 'cached', type: 'o' };
    const cachedPayload = { total_results: 5 };
    cache.set('advanced_search', input, cachedPayload);

    const res = await handler.execute(input, makeContext({ cache }));
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.total_results, 5);
  });

  it('performs API call, sets cache, and maps response', async () => {
    let called = false;
    const api = {
      async advancedSearch(params) {
        called = true;
        assert.strictEqual(params.page_size, 15);
        return { count: 3, results: [{ id: 'a' }] };
      }
    };
    const cache = new StubCache();
    const handler = new AdvancedSearchHandler(api);
    const input = { query: 'fresh', type: 'o', page_size: 15 };
    const res = await handler.execute(input, makeContext({ cache }));
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(called, true);
    assert.strictEqual(payload.total_results, 3);
    assert.deepStrictEqual(cache.get('advanced_search', input), payload);
  });
});

describe('SearchOpinionsHandler', () => {
  it('normalizes fields and executes search', async () => {
    const api = {
      async searchOpinions(params) {
        assert.strictEqual(params.order_by, 'date');
        return { count: 1, results: [{ id: 42 }] };
      }
    };
    const handler = new SearchOpinionsHandler(api);
    const validated = handler.validate({ query: 'test', orderBy: 'date', pageSize: 5 });
    assert.strictEqual(validated.success, true);
    const res = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.pagination.totalCount, 1);
    assert.strictEqual(payload.search_parameters.order_by, 'date');
  });

  it('returns error when API fails', async () => {
    const api = {
      async searchOpinions() {
        throw new Error('fail');
      }
    };
    const handler = new SearchOpinionsHandler(api);
    const validated = handler.validate({ query: 'broken' });
    const res = await handler.execute(validated.data, makeContext());
    assert.strictEqual(res.isError, true);
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.error, 'Failed to search opinions');
  });
});
