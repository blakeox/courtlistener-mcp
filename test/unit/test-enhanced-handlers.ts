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
  GetEnhancedRECAPDataHandler,
  SmartSearchHandler,
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
      endWithError: () => {},
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
  requestId: 'test-request-id',
};

// ──────────────────────────────────────────────────
// GetVisualizationDataHandler
// ──────────────────────────────────────────────────

describe('GetVisualizationDataHandler', () => {
  // --- validation ---
  it('validates court_distribution input', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'court_distribution' });
    assert.strictEqual(res.success, true);
  });

  it('rejects invalid data_type', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'invalid_type' });
    assert.strictEqual(res.success, false);
  });

  it('requires opinion_id for citation_network', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'citation_network' });
    assert.strictEqual(res.success, false);
  });

  it('accepts opinion_id as string and transforms to number', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'citation_network', opinion_id: '42' });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.opinion_id, 42);
  });

  it('rejects depth outside 1-5', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'court_distribution', depth: 10 });
    assert.strictEqual(res.success, false);
  });

  it('rejects limit outside 1-200', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const res = handler.validate({ data_type: 'court_distribution', limit: 300 });
    assert.strictEqual(res.success, false);
  });

  // --- court_distribution ---
  it('court_distribution returns distribution data', async () => {
    const mockApi = {
      listCourts: async () => ({
        results: [{ type: 'Federal' }, { type: 'State' }, { type: 'Federal' }],
        count: 3,
      }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.total_courts, 3);
    assert.strictEqual(content.distribution.Federal, 2);
    assert.strictEqual(content.distribution.State, 1);
    assert.ok(Array.isArray(content.raw_data));
    assert.ok(content.raw_data.length <= 10);
  });

  it('court_distribution handles empty results', async () => {
    const mockApi = {
      listCourts: async () => ({ results: [], count: 0 }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.total_courts, 0);
    assert.deepStrictEqual(content.distribution, {});
    assert.deepStrictEqual(content.raw_data, []);
  });

  it('court_distribution handles missing count', async () => {
    const mockApi = {
      listCourts: async () => ({ results: [{ type: 'Federal' }] }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.total_courts, 0);
  });

  it('court_distribution labels missing type as Unknown', async () => {
    const mockApi = {
      listCourts: async () => ({
        results: [{ type: '' }, { name: 'no-type-field' }],
        count: 2,
      }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    // empty string is falsy → 'Unknown', undefined is also 'Unknown'
    assert.strictEqual(content.distribution.Unknown, 2);
  });

  // --- case_timeline ---
  it('case_timeline returns mock timeline', async () => {
    const handler = new GetVisualizationDataHandler({} as any);
    const result = await handler.execute(
      {
        data_type: 'case_timeline',
        start_date: '2020-01-01',
        end_date: '2022-12-31',
        court_id: 'scotus',
      },
      mockContext,
    );

    const content = JSON.parse(result.content[0].text);
    assert.ok(content.timeline);
    assert.ok(Array.isArray(content.timeline));
    assert.ok(content.timeline.length > 0);
    assert.ok(content.timeline[0].year);
    assert.ok(content.timeline[0].cases !== undefined);
  });

  // --- citation_network ---
  it('citation_network calls API with correct params', async () => {
    let calledWith: any = {};
    const mockApi = {
      getCitationNetwork: async (id: number, opts: any) => {
        calledWith = { id, opts };
        return { nodes: [{ id: 1 }], edges: [{ from: 1, to: 2 }] };
      },
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute(
      { data_type: 'citation_network', opinion_id: 123, depth: 3 },
      mockContext,
    );

    assert.strictEqual(calledWith.id, 123);
    assert.strictEqual(calledWith.opts.depth, 3);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.nodes.length, 1);
    assert.strictEqual(content.edges.length, 1);
  });

  it('citation_network uses default depth of 1', async () => {
    let capturedOpts: any = {};
    const mockApi = {
      getCitationNetwork: async (_id: number, opts: any) => {
        capturedOpts = opts;
        return { nodes: [], edges: [] };
      },
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    await handler.execute({ data_type: 'citation_network', opinion_id: 1 }, mockContext);
    assert.strictEqual(capturedOpts.depth, 1);
  });

  it('citation_network throws without opinion_id at runtime', async () => {
    const handler = new GetVisualizationDataHandler({} as any);
    // Force bypass schema validation to test runtime guard
    const result = await handler.execute({ data_type: 'citation_network' } as any, mockContext);
    // @withDefaults wraps errors → isError result
    assert.strictEqual(result.isError, true);
  });

  // --- judge_statistics ---
  it('judge_statistics computes active judges and appointer stats', async () => {
    const mockApi = {
      getJudges: async () => ({
        results: [
          { court: 'A', date_termination: null, appointer: 'Obama' },
          { court: 'B', date_termination: '2020-01-01', appointer: 'Trump' },
          { court: 'C', date_termination: null, appointer: 'Obama' },
        ],
        count: 3,
      }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'judge_statistics' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.total_judges, 3);
    assert.strictEqual(content.active_judges, 2);
    assert.strictEqual(content.appointed_by_president.Obama, 2);
    assert.strictEqual(content.appointed_by_president.Trump, 1);
  });

  it('judge_statistics labels missing appointer as Unknown', async () => {
    const mockApi = {
      getJudges: async () => ({
        results: [{ date_termination: null }],
        count: 1,
      }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'judge_statistics' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.appointed_by_president.Unknown, 1);
  });

  it('judge_statistics handles empty results', async () => {
    const mockApi = {
      getJudges: async () => ({ results: [], count: 0 }),
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'judge_statistics' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.total_judges, 0);
    assert.strictEqual(content.active_judges, 0);
  });

  // --- API errors ---
  it('returns error when API throws', async () => {
    const mockApi = {
      listCourts: async () => {
        throw new Error('API timeout');
      },
    } as any;

    const handler = new GetVisualizationDataHandler(mockApi);
    const result = await handler.execute({ data_type: 'court_distribution' }, mockContext);

    assert.strictEqual(result.isError, true);
  });

  // --- handler metadata ---
  it('has correct name and category', () => {
    const handler = new GetVisualizationDataHandler({} as any);
    assert.strictEqual(handler.name, 'get_visualization_data');
    assert.strictEqual(handler.category, 'analytics');
  });
});

// ──────────────────────────────────────────────────
// GetBulkDataHandler
// ──────────────────────────────────────────────────

describe('GetBulkDataHandler', () => {
  it('validates data_type is required', () => {
    const handler = new GetBulkDataHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('validates data_type must be non-empty', () => {
    const handler = new GetBulkDataHandler({} as any);
    const res = handler.validate({ data_type: '' });
    assert.strictEqual(res.success, false);
  });

  it('validates sample_size bounds', () => {
    const handler = new GetBulkDataHandler({} as any);
    const res = handler.validate({ data_type: 'opinions', sample_size: 100 });
    assert.strictEqual(res.success, false);
  });

  it('returns sample data with default sample_size', async () => {
    const handler = new GetBulkDataHandler({} as any);
    const result = await handler.execute({ data_type: 'opinions' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.data_type, 'opinions');
    assert.strictEqual(content.sample_size, 10);
    assert.ok(Array.isArray(content.data));
    assert.ok(content.message);
  });

  it('returns sample data with custom sample_size', async () => {
    const handler = new GetBulkDataHandler({} as any);
    const result = await handler.execute({ data_type: 'dockets', sample_size: 25 }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.sample_size, 25);
  });

  it('has correct metadata', () => {
    const handler = new GetBulkDataHandler({} as any);
    assert.strictEqual(handler.name, 'get_bulk_data');
    assert.strictEqual(handler.category, 'analytics');
  });
});

// ──────────────────────────────────────────────────
// GetBankruptcyDataHandler
// ──────────────────────────────────────────────────

describe('GetBankruptcyDataHandler', () => {
  it('validates with defaults (no required fields)', () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.data.page, 1);
      assert.strictEqual(res.data.page_size, 20);
    }
  });

  it('validates all optional fields', () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const res = handler.validate({
      court: 'nysb',
      case_name: 'Test Corp',
      docket_number: '22-12345',
      date_filed_after: '2022-01-01',
      date_filed_before: '2023-01-01',
      page: 2,
      page_size: 50,
    });
    assert.strictEqual(res.success, true);
  });

  it('rejects page_size > 100', () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const res = handler.validate({ page_size: 200 });
    assert.strictEqual(res.success, false);
  });

  it('rejects page < 1', () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const res = handler.validate({ page: 0 });
    assert.strictEqual(res.success, false);
  });

  it('returns bankruptcy data with all fields', async () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const result = await handler.execute(
      { court: 'nysb', case_name: 'Acme Corp', docket_number: '22-00001', page: 1, page_size: 20 },
      mockContext,
    );

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.court, 'nysb');
    assert.strictEqual(content.case_name, 'Acme Corp');
    assert.strictEqual(content.docket_number, '22-00001');
    assert.ok(content.message);
  });

  it('returns data with undefined optional fields', async () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    const result = await handler.execute({ page: 1, page_size: 20 }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.court, undefined);
    assert.strictEqual(content.case_name, undefined);
    assert.ok(content.message);
  });

  it('has correct metadata', () => {
    const handler = new GetBankruptcyDataHandler({} as any);
    assert.strictEqual(handler.name, 'get_bankruptcy_data');
    assert.strictEqual(handler.category, 'analytics');
  });
});

