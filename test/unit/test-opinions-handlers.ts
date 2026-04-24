#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Opinion Handlers (TypeScript)
 * Tests opinion handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';

const {
  GetOpinionTextHandler,
  AnalyzeLegalArgumentHandler,
  GetAuthoritiesHandler,
  GetCitationNetworkHandler,
  GetOpinionCitationsHandler,
  LookupCitationHandler,
} = await import('../../src/domains/opinions/handlers.js');
const { Logger } = await import('../../src/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'OpinionsTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'opinions-req',
    ...overrides,
  };
}

describe('GetOpinionTextHandler (TypeScript)', () => {
  it('normalizes identifiers and applies default format', () => {
    const handler = new GetOpinionTextHandler({});
    const result = handler.validate({ opinion_id: 101 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.opinion_id, '101');
      assert.strictEqual(result.data.format, 'text');
    }
  });

  it('rejects invalid identifiers', () => {
    const handler = new GetOpinionTextHandler({});
    const result = handler.validate({ opinion_id: -5 });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /Too small.*>0|Number must be greater than 0/);
    }
  });

  it('returns opinion payload from API response', async () => {
    const api = {
      async getOpinionText(params: { opinionId: string; format: string }): Promise<{
        id: string;
        html?: string;
        text?: string;
      }> {
        assert.deepStrictEqual(params, { opinionId: 'A-12', format: 'html' });
        return { id: 'A-12', html: '<p>Opinion</p>' };
      },
    };

    const handler = new GetOpinionTextHandler(api);
    const validated = handler.validate({ opinion_id: 'A-12', format: 'html' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        opinion: { id: string };
      };
      assert.ok(
        payload.summary.includes('html') ||
          payload.summary.includes('text') ||
          payload.summary.includes('opinion'),
      );
      assert.strictEqual(payload.opinion.id, 'A-12');
    }
  });

  it('returns error payload when API call fails', async () => {
    const api = {
      async getOpinionText(): Promise<never> {
        throw new Error('Opinion unavailable');
      },
    };

    const handler = new GetOpinionTextHandler(api);
    const validated = handler.validate({ opinion_id: 'fail' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { message?: string; name?: string };
      };
      // withErrorHandling returns 'handler_name failed' as error, original message in details
      assert.strictEqual(payload.error, 'get_opinion_text failed');
      assert.strictEqual(payload.details?.message, 'Opinion unavailable');
    }
  });
});

describe('AnalyzeLegalArgumentHandler (TypeScript)', () => {
  it('requires argument and search_query inputs', () => {
    const handler = new AnalyzeLegalArgumentHandler({});
    const result = handler.validate({ argument: 'standing', search_query: 'standing doctrine' });

    assert.strictEqual(result.success, true);
  });

  it('rejects missing required fields', () => {
    const handler = new AnalyzeLegalArgumentHandler({});
    const result = handler.validate({ argument: 'standing' });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /search_query/);
    }
  });

  it('returns analysis object from API response', async () => {
    const api = {
      async analyzeLegalArgument(input: { argument: string; search_query: string }): Promise<{
        analysis: { top_cases: string[] };
      }> {
        assert.strictEqual(input.argument, 'strict scrutiny');
        return { analysis: { top_cases: ['Case A', 'Case B'] } };
      },
    };

    const handler = new AnalyzeLegalArgumentHandler(api);
    const validated = handler.validate({
      argument: 'strict scrutiny',
      search_query: 'equal protection',
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        analysis: { top_cases: string[] };
      };
      assert.deepStrictEqual(payload.analysis.top_cases, ['Case A', 'Case B']);
    }
  });

  it('returns error payload when analysis fails', async () => {
    const api = {
      async analyzeLegalArgument(): Promise<never> {
        throw new Error('Analysis timeout');
      },
    };

    const handler = new AnalyzeLegalArgumentHandler(api);
    const validated = handler.validate({ argument: 'test', search_query: 'query' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { message?: string };
      };
      // withErrorHandling returns 'handler_name failed' as error, original message in details
      assert.strictEqual(payload.error, 'analyze_legal_argument failed');
      assert.strictEqual(payload.details?.message, 'Analysis timeout');
    }
  });
});

