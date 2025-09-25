#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  GetDocketsHandler,
  GetDocketHandler,
  GetRecapDocumentsHandler,
  GetRecapDocumentHandler,
  GetDocketEntriesHandler
} = await import('../../dist/domains/dockets/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'DocketsTest') {
    super({ level: 'debug', format: 'json', enabled: false }, component);
  }

  child(component) {
    return new SilentLogger(component);
  }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'dockets-req',
    ...overrides
  };
}

describe('GetDocketsHandler', () => {
  it('applies defaults and validates optional filters', () => {
    const handler = new GetDocketsHandler({});
    const result = handler.validate({ court: 'supreme' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.page, 1);
    assert.strictEqual(result.data.page_size, 20);
    assert.strictEqual(result.data.court, 'supreme');
  });

  it('rejects invalid pagination values', () => {
    const handler = new GetDocketsHandler({});
    const result = handler.validate({ page: 0 });
    assert.strictEqual(result.success, false);
    assert.match(result.error.message, /Number must be greater than or equal to 1/);
  });

  it('returns dockets payload with pagination metadata', async () => {
    const api = {
      async getDockets(params) {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 35, results: [{ id: 'd1' }, { id: 'd2' }] };
      }
    };

    const handler = new GetDocketsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved 2 dockets');
    assert.deepStrictEqual(payload.dockets, [{ id: 'd1' }, { id: 'd2' }]);
    assert.strictEqual(payload.pagination.total_pages, 4);
  });

  it('returns error payload when API fails', async () => {
    const api = {
      async getDockets() {
        throw new Error('Dockets service unavailable');
      }
    };

    const handler = new GetDocketsHandler(api);
    const validated = handler.validate({});
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Dockets service unavailable');
  });
});