// ──────────────────────────────────────────────────
// GetComprehensiveJudgeProfileHandler
// ──────────────────────────────────────────────────

describe('GetComprehensiveJudgeProfileHandler', () => {
  it('validates judge_id as number', () => {
    const handler = new GetComprehensiveJudgeProfileHandler({} as any);
    const res = handler.validate({ judge_id: 42 });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.judge_id, 42);
  });

  it('validates judge_id as string (transforms to number)', () => {
    const handler = new GetComprehensiveJudgeProfileHandler({} as any);
    const res = handler.validate({ judge_id: '99' });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.judge_id, 99);
  });

  it('rejects missing judge_id', () => {
    const handler = new GetComprehensiveJudgeProfileHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('returns profile with analytics on success', async () => {
    const mockApi = {
      getJudge: async (id: any) => ({
        id,
        name_first: 'Ruth',
        name_last: 'Ginsburg',
        date_termination: null,
      }),
    } as any;

    const handler = new GetComprehensiveJudgeProfileHandler(mockApi);
    const result = await handler.execute({ judge_id: 100 }, mockContext);

    assert.strictEqual(result.isError, undefined);
    const content = JSON.parse(result.content[0].text);
    assert.ok(content.profile);
    assert.strictEqual(content.profile.name_first, 'Ruth');
    assert.ok(content.analytics);
    assert.strictEqual(content.analytics.opinions_authored, 150);
    assert.strictEqual(content.analytics.citations_received, 1200);
    assert.strictEqual(content.analytics.avg_opinion_length, 4500);
  });

  it('returns isError when API throws (404 scenario)', async () => {
    const mockApi = {
      getJudge: async () => {
        throw new Error('Judge not found');
      },
    } as any;

    const handler = new GetComprehensiveJudgeProfileHandler(mockApi);
    const result = await handler.execute({ judge_id: 99999 }, mockContext);

    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('Error fetching judge profile'));
    assert.ok(result.content[0].text.includes('Judge not found'));
  });

  it('returns isError for non-Error exceptions', async () => {
    const mockApi = {
      getJudge: async () => {
        throw 'string error';
      },
    } as any;

    const handler = new GetComprehensiveJudgeProfileHandler(mockApi);
    const result = await handler.execute({ judge_id: 1 }, mockContext);

    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('string error'));
  });

  it('has correct metadata', () => {
    const handler = new GetComprehensiveJudgeProfileHandler({} as any);
    assert.strictEqual(handler.name, 'get_comprehensive_judge_profile');
    assert.strictEqual(handler.category, 'analysis');
  });
});

