
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
        listCourts: async () => ({
          results: [
            { type: 'Federal' },
            { type: 'State' },
            { type: 'Federal' }
          ],
          count: 3
        })
      } as any;

      const handler = new GetVisualizationDataHandler(mockApi);
      const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      assert.strictEqual(content.total_courts, 3);
      assert.strictEqual(content.distribution.Federal, 2);
      assert.strictEqual(content.distribution.State, 1);
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
      // Handler returns mock timeline data
      assert.ok(content.timeline);
      assert.ok(Array.isArray(content.timeline));
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
      // Handler returns the network data directly from API
      assert.ok(content.nodes !== undefined);
      assert.ok(content.edges !== undefined);
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
      assert.strictEqual(content.total_judges, 2);
      assert.strictEqual(content.active_judges, 1);
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
      // Handler returns data_type, sample_size, data, message
      assert.strictEqual(content.data_type, 'sample');
      assert.ok(content.message);
    });

    it('info only', async () => {
      const handler = new GetBulkDataHandler({} as any);
      const result = await handler.execute({ data_type: 'info' }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      // Handler returns data_type, sample_size, data, message for all types
      assert.strictEqual(content.data_type, 'info');
      assert.ok(content.message);
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
      // Handler requires page and page_size (have defaults), provide court
      const result = await handler.execute({ court: 'nysb', page: 1, page_size: 20 }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      // Handler returns { court, case_name, docket_number, message }
      assert.strictEqual(content.court, 'nysb');
      assert.ok(content.message);
    });
  });

  describe('GetComprehensiveJudgeProfileHandler', () => {
    it('success', async () => {
      const mockApi = {
        // Handler calls getJudge(), not getComprehensiveJudgeProfile()
        getJudge: async (id: any) => ({ id, name: 'Judge Dredd' })
      } as any;

      const handler = new GetComprehensiveJudgeProfileHandler(mockApi);
      const result = await handler.execute({ judge_id: 100 }, mockContext);
      
      const content = JSON.parse(result.content[0].text);
      // Handler returns { profile, analytics }
      assert.ok(content.profile);
      assert.strictEqual(content.profile.name, 'Judge Dredd');
      assert.ok(content.analytics);
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
        // Handler requires page and page_size (have defaults via @withDefaults)
        const result = await handler.execute({ disclosure_type: type, page: 1, page_size: 20 }, mockContext);
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
