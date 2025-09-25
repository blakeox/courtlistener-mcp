#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const {
  GetOralArgumentsHandler,
  GetOralArgumentHandler
} = await import('../../dist/domains/oral-arguments/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'OralArgumentsTest') {
    super({ level: 'debug', format: 'json', enabled: false }, component);
  }

  child(component) {
    return new SilentLogger(component);
  }
}

function makeContext(overrides = {}) {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'oral-arguments-req',
    ...overrides
  };
}

describe('GetOralArgumentsHandler', () => {
  it('applies defaults and normalizes optional filters', () => {
    const handler = new GetOralArgumentsHandler({});
    const res = handler.validate({ docket_id: 42 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.docket_id, '42');
    assert.strictEqual(res.data.page, 1);
    assert.strictEqual(res.data.page_size, 20);
  });

  it('rejects invalid pagination values', () => {
    const handler = new GetOralArgumentsHandler({});
    const res = handler.validate({ page: 0 });
    assert.strictEqual(res.success, false);
    assert.match(res.error.message, /Number must be greater than or equal to 1/);
  });

  it('returns oral arguments payload with pagination metadata', async () => {
    const api = {
      async getOralArguments(params) {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 25, results: [{ id: 'oa1' }, { id: 'oa2' }] };
      }
    };

    const handler = new GetOralArgumentsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved 2 oral arguments');
    assert.strictEqual(payload.pagination.total_pages, 3);
    assert.deepStrictEqual(payload.oralArguments, [{ id: 'oa1' }, { id: 'oa2' }]);
  });

  it('returns error payload when API fails', async () => {
    const api = {
      async getOralArguments() {
        throw new Error('Service down');
      }
    };

    const handler = new GetOralArgumentsHandler(api);
    const validated = handler.validate({});
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Service down');
  });
});

describe('GetOralArgumentHandler', () => {
  it('normalizes identifiers and applies default flags', () => {
    const handler = new GetOralArgumentHandler({});
    const res = handler.validate({ oral_argument_id: 77 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.oral_argument_id, '77');
    assert.strictEqual(res.data.include_transcript, false);
    assert.strictEqual(res.data.include_audio_url, true);
  });

  it('returns oral argument details when API succeeds', async () => {
    const api = {
      async getOralArgument(id) {
        assert.strictEqual(id, 'A-42');
        return { id, court: 'Supreme Court' };
      }
    };

    const handler = new GetOralArgumentHandler(api);
    const validated = handler.validate({ oral_argument_id: 'A-42', include_transcript: true });
    const result = await handler.execute(validated.data, makeContext());
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.summary, 'Retrieved details for oral argument A-42');
    assert.strictEqual(payload.oralArgument.court, 'Supreme Court');
  });

  it('returns error payload when oral argument lookup fails', async () => {
    const api = {
      async getOralArgument() {
        throw new Error('Argument missing');
      }
    };

    const handler = new GetOralArgumentHandler(api);
    const validated = handler.validate({ oral_argument_id: 'missing' });
    const result = await handler.execute(validated.data, makeContext());
    assert.strictEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, 'Argument missing');
    assert.strictEqual(payload.details.oralArgumentId, 'missing');
  });
});