// ──────────────────────────────────────────────────
// GetComprehensiveCaseAnalysisHandler
// ──────────────────────────────────────────────────

describe('GetComprehensiveCaseAnalysisHandler', () => {
  it('validates cluster_id as number', () => {
    const handler = new GetComprehensiveCaseAnalysisHandler({} as any);
    const res = handler.validate({ cluster_id: 200 });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.cluster_id, 200);
  });

  it('validates cluster_id as string (transforms to number)', () => {
    const handler = new GetComprehensiveCaseAnalysisHandler({} as any);
    const res = handler.validate({ cluster_id: '300' });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.cluster_id, 300);
  });

  it('rejects missing cluster_id', () => {
    const handler = new GetComprehensiveCaseAnalysisHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('returns case analysis on success', async () => {
    const mockApi = {
      getComprehensiveCaseAnalysis: async (id: any) => ({
        id,
        case_name: 'Roe v. Wade',
        docket_entries: 42,
        parties: ['Plaintiff', 'Defendant'],
      }),
    } as any;

    const handler = new GetComprehensiveCaseAnalysisHandler(mockApi);
    const result = await handler.execute({ cluster_id: 200 }, mockContext);

    assert.strictEqual(result.isError, undefined);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.case_name, 'Roe v. Wade');
    assert.strictEqual(content.docket_entries, 42);
  });

  it('returns error when API throws', async () => {
    const mockApi = {
      getComprehensiveCaseAnalysis: async () => {
        throw new Error('Case not found');
      },
    } as any;

    const handler = new GetComprehensiveCaseAnalysisHandler(mockApi);
    const result = await handler.execute({ cluster_id: 99999 }, mockContext);

    assert.strictEqual(result.isError, true);
  });

  it('has correct metadata', () => {
    const handler = new GetComprehensiveCaseAnalysisHandler({} as any);
    assert.strictEqual(handler.name, 'get_comprehensive_case_analysis');
    assert.strictEqual(handler.category, 'analysis');
  });
});

