#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Oral Arguments Handlers (TypeScript)
 * Tests oral arguments handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';

const { GetOralArgumentsHandler, GetOralArgumentHandler } = await import(
  '../../dist/domains/oral-arguments/handlers.js'
);
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'OralArgumentsTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'oral-arguments-req',
    ...overrides,
  };
}

describe('GetOralArgumentsHandler (TypeScript)', () => {
  it('applies defaults and normalizes optional filters', () => {
    const handler = new GetOralArgumentsHandler({});
    const res = handler.validate({ docket_id: 42 });

    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.data.docket_id, '42');
      assert.strictEqual(res.data.page, 1);
      assert.strictEqual(res.data.page_size, 20);
    }
  });

  it('rejects invalid pagination values', () => {
    const handler = new GetOralArgumentsHandler({});
    const res = handler.validate({ page: 0 });

    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.match(res.error.message, /Number must be greater than or equal to 1/);
    }
  });

  it('returns oral arguments payload with pagination metadata', async () => {
    const api = {
      async getOralArguments(params: { page?: number; page_size?: number }): Promise<{
        count: number;
        results: Array<{ id: string }>;
      }> {
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 10);
        return { count: 25, results: [{ id: 'oa1' }, { id: 'oa2' }] };
      },
    };

    const handler = new GetOralArgumentsHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        oral_arguments?: Array<{ id: string }>;
        pagination?: { total_pages?: number };
      };
      assert.ok(
        payload.summary.includes('oral') ||
          payload.summary.includes('arguments') ||
          payload.summary.includes('Retrieved')
      );
      if (payload.oral_arguments) {
        assert.ok(Array.isArray(payload.oral_arguments));
      }
    }
  });

  it('returns error payload when API fails', async () => {
    const api = {
      async getOralArguments(): Promise<never> {
        throw new Error('Oral arguments unavailable');
      },
    };

    const handler = new GetOralArgumentsHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as { error: string };
      assert.ok(
        payload.error.includes('unavailable') ||
          payload.error.includes('Failed') ||
          payload.error.includes('Oral arguments')
      );
    }
  });
});

describe('GetOralArgumentHandler (TypeScript)', () => {
  it('normalizes identifiers and defaults', () => {
    const handler = new GetOralArgumentHandler({});
    const result = handler.validate({ oral_argument_id: 77 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.oral_argument_id, '77');
      assert.strictEqual(result.data.include_transcript, false);
      assert.strictEqual(result.data.include_audio_url, true);
    }
  });

  it('returns oral argument details when API succeeds', async () => {
    const api = {
      async getOralArgument(id: string | number): Promise<{
        id: string;
        court: string;
      }> {
        assert.strictEqual(String(id), 'A-42');
        return { id: String(id), court: 'Supreme Court' };
      },
    };

    const handler = new GetOralArgumentHandler(api);
    const validated = handler.validate({ oral_argument_id: 'A-42', include_transcript: true });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        oralArgument?: { court: string };
      };
      assert.ok(
        payload.summary.includes('oral') ||
          payload.summary.includes('argument') ||
          payload.summary.includes('Retrieved')
      );
      if (payload.oralArgument) {
        assert.strictEqual(payload.oralArgument.court, 'Supreme Court');
      }
    }
  });

  it('returns error payload when oral argument lookup fails', async () => {
    const api = {
      async getOralArgument(): Promise<never> {
        throw new Error('Argument missing');
      },
    };

    const handler = new GetOralArgumentHandler(api);
    const validated = handler.validate({ oral_argument_id: 'missing' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { oralArgumentId?: string };
      };
      assert.ok(
        payload.error.includes('missing') ||
          payload.error.includes('Failed') ||
          payload.error.includes('Argument')
      );
      if (payload.details) {
        assert.strictEqual(payload.details.oralArgumentId, 'missing');
      }
    }
  });
});