describe('GetCitationNetworkHandler (TypeScript)', () => {
  it('normalizes input and applies defaults', () => {
    const handler = new GetCitationNetworkHandler({});
    const result = handler.validate({ opinion_id: 12 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.opinion_id, '12');
      assert.strictEqual(result.data.depth, 2);
      assert.strictEqual(result.data.direction, 'both');
      assert.strictEqual(result.data.limit, 50);
    }
  });

  it('returns citation network payload', async () => {
    const api = {
      async getCitationNetwork(
        opinionId: string | number,
        options: { depth: number; direction: string; limit: number },
      ): Promise<{ nodes: number[]; edges: unknown[] }> {
        assert.strictEqual(Number(opinionId), 123);
        assert.deepStrictEqual(options, { depth: 3, direction: 'cited_by', limit: 10 });
        return { nodes: [1, 2, 3], edges: [] };
      },
    };

    const handler = new GetCitationNetworkHandler(api);
    const validated = handler.validate({
      opinion_id: '123',
      depth: 3,
      direction: 'cited_by',
      limit: 10,
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        network: { nodes: number[] };
      };
      assert.ok(
        payload.summary.includes('citation') ||
          payload.summary.includes('network') ||
          payload.summary.includes('Retrieved'),
      );
      assert.deepStrictEqual(payload.network.nodes, [1, 2, 3]);
    }
  });

  it('returns error payload when network fetch fails', async () => {
    const api = {
      async getCitationNetwork(): Promise<never> {
        throw new Error('Network unavailable');
      },
    };

    const handler = new GetCitationNetworkHandler(api);
    const validated = handler.validate({ opinion_id: 'fail' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { message?: string; name?: string };
      };
      // withErrorHandling returns 'handler_name failed' as error, original message in details
      assert.strictEqual(payload.error, 'get_citation_network failed');
      assert.strictEqual(payload.details?.message, 'Network unavailable');
    }
  });
});

describe('LookupCitationHandler (TypeScript)', () => {
  it('validates citation and defaults', () => {
    const handler = new LookupCitationHandler({});
    const result = handler.validate({ citation: '410 U.S. 113' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.normalize, true);
      assert.strictEqual(result.data.include_alternatives, false);
    }
  });

  it('rejects missing citation', () => {
    const handler = new LookupCitationHandler({});
    const result = handler.validate({ citation: '' });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(
        result.error.message,
        /Too small.*>=1 characters|String must contain at least 1 character/,
      );
    }
  });

  it('returns citation search results', async () => {
    const api = {
      async lookupCitation(params: {
        citation: string;
        normalize?: boolean;
        include_alternatives?: boolean;
      }): Promise<Array<{ id: number }>> {
        assert.strictEqual(params.citation, '123 F.3d 456');
        assert.strictEqual(params.include_alternatives, true);
        return [{ id: 1 }];
      },
    };

    const handler = new LookupCitationHandler(api);
    const validated = handler.validate({ citation: '123 F.3d 456', include_alternatives: true });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        results: Array<{ id: number }>;
      };
      assert.ok(payload.summary.includes('citation') || payload.summary.includes('Found'));
      assert.deepStrictEqual(payload.results, [{ id: 1 }]);
    }
  });

  it('returns error payload when citation lookup fails', async () => {
    const api = {
      async lookupCitation(): Promise<never> {
        throw new Error('Lookup failed');
      },
    };

    const handler = new LookupCitationHandler(api);
    const validated = handler.validate({ citation: 'bad cite' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { message?: string; name?: string };
      };
      // withErrorHandling returns 'handler_name failed' as error, original message in details
      assert.strictEqual(payload.error, 'lookup_citation failed');
      assert.strictEqual(payload.details?.message, 'Lookup failed');
    }
  });
});

describe('GetOpinionCitationsHandler (TypeScript)', () => {
  it('normalizes the opinion identifier', () => {
    const handler = new GetOpinionCitationsHandler({});
    const result = handler.validate({ opinion_id: 42 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.opinion_id, '42');
    }
  });

  it('returns citations payload', async () => {
    const api = {
      async getOpinionCitations(opinionId: number): Promise<{ cited: Array<{ id: number }> }> {
        assert.strictEqual(opinionId, 42);
        return { cited: [{ id: 7 }] };
      },
    };

    const handler = new GetOpinionCitationsHandler(api);
    const validated = handler.validate({ opinion_id: '42' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        citations: { cited: Array<{ id: number }> };
      };
      assert.ok(payload.summary.includes('42'));
      assert.deepStrictEqual(payload.citations, { cited: [{ id: 7 }] });
    }
  });
});

describe('GetAuthoritiesHandler (TypeScript)', () => {
  it('normalizes the opinion identifier', () => {
    const handler = new GetAuthoritiesHandler({});
    const result = handler.validate({ opinion_id: 99 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.opinion_id, '99');
    }
  });

  it('returns authorities payload', async () => {
    const api = {
      async getAuthorities(opinionId: number): Promise<{ authorities: Array<{ id: number }> }> {
        assert.strictEqual(opinionId, 99);
        return { authorities: [{ id: 3 }] };
      },
    };

    const handler = new GetAuthoritiesHandler(api);
    const validated = handler.validate({ opinion_id: '99' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        authorities: { authorities: Array<{ id: number }> };
      };
      assert.ok(payload.summary.includes('99'));
      assert.deepStrictEqual(payload.authorities, { authorities: [{ id: 3 }] });
    }
  });
});