// ──────────────────────────────────────────────────
// GetFinancialDisclosureDetailsHandler
// ──────────────────────────────────────────────────

describe('GetFinancialDisclosureDetailsHandler', () => {
  it('validates disclosure_type enum', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    const res = handler.validate({ disclosure_type: 'investments' });
    assert.strictEqual(res.success, true);
  });

  it('rejects invalid disclosure_type', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    const res = handler.validate({ disclosure_type: 'stocks' });
    assert.strictEqual(res.success, false);
  });

  it('defaults page and page_size', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    const res = handler.validate({ disclosure_type: 'debts' });
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.data.page, 1);
      assert.strictEqual(res.data.page_size, 20);
    }
  });

  it('validates year bounds', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    const tooOld = handler.validate({ disclosure_type: 'gifts', year: 1800 });
    assert.strictEqual(tooOld.success, false);

    const futureYear = handler.validate({ disclosure_type: 'gifts', year: 3000 });
    assert.strictEqual(futureYear.success, false);
  });

  it('validates judge transforms to string', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    const res = handler.validate({ disclosure_type: 'investments', judge: 42 });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.judge, '42');
  });

  it('handles investments type', async () => {
    const mockApi = {
      getFinancialInvestments: async (params: any) => ({
        type: 'investments',
        count: 5,
        results: [],
      }),
    } as any;

    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'investments', page: 1, page_size: 20 },
      mockContext,
    );

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'investments');
  });

  it('handles debts type', async () => {
    const mockApi = { getFinancialDebts: async () => ({ type: 'debts' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'debts', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'debts');
  });

  it('handles gifts type', async () => {
    const mockApi = { getFinancialGifts: async () => ({ type: 'gifts' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'gifts', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'gifts');
  });

  it('handles agreements type', async () => {
    const mockApi = { getFinancialAgreements: async () => ({ type: 'agreements' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'agreements', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'agreements');
  });

  it('handles positions type', async () => {
    const mockApi = { getDisclosurePositions: async () => ({ type: 'positions' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'positions', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'positions');
  });

  it('handles reimbursements type', async () => {
    const mockApi = { getReimbursements: async () => ({ type: 'reimbursements' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'reimbursements', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'reimbursements');
  });

  it('handles spouse_incomes type', async () => {
    const mockApi = { getSpouseIncomes: async () => ({ type: 'spouse_incomes' }) } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'spouse_incomes', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'spouse_incomes');
  });

  it('handles non_investment_incomes type', async () => {
    const mockApi = {
      getNonInvestmentIncomes: async () => ({ type: 'non_investment_incomes' }),
    } as any;
    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'non_investment_incomes', page: 1, page_size: 20 },
      mockContext,
    );
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.type, 'non_investment_incomes');
  });

  it('passes extra params to API method', async () => {
    let capturedParams: any;
    const mockApi = {
      getFinancialInvestments: async (params: any) => {
        capturedParams = params;
        return { results: [] };
      },
    } as any;

    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    await handler.execute(
      { disclosure_type: 'investments', judge: '42', year: 2020, page: 2, page_size: 50 },
      mockContext,
    );

    assert.strictEqual(capturedParams.judge, '42');
    assert.strictEqual(capturedParams.year, 2020);
    assert.strictEqual(capturedParams.page, 2);
    assert.strictEqual(capturedParams.page_size, 50);
  });

  it('returns error when API fails', async () => {
    const mockApi = {
      getFinancialInvestments: async () => {
        throw new Error('Server error');
      },
    } as any;

    const handler = new GetFinancialDisclosureDetailsHandler(mockApi);
    const result = await handler.execute(
      { disclosure_type: 'investments', page: 1, page_size: 20 },
      mockContext,
    );

    assert.strictEqual(result.isError, true);
  });

  it('has correct metadata', () => {
    const handler = new GetFinancialDisclosureDetailsHandler({} as any);
    assert.strictEqual(handler.name, 'get_financial_disclosure_details');
    assert.strictEqual(handler.category, 'financial');
  });
});

// ──────────────────────────────────────────────────
// ValidateCitationsHandler
// ──────────────────────────────────────────────────

describe('ValidateCitationsHandler', () => {
  it('validates text is required', () => {
    const handler = new ValidateCitationsHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('validates text must be non-empty', () => {
    const handler = new ValidateCitationsHandler({} as any);
    const res = handler.validate({ text: '' });
    assert.strictEqual(res.success, false);
  });

  it('validates valid text input', () => {
    const handler = new ValidateCitationsHandler({} as any);
    const res = handler.validate({ text: 'See 410 U.S. 113' });
    assert.strictEqual(res.success, true);
  });

  it('returns validation result on success', async () => {
    const mockApi = {
      validateCitations: async (text: string) => ({
        valid: true,
        citations: [{ citation: '410 U.S. 113', found: true }],
      }),
    } as any;

    const handler = new ValidateCitationsHandler(mockApi);
    const result = await handler.execute({ text: 'See 410 U.S. 113' }, mockContext);

    assert.strictEqual(result.isError, undefined);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.valid, true);
    assert.strictEqual(content.citations.length, 1);
  });

  it('handles no citations found', async () => {
    const mockApi = {
      validateCitations: async () => ({ valid: false, citations: [] }),
    } as any;

    const handler = new ValidateCitationsHandler(mockApi);
    const result = await handler.execute({ text: 'No citations here' }, mockContext);

    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.valid, false);
    assert.deepStrictEqual(content.citations, []);
  });

  it('returns error when API fails', async () => {
    const mockApi = {
      validateCitations: async () => {
        throw new Error('Validation service unavailable');
      },
    } as any;

    const handler = new ValidateCitationsHandler(mockApi);
    const result = await handler.execute({ text: 'Test text' }, mockContext);

    assert.strictEqual(result.isError, true);
  });

  it('has correct metadata', () => {
    const handler = new ValidateCitationsHandler({} as any);
    assert.strictEqual(handler.name, 'validate_citations');
    assert.strictEqual(handler.category, 'analysis');
  });
});

// ──────────────────────────────────────────────────
// GetEnhancedRECAPDataHandler
// ──────────────────────────────────────────────────

describe('GetEnhancedRECAPDataHandler', () => {
  it('validates action enum', () => {
    const handler = new GetEnhancedRECAPDataHandler({} as any);
    for (const action of ['fetch', 'query', 'email'] as const) {
      const res = handler.validate({ action });
      assert.strictEqual(res.success, true);
    }
  });

  it('rejects invalid action', () => {
    const handler = new GetEnhancedRECAPDataHandler({} as any);
    const res = handler.validate({ action: 'delete' });
    assert.strictEqual(res.success, false);
  });

  it('rejects missing action', () => {
    const handler = new GetEnhancedRECAPDataHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('fetch action calls getRECAPFetch', async () => {
    let called = false;
    const mockApi = {
      getRECAPFetch: async (params: any) => {
        called = true;
        return { action: 'fetch', results: [{ id: 1 }] };
      },
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);
    const result = await handler.execute({ action: 'fetch' }, mockContext);

    assert.ok(called);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.action, 'fetch');
  });

  it('query action calls getRECAPQuery', async () => {
    let called = false;
    const mockApi = {
      getRECAPQuery: async () => {
        called = true;
        return { action: 'query', count: 10 };
      },
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);
    const result = await handler.execute({ action: 'query' }, mockContext);

    assert.ok(called);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.action, 'query');
  });

  it('email action calls getRECAPEmail', async () => {
    let called = false;
    const mockApi = {
      getRECAPEmail: async () => {
        called = true;
        return { action: 'email', sent: true };
      },
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);
    const result = await handler.execute({ action: 'email' }, mockContext);

    assert.ok(called);
    const content = JSON.parse(result.content[0].text);
    assert.strictEqual(content.action, 'email');
  });

  it('passes extra params through passthrough schema', async () => {
    let capturedParams: any;
    const mockApi = {
      getRECAPFetch: async (params: any) => {
        capturedParams = params;
        return {};
      },
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);
    await handler.execute({ action: 'fetch', docket_id: 123, court: 'scotus' } as any, mockContext);

    // passthrough schema allows extra keys; they get spread into params
    assert.strictEqual(capturedParams.docket_id, 123);
    assert.strictEqual(capturedParams.court, 'scotus');
  });

  it('returns error when API fails', async () => {
    const mockApi = {
      getRECAPFetch: async () => {
        throw new Error('RECAP service down');
      },
    } as any;

    const handler = new GetEnhancedRECAPDataHandler(mockApi);
    const result = await handler.execute({ action: 'fetch' }, mockContext);

    assert.strictEqual(result.isError, true);
  });

  it('has correct metadata', () => {
    const handler = new GetEnhancedRECAPDataHandler({} as any);
    assert.strictEqual(handler.name, 'get_enhanced_recap_data');
    assert.strictEqual(handler.category, 'dockets');
  });
});

// ──────────────────────────────────────────────────
// SmartSearchHandler
// ──────────────────────────────────────────────────

describe('SmartSearchHandler', () => {
  it('validates query is required', () => {
    const handler = new SmartSearchHandler({} as any);
    const res = handler.validate({});
    assert.strictEqual(res.success, false);
  });

  it('validates valid input with defaults', () => {
    const handler = new SmartSearchHandler({} as any);
    const res = handler.validate({ query: 'First Amendment cases' });
    assert.strictEqual(res.success, true);
    if (res.success) assert.strictEqual(res.data.max_results, 5);
  });

  it('validates max_results bounds', () => {
    const handler = new SmartSearchHandler({} as any);
    const tooLow = handler.validate({ query: 'test', max_results: 0 });
    assert.strictEqual(tooLow.success, false);

    const tooHigh = handler.validate({ query: 'test', max_results: 25 });
    assert.strictEqual(tooHigh.success, false);
  });

  it('returns error when sampling is not available', async () => {
    const handler = new SmartSearchHandler({} as any);
    const ctxNoSampling: ToolContext = { ...mockContext, sampling: undefined };
    const result = await handler.execute({ query: 'test query', max_results: 5 }, ctxNoSampling);

    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('Sampling is not enabled'));
  });

  it('executes search when sampling is available', async () => {
    const mockApi = {
      searchOpinions: async () => ({
        count: 2,
        results: [
          {
            case_name: 'Test v. Case',
            date_filed: '2023-01-01',
            court: 'scotus',
            citation_count: 10,
            absolute_url: '/opinion/1/',
          },
          {
            case_name: 'Another v. Case',
            date_filed: '2023-06-01',
            court: 'ca9',
            citation_count: 5,
            absolute_url: '/opinion/2/',
          },
        ],
      }),
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: {
          type: 'text',
          text: JSON.stringify({ q: 'first amendment', type: 'o', order_by: 'score desc' }),
        },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    const ctxWithSampling: ToolContext = {
      ...mockContext,
      sampling: mockSampling as any,
    };

    const result = await handler.execute(
      { query: 'First Amendment cases', max_results: 5 },
      ctxWithSampling,
    );

    assert.strictEqual(result.isError, undefined);
    assert.ok(result.content[0].text.includes('Smart Search Results'));
    assert.ok(result.content[0].text.includes('Test v. Case'));
  });

  it('limits results to max_results', async () => {
    const mockApi = {
      searchOpinions: async () => ({
        count: 3,
        results: [
          {
            case_name: 'A',
            date_filed: '2023-01-01',
            court: 'scotus',
            citation_count: 1,
            absolute_url: '/1/',
          },
          {
            case_name: 'B',
            date_filed: '2023-02-01',
            court: 'ca9',
            citation_count: 2,
            absolute_url: '/2/',
          },
          {
            case_name: 'C',
            date_filed: '2023-03-01',
            court: 'ca1',
            citation_count: 3,
            absolute_url: '/3/',
          },
        ],
      }),
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: { type: 'text', text: '{"q": "test"}' },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    const result = await handler.execute(
      { query: 'test', max_results: 2 },
      { ...mockContext, sampling: mockSampling as any },
    );

    assert.ok(result.content[0].text.includes('Showing top 2'));
    // Should not contain the third result
    assert.ok(!result.content[0].text.includes('case_name: C'));
  });

  it('falls back to simple search on JSON parse failure', async () => {
    let capturedParams: any;
    const mockApi = {
      searchOpinions: async (params: any) => {
        capturedParams = params;
        return { count: 0, results: [] };
      },
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: { type: 'text', text: 'not valid json at all' },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    await handler.execute(
      { query: 'fallback query', max_results: 5 },
      { ...mockContext, sampling: mockSampling as any },
    );

    // Fallback: uses the original query as q
    assert.strictEqual(capturedParams.q, 'fallback query');
  });

  it('strips markdown code blocks from sampling result', async () => {
    let capturedParams: any;
    const mockApi = {
      searchOpinions: async (params: any) => {
        capturedParams = params;
        return { count: 0, results: [] };
      },
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: {
          type: 'text',
          text: '```json\n{"q": "stripped query", "court": ["scotus"]}\n```',
        },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    await handler.execute(
      { query: 'test', max_results: 5 },
      { ...mockContext, sampling: mockSampling as any },
    );

    assert.strictEqual(capturedParams.q, 'stripped query');
    assert.deepStrictEqual(capturedParams.court, ['scotus']);
  });

  it('maps search params correctly from sampling', async () => {
    let capturedParams: any;
    const mockApi = {
      searchOpinions: async (params: any) => {
        capturedParams = params;
        return { count: 0, results: [] };
      },
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: {
          type: 'text',
          text: JSON.stringify({
            q: 'civil rights',
            type: 'o',
            order_by: 'dateFiled desc',
            court: ['ca9', 'ca2'],
            judge: 'Sotomayor',
            date_filed_after: '2020-01-01',
            date_filed_before: '2023-12-31',
            precedential_status: 'Precedential',
          }),
        },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    await handler.execute(
      { query: 'civil rights cases', max_results: 5 },
      { ...mockContext, sampling: mockSampling as any },
    );

    assert.strictEqual(capturedParams.q, 'civil rights');
    assert.strictEqual(capturedParams.type, 'o');
    assert.strictEqual(capturedParams.order_by, 'dateFiled desc');
    assert.deepStrictEqual(capturedParams.court, ['ca9', 'ca2']);
    assert.strictEqual(capturedParams.judge, 'Sotomayor');
    assert.strictEqual(capturedParams.date_filed_after, '2020-01-01');
    assert.strictEqual(capturedParams.date_filed_before, '2023-12-31');
    assert.strictEqual(capturedParams.status, 'Precedential');
  });

  it('handles non-text sampling content type', async () => {
    let capturedParams: any;
    const mockApi = {
      searchOpinions: async (params: any) => {
        capturedParams = params;
        return { count: 0, results: [] };
      },
    } as any;

    const mockSampling = {
      createMessage: async () => ({
        content: { type: 'image', data: 'base64data' },
      }),
    };

    const handler = new SmartSearchHandler(mockApi);
    await handler.execute(
      { query: 'image fallback', max_results: 5 },
      { ...mockContext, sampling: mockSampling as any },
    );

    // Falls back to using query as q since non-text content can't be parsed
    assert.strictEqual(capturedParams.q, 'image fallback');
  });

  it('has correct metadata', () => {
    const handler = new SmartSearchHandler({} as any);
    assert.strictEqual(handler.name, 'smart_search');
    assert.strictEqual(handler.category, 'enhanced');
  });
});
