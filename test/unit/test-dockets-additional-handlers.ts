import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';
import { getStructuredPayload } from '../utils/mcp-result.js';
import {
  CreateDocketAlertHandler,
  GetDocketAlertsHandler,
  GetDocketEntryHandler,
  GetOriginatingCourtInfoHandler,
  GetTagsHandler,
} from '../../src/domains/dockets/handlers.js';
import { encodeCursor } from '../../src/common/pagination-utils.js';
import { Logger } from '../../src/infrastructure/logger.js';

class SilentLogger extends Logger {
  constructor(component = 'DocketsAdditionalTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'dockets-additional-req',
    ...overrides,
  };
}

describe('Additional dockets handlers', () => {
  it('GetDocketEntryHandler returns a single entry', async () => {
    const handler = new GetDocketEntryHandler({
      async getDocketEntry(entryId: number) {
        assert.strictEqual(entryId, 55);
        return { id: 55, entry_number: '12' };
      },
    } as any);

    const result = await handler.execute({ entry_id: '55' }, makeContext());
    const payload = getStructuredPayload(result) as {
      docket_entry: { id: number; entry_number: string };
    };
    assert.deepStrictEqual(payload.docket_entry, { id: 55, entry_number: '12' });
  });

  it('GetOriginatingCourtInfoHandler converts cursor pagination', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const handler = new GetOriginatingCourtInfoHandler({
      async getOriginatingCourtInfo(params: Record<string, unknown>) {
        capturedParams = params;
        return { count: 3, results: [{ id: 1 }] };
      },
    } as any);

    const cursor = encodeCursor(20);
    const validated = handler.validate({ docket: 88, cursor, limit: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = getStructuredPayload(result) as {
        originating_court_info: Array<{ id: number }>;
      };
      assert.deepStrictEqual(capturedParams, {
        docket: '88',
        cursor,
        limit: 10,
        page: 3,
        page_size: 10,
      });
      assert.deepStrictEqual(payload.originating_court_info, [{ id: 1 }]);
    }
  });

  it('GetTagsHandler returns tag rows', async () => {
    const handler = new GetTagsHandler({
      async getTags(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, { name: 'bankruptcy', page: 1, page_size: 20 });
        return { count: 1, results: [{ name: 'bankruptcy' }] };
      },
    } as any);

    const result = await handler.execute(
      { name: 'bankruptcy', page: 1, page_size: 20 },
      makeContext(),
    );
    const payload = getStructuredPayload(result) as { tags: Array<{ name: string }> };
    assert.deepStrictEqual(payload.tags, [{ name: 'bankruptcy' }]);
  });

  it('GetDocketAlertsHandler returns alert subscriptions', async () => {
    const handler = new GetDocketAlertsHandler({
      async getDocketAlerts(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, { docket: '44', page: 1, page_size: 20 });
        return { count: 1, results: [{ id: 3, docket: '44' }] };
      },
    } as any);

    const result = await handler.execute({ docket: '44', page: 1, page_size: 20 }, makeContext());
    const payload = getStructuredPayload(result) as {
      docket_alerts: Array<{ id: number; docket: string }>;
    };
    assert.deepStrictEqual(payload.docket_alerts, [{ id: 3, docket: '44' }]);
  });

  it('CreateDocketAlertHandler creates an alert', async () => {
    const handler = new CreateDocketAlertHandler({
      async createDocketAlert(params: Record<string, unknown>) {
        assert.deepStrictEqual(params, {
          docket: '99',
          frequency: 'daily',
          alert_type: 'email',
          email: 'user@example.com',
        });
        return { id: 9, status: 'created' };
      },
    } as any);

    const validated = handler.validate({
      docket: 99,
      frequency: 'daily',
      alert_type: 'email',
      email: 'user@example.com',
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = getStructuredPayload(result) as {
        result: { id: number; status: string };
      };
      assert.deepStrictEqual(payload.result, { id: 9, status: 'created' });
    }
  });
});
