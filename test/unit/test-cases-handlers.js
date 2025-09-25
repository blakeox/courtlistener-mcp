#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  GetCaseDetailsHandler,
  GetRelatedCasesHandler,
  AnalyzeCaseAuthoritiesHandler
} = await import('../../dist/domains/cases/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() { super({ level: 'silent' }); }
  child() { return new SilentLogger(); }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('CasesTest'),
    requestId: 'cases-req',
    ...overrides
  };
}

describe('GetCaseDetailsHandler', () => {
  it('validates and normalizes cluster_id input', () => {
    const handler = new GetCaseDetailsHandler({});
    const res = handler.validate({ cluster_id: '123' });
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { cluster_id: '123' });
  });

  it('rejects non-positive cluster IDs', () => {
    const handler = new GetCaseDetailsHandler({});
    const res = handler.validate({ cluster_id: -5 });
    assert.strictEqual(res.success, false);
    assert.match(res.error.message, /cluster_id must be a positive integer/);
  });

  it('executes successfully and returns summary', async () => {
    const api = {
      async getCaseDetails({ clusterId }) {
        assert.strictEqual(clusterId, 456);
        return { id: 456, name: 'Demo v. Example' };
      }
    };
    const handler = new GetCaseDetailsHandler(api);
    const validated = handler.validate({ cluster_id: 456 });
    assert.strictEqual(validated.success, true);
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved details for case 456');
    assert.strictEqual(payload.case.id, 456);
  });

  it('returns error result when API fails', async () => {
    const api = {
      async getCaseDetails() {
        throw new Error('Case not found');
      }
    };
    const handler = new GetCaseDetailsHandler(api);
    const validated = handler.validate({ cluster_id: 1 });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Case not found');
  });
});

describe('GetRelatedCasesHandler', () => {
  it('requires an identifier', () => {
    const handler = new GetRelatedCasesHandler({});
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
    assert.match(res.error.message, /opinion_id or cluster_id is required/);
  });

  it('normalizes numeric identifiers and honors limit', async () => {
    const api = {
      async getRelatedCases(opinionId) {
        assert.strictEqual(opinionId, 999);
        return Array.from({ length: 5 }, (_, i) => ({ id: i }));
      }
    };
    const handler = new GetRelatedCasesHandler(api);
    const validated = handler.validate({ opinion_id: '999', limit: 3 });
    assert.strictEqual(validated.success, true);
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.relatedCases.length, 3);
  });

  it('returns error result when API throws', async () => {
    const api = {
      async getRelatedCases() {
        throw new Error('Service unavailable');
      }
    };
    const handler = new GetRelatedCasesHandler(api);
    const validated = handler.validate({ cluster_id: 10 });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.match(payload.error, /Service unavailable/);
  });
});

describe('AnalyzeCaseAuthoritiesHandler', () => {
  it('validates default options', () => {
    const handler = new AnalyzeCaseAuthoritiesHandler({});
    const res = handler.validate({ case_id: 5 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.depth, 1);
    assert.strictEqual(res.data.include_citations, true);
  });

  it('executes and returns analysis payload', async () => {
    const api = {
      async analyzeCaseAuthorities(input) {
        assert.strictEqual(input.case_id, '123');
        assert.strictEqual(input.depth, 2);
        return { authorities: ['A v. B'] };
      }
    };
    const handler = new AnalyzeCaseAuthoritiesHandler(api);
    const validated = handler.validate({ case_id: '123', depth: 2, include_citations: false });
    assert.strictEqual(validated.success, true);
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.analysis.authorities[0], 'A v. B');
  });

  it('returns error payload on failure', async () => {
    const api = {
      async analyzeCaseAuthorities() {
        throw new Error('Analysis timeout');
      }
    };
    const handler = new AnalyzeCaseAuthoritiesHandler(api);
    const validated = handler.validate({ case_id: 7 });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Analysis timeout');
  });
});
