#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Court Handlers (TypeScript)
 * Tests court handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';

const { ListCourtsHandler, GetJudgesHandler, GetJudgeHandler } = await import(
  '../../dist/domains/courts/handlers.js'
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

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('CourtsTest'),
    requestId: 'courts-req',
    ...overrides,
  };
}

describe('ListCourtsHandler (TypeScript)', () => {
  it('applies pagination defaults during validation', () => {
    const handler = new ListCourtsHandler({});
    const res = handler.validate({ jurisdiction: 'federal' });

    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.deepStrictEqual(res.data.page, 1);
      assert.deepStrictEqual(res.data.page_size, 20);
    }
  });

  it('rejects invalid court type', () => {
    const handler = new ListCourtsHandler({});
    const res = handler.validate({ court_type: 'unknown' });

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.match(res.error.message, /Invalid enum value|Invalid/);
    }
  });

  it('returns courts payload with pagination metadata', async () => {
    const api = {
      async listCourts(params: { page: number; page_size: number }): Promise<{
        count: number;
        results: Array<{ id: number }>;
      }> {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 35, results: [{ id: 1 }, { id: 2 }] };
      },
    };

    const handler = new ListCourtsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        courts: Array<{ id: number }>;
      };
      assert.ok(payload.summary.includes('courts') || payload.summary.includes('Retrieved'));
      assert.ok(Array.isArray(payload.courts));
      assert.strictEqual(payload.courts.length, 2);
    }
  });
});

describe('GetJudgesHandler (TypeScript)', () => {
  it('validates pagination parameters', () => {
    const handler = new GetJudgesHandler({});
    const res = handler.validate({ page: 1, page_size: 25 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.data.page, 1);
      assert.strictEqual(res.data.page_size, 25);
    }
  });

  it('executes and returns judges', async () => {
    const api = {
      async getJudges(params: { page?: number; page_size?: number }): Promise<{
        count: number;
        results: Array<{ id: number; name: string }>;
      }> {
        return { count: 10, results: [{ id: 1, name: 'Judge Smith' }] };
      },
    };

    const handler = new GetJudgesHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        judges?: Array<{ id: number }>;
      };
      assert.ok(
        payload.summary.includes('judges') ||
          payload.summary.includes('Judge') ||
          payload.summary.includes('Retrieved')
      );
    }
  });
});

describe('GetJudgeHandler (TypeScript)', () => {
  it('requires judge identifier', () => {
    const handler = new GetJudgeHandler({});
    const res = handler.validate({});

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.ok(
        res.error.message.includes('id') ||
          res.error.message.includes('judge_id') ||
          res.error.message.includes('required')
      );
    }
  });

  it('validates with judge ID', () => {
    const handler = new GetJudgeHandler({});
    const res = handler.validate({ judge_id: 123 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      // Handler transforms judge_id to string
      assert.ok('judge_id' in res.data);
      assert.strictEqual(typeof res.data.judge_id, 'string');
      assert.strictEqual(res.data.judge_id, '123');
    }
  });

  it('executes and returns judge details', async () => {
    const api = {
      async getJudge(judgeId: string | number): Promise<{
        id: number;
        name: string;
      }> {
        const id = Number(judgeId);
        assert.ok(id > 0);
        return { id, name: 'Judge Smith' };
      },
    };

    const handler = new GetJudgeHandler(api);
    const validated = handler.validate({ judge_id: 123 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        judge?: { id: number; name: string };
      };
      assert.ok(
        payload.summary.includes('judge') ||
          payload.summary.includes('Judge') ||
          payload.summary.includes('Retrieved')
      );
    }
  });
});

