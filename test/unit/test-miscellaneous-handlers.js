import { test } from 'node:test';
import assert from 'node:assert';
import {
  GetFinancialDisclosuresHandler,
  GetFinancialDisclosureHandler,
  GetPartiesAndAttorneysHandler,
  ManageAlertsHandler
} from '../../dist/domains/miscellaneous/handlers.js';

// Mock dependencies
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

const mockMetrics = {
  recordToolExecution: () => {},
  recordToolError: () => {},
  recordCacheHit: () => {},
  recordCacheMiss: () => {},
};

const mockCache = {
  get: async () => null,
  set: async () => {},
};

test('Miscellaneous Handlers', async (t) => {
  await t.test('GetFinancialDisclosuresHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getFinancialDisclosures: async () => ({
          results: [{ id: 1, judge: 'Test Judge' }],
          count: 1,
          next: null,
          previous: null
        })
      };

      const handler = new GetFinancialDisclosuresHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ judge_id: '123' });

      assert.strictEqual(result.content[0].type, 'text');
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.disclosures.length, 1);
      assert.strictEqual(content.disclosures[0].judge, 'Test Judge');
    });

    await t.test('handles API error', async () => {
      const mockApi = {
        getFinancialDisclosures: async () => { throw new Error('API Error'); }
      };

      const handler = new GetFinancialDisclosuresHandler(mockApi, mockLogger, mockMetrics, mockCache);
      await assert.rejects(async () => {
        await handler.execute({ judge_id: '123' });
      }, /API Error/);
    });
  });

  await t.test('GetFinancialDisclosureHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getFinancialDisclosure: async () => ({
          id: 123,
          judge: 'Test Judge',
          year: 2020
        })
      };

      const handler = new GetFinancialDisclosureHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ disclosure_id: '123' });

      assert.strictEqual(result.content[0].type, 'text');
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.disclosure.id, 123);
    });
  });

  await t.test('GetPartiesAndAttorneysHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getPartiesAndAttorneys: async () => ({
          parties: ['Party A'],
          attorneys: ['Attorney B']
        })
      };

      const handler = new GetPartiesAndAttorneysHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ docket_id: '456' });

      assert.strictEqual(result.content[0].type, 'text');
      const content = JSON.parse(result.content[0].text);
      assert.deepStrictEqual(content.data.parties, ['Party A']);
    });
  });

  await t.test('ManageAlertsHandler', async (t) => {
    await t.test('success - create', async () => {
      const mockApi = {
        manageAlerts: async (params) => ({
          status: 'created',
          alert: params
        })
      };

      const handler = new ManageAlertsHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({
        action: 'create',
        query: 'test case',
        alert_type: 'case',
        frequency: 'daily'
      });

      assert.strictEqual(result.content[0].type, 'text');
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.result.status, 'created');
    });
  });
});
