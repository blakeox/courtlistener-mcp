#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Miscellaneous Handlers (TypeScript)
 * Tests miscellaneous handler validation, execution, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { ToolContext } from '../../src/server/tool-handler.js';

const {
  GetFinancialDisclosuresHandler,
  GetFinancialDisclosureHandler,
  GetPartiesAndAttorneysHandler,
  ManageAlertsHandler,
} = await import('../../dist/domains/miscellaneous/handlers.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

class SilentLogger extends Logger {
  constructor(component = 'MiscHandlersTest') {
    super({ level: 'error', format: 'json', enabled: false }, component);
  }

  child(component: string): SilentLogger {
    return new SilentLogger(component);
  }

  startTimer() {
    return {
      end: () => {},
      endWithError: () => {},
    };
  }
}

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    logger: new SilentLogger().child('unit'),
    requestId: 'misc-handlers-req',
    ...overrides,
  };
}

describe('GetFinancialDisclosuresHandler (TypeScript)', () => {
  it('applies defaults and normalizes inputs', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const currentYear = new Date().getFullYear();
    const result = handler.validate({ judge_id: 42, year: currentYear });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.judge_id, '42');
      assert.strictEqual(result.data.page, 1);
      assert.strictEqual(result.data.page_size, 20);
      assert.strictEqual(result.data.year, currentYear);
    }
  });

  it('rejects out-of-range year or pagination settings', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ year: 1980, page: 0, page_size: 200 });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /year|page/i);
    }
  });

  it('returns disclosures payload from API response', async () => {
    const expectedInput = {
      judge_id: '7',
      page: 2,
      page_size: 15,
    };

    const api = {
      async getFinancialDisclosures(params: typeof expectedInput): Promise<{
        count: number;
        results: Array<{ id: string }>;
      }> {
        assert.deepStrictEqual(params, expectedInput);
        return {
          count: 45,
          results: [{ id: 'disc-1' }, { id: 'disc-2' }],
        };
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({ judge_id: '7', page: 2, page_size: 15 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        disclosures: Array<{ id: string }>;
        pagination: { page: number; count: number; total_pages: number };
      };
      assert.ok(payload.summary.includes('disclosures') || payload.summary.includes('Retrieved'));
      assert.deepStrictEqual(payload.disclosures, [{ id: 'disc-1' }, { id: 'disc-2' }]);
      assert.strictEqual(payload.pagination.page, 2);
      assert.strictEqual(payload.pagination.count, 45);
    }
  });

  it('returns error payload when API call fails', async () => {
    const api = {
      async getFinancialDisclosures(): Promise<never> {
        throw new Error('API unavailable');
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({ judge_id: 'fail' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: unknown;
      };
      assert.strictEqual(payload.error, 'get_financial_disclosures failed');
      assert.strictEqual((payload.details as any).message, 'API unavailable');
    }
  });
});

describe('GetFinancialDisclosureHandler (TypeScript)', () => {
  it('requires disclosure identifier and normalizes value', () => {
    const handler = new GetFinancialDisclosureHandler({});
    const result = handler.validate({ disclosure_id: 123 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.disclosure_id, '123');
    }
  });

  it('returns disclosure payload from API response', async () => {
    const api = {
      async getFinancialDisclosure(disclosureId: string | number): Promise<{
        id: string;
        url: string;
      }> {
        assert.strictEqual(String(disclosureId), '99');
        return { id: '99', url: 'https://example.com/disclosures/99' };
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: '99' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        disclosure: { id: string; url: string };
      };
      assert.ok(payload.summary.includes('disclosure') || payload.summary.includes('Retrieved'));
      assert.deepStrictEqual(payload.disclosure, {
        id: '99',
        url: 'https://example.com/disclosures/99',
      });
    }
  });

  it('returns error payload when disclosure fetch fails', async () => {
    const api = {
      async getFinancialDisclosure(): Promise<never> {
        throw new Error('Disclosure missing');
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: 'missing' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { disclosureId?: string };
      };
      assert.strictEqual(payload.error, 'get_financial_disclosure failed');
      assert.strictEqual((payload.details as any).message, 'Disclosure missing');
    }
  });
});

describe('GetPartiesAndAttorneysHandler (TypeScript)', () => {
  it('applies defaults for include flags and normalizes docket ID', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({ docket_id: 555 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.docket_id, '555');
      assert.strictEqual(result.data.include_attorneys, true);
      assert.strictEqual(result.data.include_parties, true);
    }
  });

  it('returns parties and attorneys payload from API response', async () => {
    const api = {
      async getPartiesAndAttorneys(params: {
        docket_id: string;
        include_attorneys: boolean;
        include_parties: boolean;
      }): Promise<{ parties: Array<{ name: string }>; attorneys: Array<{ name: string }> }> {
        assert.deepStrictEqual(params, {
          docket_id: '1337',
          include_attorneys: false,
          include_parties: true,
        });
        return { parties: [{ name: 'Doe' }], attorneys: [{ name: 'Smith' }] };
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({
      docket_id: '1337',
      include_attorneys: false,
      include_parties: true,
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        data: { parties: Array<{ name: string }>; attorneys: Array<{ name: string }> };
      };
      assert.ok(
        payload.summary.includes('parties') ||
          payload.summary.includes('attorneys') ||
          payload.summary.includes('Retrieved')
      );
      assert.deepStrictEqual(payload.data, {
        parties: [{ name: 'Doe' }],
        attorneys: [{ name: 'Smith' }],
      });
    }
  });

  it('returns error payload when parties lookup fails', async () => {
    const api = {
      async getPartiesAndAttorneys(): Promise<never> {
        throw new Error('Parties unavailable');
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({ docket_id: 'fail-docket' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { docketId?: string };
      };
      assert.strictEqual(payload.error, 'get_parties_and_attorneys failed');
      assert.strictEqual((payload.details as any).message, 'Parties unavailable');
    }
  });
});

describe('ManageAlertsHandler (TypeScript)', () => {
  it('validates actions and optional parameters', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({
      action: 'create',
      query: 'new opinions',
      frequency: 'weekly',
      alert_type: 'case',
    });

    assert.strictEqual(result.success, true);
  });

  it('rejects unsupported actions', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'disable' });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /Invalid enum value/i);
    }
  });

  it('returns alert management payload from API response', async () => {
    const api = {
      async manageAlerts(params: {
        action: string;
        alert_id?: string;
        frequency?: string;
      }): Promise<{ success: boolean }> {
        assert.deepStrictEqual(params, {
          action: 'update',
          alert_id: '77',
          frequency: 'daily',
        });
        return { success: true };
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({
      action: 'update',
      alert_id: '77',
      frequency: 'daily',
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text) as {
        summary: string;
        result?: { success: boolean };
      };
      assert.ok(payload.summary.includes('alert') || payload.summary.includes('Successfully'));
      if (payload.result) {
        assert.deepStrictEqual(payload.result, { success: true });
      }
    }
  });

  it('returns error payload when alert management fails', async () => {
    const api = {
      async manageAlerts(): Promise<never> {
        throw new Error('Alert service down');
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'delete', alert_id: 'bad' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text) as {
        error: string;
        details?: { action?: string };
      };
      assert.strictEqual(payload.error, 'manage_alerts failed');
      assert.strictEqual((payload.details as any).message, 'Alert service down');
    }
  });
});

