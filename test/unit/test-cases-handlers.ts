#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Case Handlers (TypeScript)
 * Tests case handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';

const {
  GetCaseDetailsHandler,
  GetRelatedCasesHandler,
  AnalyzeCaseAuthoritiesHandler,
} = await import('../../dist/domains/cases/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'error', format: 'json', enabled: false }, 'Silent');
  }

  child(): SilentLogger {
    return new SilentLogger();
  }
}

interface CaseDetails {
  clusterId: number;
}

interface RelatedCasesInput {
  opinion_id?: number;
  cluster_id?: number;
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('CasesTest'),
    requestId: 'cases-req',
    ...overrides,
  };
}

describe('GetCaseDetailsHandler (TypeScript)', () => {
  it('validates and normalizes cluster_id input', () => {
    const handler = new GetCaseDetailsHandler({});
    const res = handler.validate({ cluster_id: '123' });

    assert.strictEqual(res.success, true);
    if (res.success) {
      // Handler transforms to { cluster_id: string } format
      assert.strictEqual(res.data.cluster_id, '123');
      assert.ok(typeof res.data.cluster_id === 'string');
    }
  });

  it('rejects non-positive cluster IDs', () => {
    const handler = new GetCaseDetailsHandler({});
    const res = handler.validate({ cluster_id: -5 });

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.match(res.error.message, /cluster_id must be a positive integer/);
    }
  });

  it('executes successfully and returns summary', async () => {
    const api = {
      async getCaseDetails({ clusterId }: CaseDetails): Promise<{ id: number; name: string }> {
        assert.strictEqual(clusterId, 456);
        return { id: 456, name: 'Demo v. Example' };
      },
    };

    const handler = new GetCaseDetailsHandler(api);
    const validated = handler.validate({ cluster_id: 456 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        case: { id: number };
      };
      assert.strictEqual(payload.summary, 'Retrieved details for case 456');
      assert.strictEqual(payload.case.id, 456);
    }
  });

  it('returns error result when API fails', async () => {
    const api = {
      async getCaseDetails(): Promise<never> {
        throw new Error('Case not found');
      },
    };

    const handler = new GetCaseDetailsHandler(api);
    const validated = handler.validate({ cluster_id: 1 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string };
      assert.strictEqual(payload.error, 'Case not found');
    }
  });
});

describe('GetRelatedCasesHandler (TypeScript)', () => {
  it('requires an identifier', () => {
    const handler = new GetRelatedCasesHandler({});
    const res = handler.validate({});

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.match(res.error.message, /opinion_id or cluster_id is required/);
    }
  });

  it('validates with opinion_id', () => {
    const handler = new GetRelatedCasesHandler({});
    const res = handler.validate({ opinion_id: 789 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      // Handler transforms to opinion_id format
      assert.ok('opinion_id' in res.data);
      assert.strictEqual(res.data.opinion_id, 789);
    }
  });

  it('validates with cluster_id', () => {
    const handler = new GetRelatedCasesHandler({});
    const res = handler.validate({ cluster_id: 456 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      // Handler transforms cluster_id to opinion_id
      assert.ok('opinion_id' in res.data);
      assert.strictEqual(typeof res.data.opinion_id, 'number');
    }
  });

  it('executes and returns related cases', async () => {
    const api = {
      async getRelatedCases(opinionId: number): Promise<Array<{ id: number; name: string }>> {
        assert.ok(opinionId > 0);
        return [{ id: 100, name: 'Related Case 1' }];
      },
    };

    const handler = new GetRelatedCasesHandler(api);
    const validated = handler.validate({ opinion_id: 789 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        relatedCases?: Array<{ id: number }>;
        related_cases?: Array<{ id: number }>;
      };
      assert.ok(payload.summary.includes('related') || payload.summary.includes('Related'));
      assert.ok(Array.isArray(payload.relatedCases) || Array.isArray(payload.related_cases));
    }
  });
});

describe('AnalyzeCaseAuthoritiesHandler (TypeScript)', () => {
  it('validates cluster_id', () => {
    const handler = new AnalyzeCaseAuthoritiesHandler({});
    const res = handler.validate({ case_id: 123 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      // Handler transforms to case_id format
      assert.ok('case_id' in res.data);
      assert.strictEqual(typeof res.data.case_id, 'string');
    }
  });

  it('executes analysis and returns authorities', async () => {
    const api = {
      async analyzeCaseAuthorities(input: { case_id: string; include_citations?: boolean; depth?: number }): Promise<Array<{ id: number; citation: string }>> {
        assert.ok(input.case_id.length > 0);
        return [{ id: 1, citation: '123 U.S. 456' }];
      },
    };

    const handler = new AnalyzeCaseAuthoritiesHandler(api);
    const validated = handler.validate({ case_id: 123 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        analysis?: Array<unknown> | Record<string, unknown>;
        authorities?: Array<unknown>;
        cited_cases?: Array<unknown>;
      };
      assert.ok(
        payload.summary.includes('authorities') ||
          payload.summary.includes('cited') ||
          payload.summary.includes('Authority') ||
          payload.summary.includes('Analyzed')
      );
      assert.ok(
        payload.analysis !== undefined ||
          Array.isArray(payload.authorities) ||
          Array.isArray(payload.cited_cases)
      );
    }
  });
});

