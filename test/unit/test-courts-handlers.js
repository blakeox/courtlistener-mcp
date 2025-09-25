#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  ListCourtsHandler,
  GetJudgesHandler,
  GetJudgeHandler
} = await import('../../dist/domains/courts/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor() {
    super({ level: 'silent' });
  }
  child() {
    return new SilentLogger();
  }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('CourtsTest'),
    requestId: 'courts-req',
    ...overrides
  };
}

describe('ListCourtsHandler', () => {
  it('applies pagination defaults during validation', () => {
    const handler = new ListCourtsHandler({});
    const res = handler.validate({ jurisdiction: 'federal' });
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data.page, 1);
    assert.deepStrictEqual(res.data.page_size, 20);
  });

  it('rejects invalid court type', () => {
    const handler = new ListCourtsHandler({});
    const res = handler.validate({ court_type: 'unknown' });
    assert.strictEqual(res.success, false);
    assert.match(res.error.message, /Invalid enum value/);
  });

  it('returns courts payload with pagination metadata', async () => {
    const api = {
      async listCourts(params) {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 35, results: [{ id: 1 }, { id: 2 }] };
      }
    };

    const handler = new ListCourtsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved 2 courts');
    assert.strictEqual(payload.courts.length, 2);
    assert.deepStrictEqual(payload.pagination.total_pages, 4);
  });

  it('returns error payload when API call fails', async () => {
    const api = {
      async listCourts() {
        throw new Error('Courts service offline');
      }
    };

    const handler = new ListCourtsHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);

    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Courts service offline');
  });
});

describe('GetJudgesHandler', () => {
  it('applies default pagination and keeps filters optional', () => {
    const handler = new GetJudgesHandler({});
    const res = handler.validate({ name: 'Smith' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.page, 1);
    assert.strictEqual(res.data.page_size, 20);
    assert.strictEqual(res.data.name, 'Smith');
  });

  it('returns judge list with metadata on success', async () => {
    const api = {
      async getJudges(params) {
        assert.strictEqual(params.active, true);
        return { count: 12, results: Array.from({ length: 3 }, (_, i) => ({ id: i })) };
      }
    };

    const handler = new GetJudgesHandler(api);
    const validated = handler.validate({ active: true, page_size: 5 });
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved 3 judges');
    assert.strictEqual(payload.pagination.count, 12);
    assert.deepStrictEqual(payload.judges.length, 3);
  });

  it('returns error payload when judge lookup fails', async () => {
    const api = {
      async getJudges() {
        throw new Error('Judges endpoint down');
      }
    };

    const handler = new GetJudgesHandler(api);
    const validated = handler.validate({});
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);

    const payload = JSON.parse(result.content[0].text);
    assert.match(payload.error, /Judges endpoint down/);
  });
});

describe('GetJudgeHandler', () => {
  it('normalizes numeric identifiers to string', () => {
    const handler = new GetJudgeHandler({});
    const res = handler.validate({ judge_id: 123 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.judge_id, '123');
  });

  it('returns judge details on success', async () => {
    const api = {
      async getJudge(judgeId) {
        assert.strictEqual(judgeId, 'abc-999');
        return { id: judgeId, name: 'Hon. Example' };
      }
    };

    const handler = new GetJudgeHandler(api);
    const validated = handler.validate({ judge_id: 'abc-999' });
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved details for judge abc-999');
    assert.strictEqual(payload.judge.id, 'abc-999');
  });

  it('returns error payload when judge lookup fails', async () => {
    const api = {
      async getJudge() {
        throw new Error('Judge missing');
      }
    };

    const handler = new GetJudgeHandler(api);
    const validated = handler.validate({ judge_id: '404' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);

    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Judge missing');
    assert.strictEqual(payload.details.judgeId, '404');
  });
});
