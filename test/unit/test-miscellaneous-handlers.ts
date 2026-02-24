#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Miscellaneous Handlers (TypeScript)
 * Tests miscellaneous handler validation, execution, and error handling
 *
 * Coverage targets:
 * - Successful execution with valid input
 * - Input validation errors (edge cases, out-of-range, missing required)
 * - API error handling (404, 500, network errors)
 * - Empty results
 * - Pagination
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

// ────────────────────────────────────────────────────────────────────────
// GetFinancialDisclosuresHandler
// ────────────────────────────────────────────────────────────────────────

describe('GetFinancialDisclosuresHandler (TypeScript)', () => {
  // ── Validation ──

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

  it('accepts empty input with defaults only', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({});

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.judge_id, undefined);
      assert.strictEqual(result.data.year, undefined);
      assert.strictEqual(result.data.page, 1);
      assert.strictEqual(result.data.page_size, 20);
    }
  });

  it('accepts string judge_id directly', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ judge_id: 'abc-123' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.judge_id, 'abc-123');
    }
  });

  it('rejects year below 1990', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ year: 1980 });

    assert.strictEqual(result.success, false);
  });

  it('rejects year above current year', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ year: new Date().getFullYear() + 5 });

    assert.strictEqual(result.success, false);
  });

  it('rejects page < 1', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ page: 0 });

    assert.strictEqual(result.success, false);
  });

  it('rejects page_size > 100', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ page_size: 200 });

    assert.strictEqual(result.success, false);
  });

  it('rejects page_size < 1', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ page_size: 0 });

    assert.strictEqual(result.success, false);
  });

  it('rejects combined invalid fields', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    const result = handler.validate({ year: 1980, page: 0, page_size: 200 });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /year|page/i);
    }
  });

  // ── Execution – success ──

  it('returns disclosures payload from API response', async () => {
    const api = {
      async getFinancialDisclosures(params: Record<string, unknown>) {
        assert.strictEqual(params.judge_id, '7');
        assert.strictEqual(params.page, 2);
        assert.strictEqual(params.page_size, 15);
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
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.ok(payload.summary.includes('2'));
      assert.deepStrictEqual(payload.disclosures, [{ id: 'disc-1' }, { id: 'disc-2' }]);
      assert.strictEqual(payload.pagination.page, 2);
      assert.strictEqual(payload.pagination.count, 45);
    }
  });

  it('handles empty results', async () => {
    const api = {
      async getFinancialDisclosures() {
        return { count: 0, results: [] };
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Retrieved 0 financial disclosures');
      assert.deepStrictEqual(payload.disclosures, []);
      assert.strictEqual(payload.pagination.count, 0);
      assert.strictEqual(payload.pagination.has_next, false);
      assert.strictEqual(payload.pagination.has_previous, false);
    }
  });

  it('computes pagination correctly for multi-page results', async () => {
    const api = {
      async getFinancialDisclosures() {
        return {
          count: 55,
          next: 'http://api/disclosures?page=3',
          previous: 'http://api/disclosures?page=1',
          results: Array.from({ length: 10 }, (_, i) => ({ id: `d-${i}` })),
        };
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({ page: 2, page_size: 10 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.pagination.page, 2);
      assert.strictEqual(payload.pagination.page_size, 10);
      assert.strictEqual(payload.pagination.total_pages, 6);
      assert.strictEqual(payload.pagination.has_next, true);
      assert.strictEqual(payload.pagination.has_previous, true);
      assert.strictEqual(payload.disclosures.length, 10);
    }
  });

  it('reports has_next=false on last page', async () => {
    const api = {
      async getFinancialDisclosures() {
        return {
          count: 25,
          next: null,
          previous: 'http://api/disclosures?page=1',
          results: [{ id: 'd-last' }],
        };
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({ page: 2, page_size: 20 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.pagination.has_next, false);
      assert.strictEqual(payload.pagination.has_previous, true);
    }
  });

  it('handles missing results field in API response', async () => {
    const api = {
      async getFinancialDisclosures() {
        return { count: 0 };
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Retrieved 0 financial disclosures');
    }
  });

  // ── Execution – errors ──

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
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_financial_disclosures failed');
      assert.strictEqual(payload.details.message, 'API unavailable');
    }
  });

  it('handles 404 API errors', async () => {
    const api = {
      async getFinancialDisclosures(): Promise<never> {
        const err = new Error('Not Found');
        (err as any).status = 404;
        throw err;
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({ judge_id: '999' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.message, 'Not Found');
    }
  });

  it('handles 500 API errors', async () => {
    const api = {
      async getFinancialDisclosures(): Promise<never> {
        const err = new Error('Internal Server Error');
        (err as any).status = 500;
        throw err;
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_financial_disclosures failed');
      assert.strictEqual(payload.details.message, 'Internal Server Error');
    }
  });

  it('handles network/TypeError errors', async () => {
    const api = {
      async getFinancialDisclosures(): Promise<never> {
        throw new TypeError('Failed to fetch');
      },
    };

    const handler = new GetFinancialDisclosuresHandler(api);
    const validated = handler.validate({});
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.name, 'TypeError');
      assert.strictEqual(payload.details.message, 'Failed to fetch');
    }
  });

  // ── Handler metadata ──

  it('exposes correct name, description, and category', () => {
    const handler = new GetFinancialDisclosuresHandler({});
    assert.strictEqual(handler.name, 'get_financial_disclosures');
    assert.strictEqual(handler.category, 'financial');
    assert.ok(handler.description.length > 0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// GetFinancialDisclosureHandler (single)
// ────────────────────────────────────────────────────────────────────────

describe('GetFinancialDisclosureHandler (TypeScript)', () => {
  // ── Validation ──

  it('requires disclosure_id and normalizes numeric value', () => {
    const handler = new GetFinancialDisclosureHandler({});
    const result = handler.validate({ disclosure_id: 123 });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.disclosure_id, '123');
    }
  });

  it('accepts string disclosure_id', () => {
    const handler = new GetFinancialDisclosureHandler({});
    const result = handler.validate({ disclosure_id: 'abc' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.disclosure_id, 'abc');
    }
  });

  it('rejects missing disclosure_id', () => {
    const handler = new GetFinancialDisclosureHandler({});
    const result = handler.validate({});

    assert.strictEqual(result.success, false);
  });

  // ── Execution – success ──

  it('returns disclosure payload from API response', async () => {
    const api = {
      async getFinancialDisclosure(disclosureId: number) {
        assert.strictEqual(disclosureId, 99);
        return { id: '99', url: 'https://example.com/disclosures/99', judge: 'Smith' };
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: '99' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Retrieved financial disclosure 99');
      assert.deepStrictEqual(payload.disclosure, {
        id: '99',
        url: 'https://example.com/disclosures/99',
        judge: 'Smith',
      });
    }
  });

  it('passes parseInt(disclosure_id) to the API', async () => {
    let capturedId: number | undefined;
    const api = {
      async getFinancialDisclosure(disclosureId: number) {
        capturedId = disclosureId;
        return { id: disclosureId };
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: 42 });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      await handler.execute(validated.data, makeContext());
      assert.strictEqual(capturedId, 42);
      assert.strictEqual(typeof capturedId, 'number');
    }
  });

  // ── Execution – errors ──

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
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_financial_disclosure failed');
      assert.strictEqual(payload.details.message, 'Disclosure missing');
    }
  });

  it('handles 404 not found error', async () => {
    const api = {
      async getFinancialDisclosure(): Promise<never> {
        const err = new Error('Not Found');
        (err as any).status = 404;
        throw err;
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: '999' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.message, 'Not Found');
    }
  });

  it('handles 500 server error', async () => {
    const api = {
      async getFinancialDisclosure(): Promise<never> {
        throw new Error('Internal Server Error');
      },
    };

    const handler = new GetFinancialDisclosureHandler(api);
    const validated = handler.validate({ disclosure_id: '1' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_financial_disclosure failed');
    }
  });

  // ── Handler metadata ──

  it('exposes correct name, description, and category', () => {
    const handler = new GetFinancialDisclosureHandler({});
    assert.strictEqual(handler.name, 'get_financial_disclosure');
    assert.strictEqual(handler.category, 'financial');
    assert.ok(handler.description.length > 0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// GetPartiesAndAttorneysHandler
// ────────────────────────────────────────────────────────────────────────

describe('GetPartiesAndAttorneysHandler (TypeScript)', () => {
  // ── Validation ──

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

  it('accepts string docket_id', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({ docket_id: 'dock-abc' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.docket_id, 'dock-abc');
    }
  });

  it('allows overriding include_attorneys to false', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({ docket_id: 1, include_attorneys: false });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.include_attorneys, false);
      assert.strictEqual(result.data.include_parties, true);
    }
  });

  it('allows overriding include_parties to false', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({ docket_id: 1, include_parties: false });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.include_attorneys, true);
      assert.strictEqual(result.data.include_parties, false);
    }
  });

  it('allows both include flags set to false', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({
      docket_id: 1,
      include_attorneys: false,
      include_parties: false,
    });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.include_attorneys, false);
      assert.strictEqual(result.data.include_parties, false);
    }
  });

  it('rejects missing docket_id', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    const result = handler.validate({});

    assert.strictEqual(result.success, false);
  });

  // ── Execution – success ──

  it('returns parties and attorneys payload from API response', async () => {
    const api = {
      async getPartiesAndAttorneys(params: Record<string, unknown>) {
        assert.strictEqual(params.docket_id, '1337');
        assert.strictEqual(params.include_attorneys, false);
        assert.strictEqual(params.include_parties, true);
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
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.ok(payload.summary.includes('1337'));
      assert.deepStrictEqual(payload.data, {
        parties: [{ name: 'Doe' }],
        attorneys: [{ name: 'Smith' }],
      });
    }
  });

  it('handles empty parties and attorneys response', async () => {
    const api = {
      async getPartiesAndAttorneys() {
        return { parties: [], attorneys: [] };
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({ docket_id: '100' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.deepStrictEqual(payload.data.parties, []);
      assert.deepStrictEqual(payload.data.attorneys, []);
    }
  });

  it('passes full input object to API', async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const api = {
      async getPartiesAndAttorneys(params: Record<string, unknown>) {
        capturedParams = params;
        return {};
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({
      docket_id: 42,
      include_attorneys: true,
      include_parties: true,
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      await handler.execute(validated.data, makeContext());
      assert.deepStrictEqual(capturedParams, {
        docket_id: '42',
        include_attorneys: true,
        include_parties: true,
      });
    }
  });

  // ── Execution – errors ──

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
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_parties_and_attorneys failed');
      assert.strictEqual(payload.details.message, 'Parties unavailable');
    }
  });

  it('handles 404 error for unknown docket', async () => {
    const api = {
      async getPartiesAndAttorneys(): Promise<never> {
        const err = new Error('Docket not found');
        (err as any).status = 404;
        throw err;
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({ docket_id: '0' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.message, 'Docket not found');
    }
  });

  it('handles 500 server error', async () => {
    const api = {
      async getPartiesAndAttorneys(): Promise<never> {
        throw new Error('Internal Server Error');
      },
    };

    const handler = new GetPartiesAndAttorneysHandler(api);
    const validated = handler.validate({ docket_id: '1' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'get_parties_and_attorneys failed');
    }
  });

  // ── Handler metadata ──

  it('exposes correct name, description, and category', () => {
    const handler = new GetPartiesAndAttorneysHandler({});
    assert.strictEqual(handler.name, 'get_parties_and_attorneys');
    assert.strictEqual(handler.category, 'legal-entities');
    assert.ok(handler.description.length > 0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// ManageAlertsHandler
// ────────────────────────────────────────────────────────────────────────

describe('ManageAlertsHandler (TypeScript)', () => {
  // ── Validation ──

  it('validates create action with all optional parameters', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({
      action: 'create',
      query: 'new opinions',
      frequency: 'weekly',
      alert_type: 'case',
    });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.action, 'create');
      assert.strictEqual(result.data.query, 'new opinions');
      assert.strictEqual(result.data.frequency, 'weekly');
      assert.strictEqual(result.data.alert_type, 'case');
    }
  });

  it('validates list action with no extras', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'list' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.action, 'list');
      assert.strictEqual(result.data.alert_id, undefined);
      assert.strictEqual(result.data.query, undefined);
    }
  });

  it('validates update action with alert_id', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({
      action: 'update',
      alert_id: 55,
      frequency: 'monthly',
    });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.action, 'update');
      assert.strictEqual(result.data.alert_id, '55');
      assert.strictEqual(result.data.frequency, 'monthly');
    }
  });

  it('validates delete action with string alert_id', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'delete', alert_id: 'alert-xyz' });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.action, 'delete');
      assert.strictEqual(result.data.alert_id, 'alert-xyz');
    }
  });

  it('rejects unsupported action', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'disable' });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error.message, /Invalid option|Invalid enum value/i);
    }
  });

  it('rejects missing action', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({});

    assert.strictEqual(result.success, false);
  });

  it('rejects invalid frequency', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'create', frequency: 'hourly' });

    assert.strictEqual(result.success, false);
  });

  it('rejects invalid alert_type', () => {
    const handler = new ManageAlertsHandler({});
    const result = handler.validate({ action: 'create', alert_type: 'email' });

    assert.strictEqual(result.success, false);
  });

  it('accepts all valid frequency values', () => {
    const handler = new ManageAlertsHandler({});
    for (const freq of ['daily', 'weekly', 'monthly'] as const) {
      const result = handler.validate({ action: 'create', frequency: freq });
      assert.strictEqual(result.success, true, `frequency '${freq}' should be valid`);
    }
  });

  it('accepts all valid alert_type values', () => {
    const handler = new ManageAlertsHandler({});
    for (const atype of ['case', 'opinion', 'docket'] as const) {
      const result = handler.validate({ action: 'create', alert_type: atype });
      assert.strictEqual(result.success, true, `alert_type '${atype}' should be valid`);
    }
  });

  it('accepts all valid action values', () => {
    const handler = new ManageAlertsHandler({});
    for (const action of ['create', 'list', 'update', 'delete'] as const) {
      const result = handler.validate({ action });
      assert.strictEqual(result.success, true, `action '${action}' should be valid`);
    }
  });

  // ── Execution – success ──

  it('returns create alert response', async () => {
    const api = {
      async manageAlerts(params: Record<string, unknown>) {
        assert.strictEqual(params.action, 'create');
        assert.strictEqual(params.query, 'bankruptcy filings');
        return { id: 'new-alert-1', created: true };
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({
      action: 'create',
      query: 'bankruptcy filings',
      frequency: 'daily',
      alert_type: 'docket',
    });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Successfully created alert');
      assert.deepStrictEqual(payload.result, { id: 'new-alert-1', created: true });
    }
  });

  it('returns list alerts response', async () => {
    const api = {
      async manageAlerts(params: Record<string, unknown>) {
        assert.strictEqual(params.action, 'list');
        return { alerts: [{ id: '1' }, { id: '2' }] };
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'list' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Successfully listd alert');
      assert.deepStrictEqual(payload.result, { alerts: [{ id: '1' }, { id: '2' }] });
    }
  });

  it('returns update alert response', async () => {
    const api = {
      async manageAlerts(params: Record<string, unknown>) {
        assert.strictEqual(params.action, 'update');
        assert.strictEqual(params.alert_id, '77');
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
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.ok(payload.summary.includes('update'));
      assert.deepStrictEqual(payload.result, { success: true });
    }
  });

  it('returns delete alert response', async () => {
    const api = {
      async manageAlerts(params: Record<string, unknown>) {
        assert.strictEqual(params.action, 'delete');
        assert.strictEqual(params.alert_id, '99');
        return { deleted: true };
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'delete', alert_id: '99' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.summary, 'Successfully deleted alert');
      assert.deepStrictEqual(payload.result, { deleted: true });
    }
  });

  it('handles empty list response', async () => {
    const api = {
      async manageAlerts() {
        return { alerts: [] };
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'list' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, undefined);
      const payload = JSON.parse(result.content[0].text);
      assert.deepStrictEqual(payload.result.alerts, []);
    }
  });

  // ── Execution – errors ──

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
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'manage_alerts failed');
      assert.strictEqual(payload.details.message, 'Alert service down');
    }
  });

  it('handles 404 error on delete', async () => {
    const api = {
      async manageAlerts(): Promise<never> {
        const err = new Error('Alert not found');
        (err as any).status = 404;
        throw err;
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'delete', alert_id: '000' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.message, 'Alert not found');
    }
  });

  it('handles 500 server error', async () => {
    const api = {
      async manageAlerts(): Promise<never> {
        throw new Error('Internal Server Error');
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'create', query: 'test' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.error, 'manage_alerts failed');
    }
  });

  it('handles TypeError for network failures', async () => {
    const api = {
      async manageAlerts(): Promise<never> {
        throw new TypeError('Network request failed');
      },
    };

    const handler = new ManageAlertsHandler(api);
    const validated = handler.validate({ action: 'list' });
    assert.strictEqual(validated.success, true);

    if (validated.success) {
      const result = await handler.execute(validated.data, makeContext());
      assert.strictEqual(result.isError, true);
      const payload = JSON.parse(result.content[0].text);
      assert.strictEqual(payload.details.name, 'TypeError');
      assert.strictEqual(payload.details.message, 'Network request failed');
    }
  });

  // ── Handler metadata ──

  it('exposes correct name, description, and category', () => {
    const handler = new ManageAlertsHandler({});
    assert.strictEqual(handler.name, 'manage_alerts');
    assert.strictEqual(handler.category, 'alerts');
    assert.ok(handler.description.length > 0);
  });
});
