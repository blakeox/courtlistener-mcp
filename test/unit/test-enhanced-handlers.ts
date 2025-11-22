
import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  GetVisualizationDataHandler,
  GetBulkDataHandler,
  GetBankruptcyDataHandler,
  GetComprehensiveJudgeProfileHandler,
  GetComprehensiveCaseAnalysisHandler,
  GetFinancialDisclosureDetailsHandler,
  ValidateCitationsHandler,
  GetEnhancedRECAPDataHandler
} from '../../src/domains/enhanced/handlers.js';
import type { ToolContext } from '../../src/server/tool-handler.js';
import { Logger } from '../../src/infrastructure/logger.js';

// Mock dependencies
class MockLogger extends Logger {
  constructor() {
    super({ level: 'info', format: 'json', enabled: false }, 'test');
  }
  startTimer() {
    return {
      end: () => {},
      endWithError: () => {}
    };
  }
}

const mockLogger = new MockLogger();

const mockMetrics = {
  recordToolExecution: () => {},
  recordToolError: () => {},
  recordCacheHit: () => {},
  recordCacheMiss: () => {},
} as any;

const mockCache = {
  get: () => null,
  set: () => {},
} as any;

const mockContext: ToolContext = {
  logger: mockLogger,
  metrics: mockMetrics,
  cache: mockCache,
  requestId: 'test-request-id'
};

describe('Enhanced Handlers (TypeScript)', () => {
  describe('GetVisualizationDataHandler', () => {
    it('court_distribution', async () => {
      const mockApi = {
        getCourts: async () => ({
          results: [
            { jurisdiction: 'Federal' },
            { jurisdiction: 'State' },
            { jurisdiction: 'Federal' }
          ],
          count: 3
        })
      } as any;

      const handler = new GetVisualizationDataHandler(mockApi);
      const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'court_distribution');
      assert.strictEqual(content.data.Federal, 2);
      assert.strictEqual(content.data.State, 1);
    });

    it('case_timeline', async () => {
      const handler = new GetVisualizationDataHandler({} as any);
      const result = await handler.execute({ 
        data_type: 'case_timeline',
        start_date: '2020-01-01',
        end_date: '2021-01-01',
        court_id: 'scotus'
      }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'case_timeline');
      assert.strictEqual(content.data.provided.court_id, 'scotus');
    });

    it('citation_network', async () => {
      const mockApi = {
        getCitationNetwork: async (id: any) => ({ nodes: [], edges: [] })
      } as any;

      const handler = new GetVisualizationDataHandler(mockApi);
      const result = await handler.execute({ 
        data_type: 'citation_network',
        opinion_id: 123
      }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'citation_network');
      assert.strictEqual(content.center_opinion, 123);
    });

    it('judge_statistics', async () => {
      const mockApi = {
        getJudges: async () => ({
          results: [
            { court: 'A', date_termination: null },
            { court: 'B', date_termination: '2020-01-01' }
          ],
          count: 2
        })
      } as any;

      const handler = new GetVisualizationDataHandler(mockApi);
      const result = await handler.execute({ data_type: 'judge_statistics' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.type, 'judge_statistics');
      assert.strictEqual(content.data.active_judges, 1);
    });
  });

  describe('GetBulkDataHandler', () => {
    it('sample data', async () => {
      const mockApi = {
        searchOpinions: async () => ({ results: [1, 2, 3] })
      } as any;

      const handler = new GetBulkDataHandler(mockApi);
      const result = await handler.execute({ data_type: 'sample' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.sample_data.count, 3);
    });

    it('info only', async () => {
      const handler = new GetBulkDataHandler({} as any);
      const result = await handler.execute({ data_type: 'info' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.status, 'bulk_data_available');
    });
  });

  describe('GetBankruptcyDataHandler', () => {
    it('success', async () => {
      const mockApi = {
        getDockets: async (params: any) => ({
          results: [],
          count: 0,
          next: null,
          previous: null
        })
      } as any;

      const handler = new GetBankruptcyDataHandler(mockApi);
      const result = await handler.execute({ court: 'nysb' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.ok(content.bankruptcy_cases);
      assert.strictEqual(content.search_params.court, 'nysb');
    });
  });

  describe('GetComprehensiveJudgeProfileHandler', () => {
    it('success', async () => {
      const mockApi = {
        getComprehensiveJudgeProfile: async (id: any) => ({ id, name: 'Judge Dredd' })
      } as any;

      const handler = new GetComprehensiveJudgeProfileHandler(mockApi);
      const result = await handler.execute({ judge_id: 100 }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.name, 'Judge Dredd');
    });
  });

  describe('GetComprehensiveCaseAnalysisHandler', () => {
    it('success', async () => {
      const mockApi = {
        getComprehensiveCaseAnalysis: async (id: any) => ({ id, analysis: 'complete' })
      } as any;

      const handler = new GetComprehensiveCaseAnalysisHandler(mockApi);
      const result = await handler.execute({ cluster_id: 200 }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.analysis, 'complete');
    });
  });

  describe('GetFinancialDisclosureDetailsHandler', () => {
    it('handles all disclosure types', async () => {
      const mockApi = {
        getFinancialInvestments: async () => ({ type: 'investments' }),
        getFinancialDebts: async () => ({ type: 'debts' }),
        getFinancialGifts: async () => ({ type: 'gifts' }),
        getFinancialAgreements: async () => ({ type: 'agreements' }),
        getDisclosurePositions: async () => ({ type: 'positions' }),
        getReimbursements: async () => ({ type: 'reimbursements' }),
        getSpouseIncomes: async () => ({ type: 'spouse_incomes' }),
        getNonInvestmentIncomes: async () => ({ type: 'non_investment_incomes' })
      } as any;

      const handler = new GetFinancialDisclosureDetailsHandler(mockApi);

      const types = [
        'investments', 'debts', 'gifts', 'agreements', 
        'positions', 'reimbursements', 'spouse_incomes', 'non_investment_incomes'
      ] as const;

      for (const type of types) {
        const result = await handler.execute({ disclosure_type: type }, mockContext);
        const content = JSON.parse(result.content[0].text);
        assert.strictEqual(content.type, type);
      }
    });
  });

  describe('ValidateCitationsHandler', () => {
    it('success', async () => {
      const mockApi = {
        validateCitations: async (text: any) => ({ valid: true, citations: [] })
      } as any;

      const handler = new ValidateCitationsHandler(mockApi);
      const result = await handler.execute({ text: 'See Roe v. Wade' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.valid, true);
    });
  });

  describe('GetEnhancedRECAPDataHandler', () => {
    const mockApi = {
      getRECAPFetch: async () => ({ action: 'fetch' }),
      getRECAPQuery: async () => ({ action: 'query' }),
      getRECAPEmail: async () => ({ action: 'email' })
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);

    it('fetch', async () => {
      const result = await handler.execute({ action: 'fetch' }, mockContext);
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'fetch');
    });

    it('query', async () => {
      const result = await handler.execute({ action: 'query' }, mockContext);
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'query');
    });

    it('email', async () => {
      const result = await handler.execute({ action: 'email' }, mockContext);
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.action, 'email');
    });
  });
});
