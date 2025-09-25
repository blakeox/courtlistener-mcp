#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  GetOpinionTextHandler,
  AnalyzeLegalArgumentHandler,
  GetCitationNetworkHandler,
  LookupCitationHandler
} = await import('../../dist/domains/opinions/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'OpinionsTest') {
    super({ level: 'debug', format: 'json', enabled: false }, component);
  }

  child(component) {
    return new SilentLogger(component);
  }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'opinions-req',
    ...overrides
  };
}

describe('GetOpinionTextHandler', () => {
  it('normalizes identifiers and applies default format', () => {
    const handler = new GetOpinionTextHandler({});
    const result = handler.validate({ opinion_id: 101 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.opinion_id, '101');
    assert.strictEqual(result.data.format, 'text');
  });

  it('rejects invalid identifiers', () => {
    const handler = new GetOpinionTextHandler({});
    const result = handler.validate({ opinion_id: -5 });
    assert.strictEqual(result.success, false);
    assert.match(result.error.message, /Number must be greater than 0/);
  });

  it('returns opinion payload from API response', async () => {
    const api = {
      async getOpinionText(params) {
        assert.deepStrictEqual(params, { opinionId: 'A-12', format: 'html' });
        return { id: 'A-12', html: '<p>Opinion</p>' };
      }
    };

    const handler = new GetOpinionTextHandler(api);
    const validated = handler.validate({ opinion_id: 'A-12', format: 'html' });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved html text for opinion A-12');
    assert.strictEqual(payload.opinion.id, 'A-12');
  });

  it('returns error payload when API call fails', async () => {
    const api = {
      async getOpinionText() {
        throw new Error('Opinion unavailable');
      }
    };

    const handler = new GetOpinionTextHandler(api);
    const validated = handler.validate({ opinion_id: 'fail' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Opinion unavailable');
    assert.strictEqual(payload.details.opinionId, 'fail');
  });
});

describe('AnalyzeLegalArgumentHandler', () => {
  it('requires argument and search_query inputs', () => {
    const handler = new AnalyzeLegalArgumentHandler({});
    const result = handler.validate({ argument: 'standing', search_query: 'standing doctrine' });
    assert.strictEqual(result.success, true);
  });

  it('rejects missing required fields', () => {
    const handler = new AnalyzeLegalArgumentHandler({});
    const result = handler.validate({ argument: 'standing' });
    assert.strictEqual(result.success, false);
    assert.match(result.error.message, /search_query/);
  });

  it('returns analysis object from API response', async () => {
    const api = {
      async analyzeLegalArgument(input) {
        assert.strictEqual(input.argument, 'strict scrutiny');
        return { analysis: { top_cases: ['Case A', 'Case B'] } };
      }
    };

    const handler = new AnalyzeLegalArgumentHandler(api);
    const validated = handler.validate({ argument: 'strict scrutiny', search_query: 'equal protection' });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(payload.analysis.top_cases, ['Case A', 'Case B']);
  });

  it('returns error payload when analysis fails', async () => {
    const api = {
      async analyzeLegalArgument() {
        throw new Error('Analysis timeout');
      }
    };

    const handler = new AnalyzeLegalArgumentHandler(api);
    const validated = handler.validate({ argument: 'test', search_query: 'query' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Analysis timeout');
  });
});

describe('GetCitationNetworkHandler', () => {
  it('normalizes input and applies defaults', () => {
    const handler = new GetCitationNetworkHandler({});
    const result = handler.validate({ opinion_id: 12 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.opinion_id, '12');
    assert.strictEqual(result.data.depth, 2);
    assert.strictEqual(result.data.direction, 'both');
    assert.strictEqual(result.data.limit, 50);
  });

  it('returns citation network payload', async () => {
    const api = {
      async getCitationNetwork(opinionId, options) {
        assert.strictEqual(opinionId, 123);
        assert.deepStrictEqual(options, { depth: 3, direction: 'cited_by', limit: 10 });
        return { nodes: [1, 2, 3], edges: [] };
      }
    };

    const handler = new GetCitationNetworkHandler(api);
    const validated = handler.validate({ opinion_id: '123', depth: 3, direction: 'cited_by', limit: 10 });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved citation network for opinion 123');
    assert.deepStrictEqual(payload.network.nodes, [1, 2, 3]);
  });

  it('returns error payload when network fetch fails', async () => {
    const api = {
      async getCitationNetwork() {
        throw new Error('Network unavailable');
      }
    };

    const handler = new GetCitationNetworkHandler(api);
    const validated = handler.validate({ opinion_id: 'fail' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Network unavailable');
    assert.strictEqual(payload.details.opinionId, 'fail');
  });
});

describe('LookupCitationHandler', () => {
  it('validates citation and defaults', () => {
    const handler = new LookupCitationHandler({});
    const result = handler.validate({ citation: '410 U.S. 113' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.normalize, true);
    assert.strictEqual(result.data.include_alternatives, false);
  });

  it('rejects missing citation', () => {
    const handler = new LookupCitationHandler({});
    const result = handler.validate({ citation: '' });
    assert.strictEqual(result.success, false);
    assert.match(result.error.message, /String must contain at least 1 character/);
  });

  it('returns citation search results', async () => {
    const api = {
      async searchCitations(citation) {
        assert.strictEqual(citation, '123 F.3d 456');
        return [{ id: 1 }];
      }
    };

    const handler = new LookupCitationHandler(api);
    const validated = handler.validate({ citation: '123 F.3d 456', include_alternatives: true });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Found cases for citation: 123 F.3d 456');
    assert.deepStrictEqual(payload.results, [{ id: 1 }]);
  });

  it('returns error payload when citation lookup fails', async () => {
    const api = {
      async searchCitations() {
        throw new Error('Lookup failed');
      }
    };

    const handler = new LookupCitationHandler(api);
    const validated = handler.validate({ citation: 'bad cite' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Lookup failed');
    assert.strictEqual(payload.details.citation, 'bad cite');
  });
});
