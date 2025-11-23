import { test } from 'node:test';
import assert from 'node:assert';
import {
  GetVisualizationDataHandler,
  GetBulkDataHandler,
  GetBankruptcyDataHandler,
  GetComprehensiveJudgeProfileHandler,
  GetComprehensiveCaseAnalysisHandler,
  GetFinancialDisclosureDetailsHandler,
  ValidateCitationsHandler,
  GetEnhancedRECAPDataHandler
} from '../../dist/domains/enhanced/handlers.js';

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

test('Enhanced Handlers', async (t) => {
  await t.test('GetVisualizationDataHandler', async (t) => {
    await t.test('court_distribution', async () => {
      const mockApi = {
        getCourts: async () => ({
          results: [
            { jurisdiction: 'Federal' },
            { jurisdiction: 'State' },
            { jurisdiction: 'Federal' }
          ],
          count: 3
        })
      };

      const handler = new GetVisualizationDataHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ data_type: 'court_distribution' });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'court_distribution');
      assert.strictEqual(content.data.Federal, 2);
      assert.strictEqual(content.data.State, 1);
    });

    await t.test('case_timeline', async () => {
      const handler = new GetVisualizationDataHandler({}, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ 
        data_type: 'case_timeline',
        start_date: '2020-01-01',
        end_date: '2021-01-01',
        court_id: 'scotus'
      });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'case_timeline');
      assert.strictEqual(content.data.provided.court_id, 'scotus');
    });

    await t.test('citation_network', async () => {
      const mockApi = {
        getCitationNetwork: async (id) => ({ nodes: [], edges: [] })
      };

      const handler = new GetVisualizationDataHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ 
        data_type: 'citation_network',
        opinion_id: 123
      });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'citation_network');
      assert.strictEqual(content.center_opinion, 123);
    });

    await t.test('judge_statistics', async () => {
      const mockApi = {
        getJudges: async () => ({
          results: [
            { court: 'A', date_termination: null },
            { court: 'B', date_termination: '2020-01-01' }
          ],
          count: 2
        })
      };

      const handler = new GetVisualizationDataHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ data_type: 'judge_statistics' });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'judge_statistics');
      assert.strictEqual(content.data.active_judges, 1);
    });
  });

  await t.test('GetBulkDataHandler', async (t) => {
    await t.test('sample data', async () => {
      const mockApi = {
        searchOpinions: async () => ({ results: [1, 2, 3] })
      };

      const handler = new GetBulkDataHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ data_type: 'sample' });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.sample_data.count, 3);
    });

    await t.test('info only', async () => {
      const handler = new GetBulkDataHandler({}, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ data_type: 'info' });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.status, 'bulk_data_available');
    });
  });

  await t.test('GetBankruptcyDataHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getDockets: async (params) => ({
          results: [],
          count: 0,
          next: null,
          previous: null
        })
      };

      const handler = new GetBankruptcyDataHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ court: 'nysb' });
      
      const content = JSON.parse(result.content[0].text);
      assert.ok(content.bankruptcy_cases);
      assert.strictEqual(content.search_params.court, 'nysb');
    });
  });

  await t.test('GetComprehensiveJudgeProfileHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getComprehensiveJudgeProfile: async (id) => ({ id, name: 'Judge Dredd' })
      };

      const handler = new GetComprehensiveJudgeProfileHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ judge_id: 100 });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.name, 'Judge Dredd');
    });
  });

  await t.test('GetComprehensiveCaseAnalysisHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        getComprehensiveCaseAnalysis: async (id) => ({ id, analysis: 'complete' })
      };

      const handler = new GetComprehensiveCaseAnalysisHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ cluster_id: 200 });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.analysis, 'complete');
    });
  });

  await t.test('GetFinancialDisclosureDetailsHandler', async (t) => {
    const mockApi = {
      getFinancialInvestments: async () => ({ type: 'investments' }),
      getFinancialDebts: async () => ({ type: 'debts' }),
      getFinancialGifts: async () => ({ type: 'gifts' }),
      getFinancialAgreements: async () => ({ type: 'agreements' }),
      getDisclosurePositions: async () => ({ type: 'positions' }),
      getReimbursements: async () => ({ type: 'reimbursements' }),
      getSpouseIncomes: async () => ({ type: 'spouse_incomes' }),
      getNonInvestmentIncomes: async () => ({ type: 'non_investment_incomes' })
    };

    const handler = new GetFinancialDisclosureDetailsHandler(mockApi, mockLogger, mockMetrics, mockCache);

    const types = [
      'investments', 'debts', 'gifts', 'agreements', 
      'positions', 'reimbursements', 'spouse_incomes', 'non_investment_incomes'
    ];

    for (const type of types) {
      const result = await handler.execute({ disclosure_type: type });
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, type);
    }
  });

  await t.test('ValidateCitationsHandler', async (t) => {
    await t.test('success', async () => {
      const mockApi = {
        validateCitations: async (text) => ({ valid: true, citations: [] })
      };

      const handler = new ValidateCitationsHandler(mockApi, mockLogger, mockMetrics, mockCache);
      const result = await handler.execute({ text: 'See Roe v. Wade' });
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.valid, true);
    });
  });

  await t.test('GetEnhancedRECAPDataHandler', async (t) => {
    const mockApi = {
      getRECAPFetch: async () => ({ action: 'fetch' }),
      getRECAPQuery: async () => ({ action: 'query' }),
      getRECAPEmail: async () => ({ action: 'email' })
    };

    const handler = new GetEnhancedRECAPDataHandler(mockApi, mockLogger, mockMetrics, mockCache);

    await t.test('fetch', async () => {
      const result = await handler.execute({ action: 'fetch' });
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'fetch');
    });

    await t.test('query', async () => {
      const result = await handler.execute({ action: 'query' });
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'query');
    });

    await t.test('email', async () => {
      const result = await handler.execute({ action: 'email' });
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'email');
    });
  });
});