describe('GetDocketHandler', () => {
  it('normalizes identifiers and default flags', () => {
    const handler = new GetDocketHandler({});
    const result = handler.validate({ docket_id: 42 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.docket_id, '42');
    assert.strictEqual(result.data.include_entries, true);
  });

  it('returns docket details on success', async () => {
    const api = {
      async getDocket(id) {
        assert.strictEqual(id, 'A-100');
        return { id, case_name: 'Example' };
      }
    };

    const handler = new GetDocketHandler(api);
    const validated = handler.validate({ docket_id: 'A-100' });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved details for docket A-100');
    assert.strictEqual(payload.docket.case_name, 'Example');
  });

  it('returns error payload when lookup fails', async () => {
    const api = {
      async getDocket() {
        throw new Error('Docket not found');
      }
    };

    const handler = new GetDocketHandler(api);
    const validated = handler.validate({ docket_id: 'missing' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Docket not found');
    assert.strictEqual(payload.details.docketId, 'missing');
  });
});

describe('GetRecapDocumentsHandler', () => {
  it('applies pagination defaults and normalizes ids', () => {
    const handler = new GetRecapDocumentsHandler({});
    const result = handler.validate({ docket_id: 5 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.docket_id, '5');
    assert.strictEqual(result.data.page, 1);
    assert.strictEqual(result.data.page_size, 20);
  });

  it('returns RECAP documents with pagination info', async () => {
    const api = {
      async getRECAPDocuments(params) {
        assert.strictEqual(params.docket_id, 'abc');
        return { count: 12, results: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      }
    };

    const handler = new GetRecapDocumentsHandler(api);
    const validated = handler.validate({ docket_id: 'abc', page: 2, page_size: 3 });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved 3 RECAP documents for docket abc');
    assert.strictEqual(payload.pagination.total_pages, 4);
    assert.strictEqual(payload.pagination.page, 2);
  });

  it('returns error payload when RECAP lookup fails', async () => {
    const api = {
      async getRECAPDocuments() {
        throw new Error('RECAP offline');
      }
    };

    const handler = new GetRecapDocumentsHandler(api);
    const validated = handler.validate({ docket_id: 'abc' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'RECAP offline');
  });
});

describe('GetRecapDocumentHandler', () => {
  it('normalizes identifiers and defaults', () => {
    const handler = new GetRecapDocumentHandler({});
    const result = handler.validate({ document_id: 7 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.document_id, '7');
    assert.strictEqual(result.data.include_content, false);
  });

  it('returns RECAP document details', async () => {
    const api = {
      async getRECAPDocument(id) {
        assert.strictEqual(id, 'recap-1');
        return { id, title: 'Docket Entry' };
      }
    };

    const handler = new GetRecapDocumentHandler(api);
    const validated = handler.validate({ document_id: 'recap-1' });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved RECAP document recap-1');
    assert.strictEqual(payload.document.title, 'Docket Entry');
  });

  it('returns error payload when document lookup fails', async () => {
    const api = {
      async getRECAPDocument() {
        throw new Error('Document missing');
      }
    };

    const handler = new GetRecapDocumentHandler(api);
    const validated = handler.validate({ document_id: 'missing' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Document missing');
    assert.strictEqual(payload.details.documentId, 'missing');
  });
});

describe('GetDocketEntriesHandler', () => {
  it('validates and normalizes parameters', () => {
    const handler = new GetDocketEntriesHandler({});
    const result = handler.validate({ docket: 9, page_size: 5 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.docket, '9');
    assert.strictEqual(result.data.page, 1);
    assert.strictEqual(result.data.page_size, 5);
  });

  it('returns cached docket entries when available', async () => {
    const cachedResult = {
      docket_id: '99',
      docket_entries: { count: 2, results: [{ id: 'a' }, { id: 'b' }] },
      pagination: { page: 1, page_size: 20, total_results: 2 }
    };

    const cache = {
      get(key, params) {
        assert.strictEqual(key, 'docket_entries');
        assert.deepStrictEqual(params, {
          docket: '99',
          entry_number: undefined,
          date_filed_after: undefined,
          date_filed_before: undefined,
          page: 1,
          page_size: 20
        });
        return cachedResult;
      },
      set() {
        assert.fail('Should not set cache when hit is available');
      }
    };

    const metricsCalls = [];
    const context = makeContext({
      cache,
      metrics: {
        recordRequest(duration, fromCache) {
          metricsCalls.push({ duration, fromCache });
        },
        recordFailure() {
          assert.fail('recordFailure should not be called for cache hit');
        }
      }
    });

    const handler = new GetDocketEntriesHandler({
      async getDocketEntries() {
        assert.fail('Should not call API when cache hit');
      }
    });

    const validated = handler.validate({ docket: '99' });
    const result = await handler.execute(validated.data, context);
    const payload = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(payload, cachedResult);
    assert.strictEqual(metricsCalls.length, 1);
    assert.strictEqual(metricsCalls[0].fromCache, true);
    assert.strictEqual(typeof metricsCalls[0].duration, 'number');
  });

  it('fetches entries and caches result when not cached', async () => {
    const cache = {
      stored: null,
      get() {
        return undefined;
      },
      set(key, params, value, ttl) {
        this.stored = { key, params, value, ttl };
      }
    };

    const metricsCalls = [];
    const handler = new GetDocketEntriesHandler({
      async getDocketEntries(params) {
        return { count: 5, results: [{ id: 'entry' }], params };
      }
    });

    const context = makeContext({
      cache,
      metrics: {
        recordRequest(duration, fromCache) {
          metricsCalls.push({ duration, fromCache });
        },
        recordFailure() {
          assert.fail('recordFailure should not be called on success');
        }
      }
    });

    const validated = handler.validate({ docket: '123', page: 2, page_size: 10 });
    const result = await handler.execute(validated.data, context);
    const payload = JSON.parse(result.content[0].text);

    assert.strictEqual(payload.docket_id, '123');
    assert.strictEqual(payload.pagination.total_results, 5);
    assert.strictEqual(metricsCalls[0].fromCache, false);
    assert.strictEqual(cache.stored.ttl, 1800);
    assert.deepStrictEqual(cache.stored.params.docket, '123');
  });

  it('returns error payload and records failure when API throws', async () => {
    const metrics = {
      failureCalls: 0,
      lastDuration: null,
      recordRequest() {
        assert.fail('recordRequest should not be called on failure');
      },
      recordFailure(duration) {
        this.failureCalls++;
        this.lastDuration = duration;
      }
    };

    const handler = new GetDocketEntriesHandler({
      async getDocketEntries() {
        throw new Error('Entries unavailable');
      }
    });

    const context = makeContext({ metrics });
    const validated = handler.validate({ docket: 'fail' });
    const result = await handler.execute(validated.data, context);

    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Failed to retrieve docket entries');
    assert.match(payload.details.message, /Entries unavailable/);
    assert.strictEqual(metrics.failureCalls, 1);
    assert.strictEqual(typeof metrics.lastDuration, 'number');
  });
});
