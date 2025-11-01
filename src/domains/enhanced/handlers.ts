/**
 * Enhanced and enterprise-grade tool handlers
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failure, Result, success } from '../../common/types.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TimingContext } from '../../infrastructure/logger.js';
import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';

const visualizationSchema = z
  .object({
    data_type: z.enum([
      'court_distribution',
      'case_timeline',
      'citation_network',
      'judge_statistics',
    ]),
    opinion_id: z
      .union([z.string(), z.number()])
      .transform((value) => Number(value))
      .optional(),
    depth: z.number().int().min(1).max(5).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    court_id: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.data_type === 'citation_network' &&
      (value.opinion_id === undefined || Number.isNaN(value.opinion_id))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'opinion_id is required for citation_network visualizations',
      });
    }
  });

const bulkDataSchema = z.object({
  data_type: z.string().min(1),
  sample_size: z.number().int().min(1).max(50).optional(),
});

const bankruptcySchema = z.object({
  court: z.string().optional(),
  case_name: z.string().optional(),
  docket_number: z.string().optional(),
  date_filed_after: z.string().optional(),
  date_filed_before: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(100).optional().default(20),
});

const comprehensiveJudgeSchema = z.object({
  judge_id: z.union([z.string(), z.number()]).transform((value) => Number(value)),
});

const comprehensiveCaseSchema = z.object({
  cluster_id: z.union([z.string(), z.number()]).transform((value) => Number(value)),
});

const disclosureDetailsSchema = z
  .object({
    disclosure_type: z.enum([
      'investments',
      'debts',
      'gifts',
      'agreements',
      'positions',
      'reimbursements',
      'spouse_incomes',
      'non_investment_incomes',
    ]),
    judge: z
      .union([z.string(), z.number()])
      .transform((value) => String(value))
      .optional(),
    year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
    page: z.number().int().min(1).optional().default(1),
    page_size: z.number().int().min(1).max(100).optional().default(20),
  })
  .passthrough();

const validateCitationsSchema = z.object({
  text: z.string().min(1),
});

const enhancedRecapSchema = z
  .object({
    action: z.enum(['fetch', 'query', 'email']),
  })
  .passthrough();

function recordSuccess(context: ToolContext, timer: TimingContext, fromCache: boolean) {
  const duration = timer.end(true, { cacheHit: fromCache });
  context.metrics?.recordRequest(duration, fromCache);
}

function recordFailure(context: ToolContext, timer: TimingContext, error: Error) {
  const duration = timer.endWithError(error);
  context.metrics?.recordFailure(duration);
}

export class GetVisualizationDataHandler extends BaseToolHandler {
  readonly name = 'get_visualization_data';
  readonly description = 'Generate visualization-ready legal analytics datasets';
  readonly category = 'analytics';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(visualizationSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          enum: ['court_distribution', 'case_timeline', 'citation_network', 'judge_statistics'],
          description: 'Visualization type to generate',
        },
        opinion_id: {
          type: ['string', 'number'],
          description: 'Opinion ID required for citation network data',
        },
        depth: {
          type: 'number',
          minimum: 1,
          maximum: 5,
          description: 'Depth for network traversal (citation_network only)',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 200,
          description: 'Limit for judge statistics (judge_statistics only)',
          default: 50,
        },
        start_date: {
          type: 'string',
          description: 'Start date for timeline visualizations (YYYY-MM-DD)',
        },
        end_date: {
          type: 'string',
          description: 'End date for timeline visualizations (YYYY-MM-DD)',
        },
        court_id: {
          type: 'string',
          description: 'Court identifier for timeline visualizations',
        },
      },
      required: ['data_type'],
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof visualizationSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_visualization_data');

    try {
      const cacheKey = 'visualization_data';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        context.logger.info('Visualization data served from cache', {
          dataType: input.data_type,
          requestId: context.requestId,
        });
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      context.logger.info('Generating visualization dataset', {
        dataType: input.data_type,
        requestId: context.requestId,
      });

      let result: any;
      switch (input.data_type) {
        case 'court_distribution':
          result = await this.generateCourtDistribution();
          break;
        case 'case_timeline':
          result = this.generateCaseTimeline(input);
          break;
        case 'citation_network':
          result = await this.generateCitationNetwork(input);
          break;
        case 'judge_statistics':
          result = await this.generateJudgeStatistics(input);
          break;
        default:
          throw new Error(`Unsupported visualization type: ${input.data_type}`);
      }

      context.cache?.set(cacheKey, input, result, 3600);
      recordSuccess(context, timer, false);
      return this.success(result);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to generate visualization data', error as Error, {
        dataType: input.data_type,
        requestId: context.requestId,
      });
      return this.error('Failed to generate visualization data', {
        message: (error as Error).message,
      });
    }
  }

  private async generateCourtDistribution() {
    const courts = await this.apiClient.getCourts({ in_use: true });

    const distribution = courts.results.reduce(
      (acc: Record<string, number>, court: any) => {
        const jurisdiction = court.jurisdiction || 'Unknown';
        acc[jurisdiction] = (acc[jurisdiction] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      type: 'court_distribution',
      data: distribution,
      chart_type: 'pie',
      total_courts: courts.count,
    };
  }

  private generateCaseTimeline(input: z.infer<typeof visualizationSchema>) {
    return {
      type: 'case_timeline',
      data: {
        message: 'Timeline generation requires specific date range and case criteria',
        required_params: ['start_date', 'end_date', 'court_id'],
        provided: {
          start_date: input.start_date || null,
          end_date: input.end_date || null,
          court_id: input.court_id || null,
        },
      },
      chart_type: 'timeline',
    };
  }

  private async generateCitationNetwork(input: z.infer<typeof visualizationSchema>) {
    const network = await this.apiClient.getCitationNetwork(input.opinion_id!, {
      depth: input.depth || 2,
    });

    return {
      type: 'citation_network',
      data: network,
      chart_type: 'network_graph',
      center_opinion: input.opinion_id,
    };
  }

  private async generateJudgeStatistics(input: z.infer<typeof visualizationSchema>) {
    const judges = await this.apiClient.getJudges({
      page_size: input.limit || 50,
    });

    return {
      type: 'judge_statistics',
      data: {
        total_judges: judges.count,
        active_judges: judges.results.filter((j: any) => j.date_termination === null).length,
        by_court: judges.results.reduce(
          (acc: Record<string, number>, judge: any) => {
            const court = judge.court || 'Unknown';
            acc[court] = (acc[court] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      chart_type: 'bar',
    };
  }
}

export class GetBulkDataHandler extends BaseToolHandler {
  readonly name = 'get_bulk_data';
  readonly description = 'Provide guidance and samples for CourtListener bulk data access';
  readonly category = 'analytics';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(bulkDataSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        data_type: {
          type: 'string',
          description: 'Type of bulk data requested ("sample" returns a demonstration payload)',
        },
        sample_size: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Sample size when requesting sample data',
          default: 10,
        },
      },
      required: ['data_type'],
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof bulkDataSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_bulk_data');

    try {
      const result: Record<string, any> = {
        data_type: input.data_type,
        status: 'bulk_data_available',
        message: "Bulk data access is provided through CourtListener's official bulk data API",
        available_formats: ['JSON', 'CSV', 'XML'],
        recommended_approach: "Use CourtListener's official bulk data downloads",
        bulk_data_url: 'https://www.courtlistener.com/help/api/bulk-data/',
        note: 'For large datasets, consider using pagination parameters in regular API calls',
      };

      if (input.data_type === 'sample') {
        const sampleCases = await this.apiClient.searchOpinions({
          page_size: Math.min(input.sample_size ?? 10, 50),
        });

        result.sample_data = {
          type: 'opinion_clusters',
          count: sampleCases.results?.length || 0,
          data: sampleCases.results?.slice(0, 5) || [],
        };
      }

      recordSuccess(context, timer, false);
      return this.success(result);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to prepare bulk data guidance', error as Error, {
        requestId: context.requestId,
      });
      return this.error('Failed to provide bulk data guidance', {
        message: (error as Error).message,
      });
    }
  }
}

export class GetBankruptcyDataHandler extends BaseToolHandler {
  readonly name = 'get_bankruptcy_data';
  readonly description = 'Retrieve bankruptcy-related docket data with contextual insights';
  readonly category = 'analytics';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(bankruptcySchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        court: { type: 'string', description: 'Specific court identifier to filter by' },
        case_name: { type: 'string', description: 'Filter by case name keywords' },
        docket_number: { type: 'string', description: 'Filter by docket number' },
        date_filed_after: {
          type: 'string',
          description: 'Return cases filed after this date (YYYY-MM-DD)',
        },
        date_filed_before: {
          type: 'string',
          description: 'Return cases filed before this date (YYYY-MM-DD)',
        },
        page: { type: 'number', minimum: 1, description: 'Page number for pagination', default: 1 },
        page_size: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Number of results per page',
          default: 20,
        },
      },
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof bankruptcySchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_bankruptcy_data');

    try {
      const params = Object.fromEntries(
        Object.entries(input).filter(([_, value]) => value !== undefined && value !== null),
      );

      const cacheKey = 'bankruptcy_data';
      const cached = context.cache?.get<any>(cacheKey, params);
      if (cached) {
        context.logger.info('Bankruptcy data served from cache', {
          requestId: context.requestId,
        });
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      context.logger.info('Fetching bankruptcy dockets', {
        requestId: context.requestId,
        filters: params,
      });

      const bankruptcyDockets = await this.apiClient.getDockets({
        ...params,
        court__jurisdiction: 'FB',
      });

      const result = {
        search_params: params,
        bankruptcy_cases: bankruptcyDockets,
        pagination: {
          page: params.page ?? 1,
          page_size: params.page_size ?? 20,
          total_results: bankruptcyDockets.count || 0,
        },
        data_notes: [
          'Bankruptcy data includes cases from U.S. Bankruptcy Courts',
          'Use specific court codes for targeted searches',
          'RECAP documents may be available for detailed case information',
        ],
      };

      context.cache?.set(cacheKey, params, result, 1800);
      recordSuccess(context, timer, false);
      return this.success(result);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to fetch bankruptcy data', error as Error, {
        requestId: context.requestId,
      });
      return this.error('Failed to fetch bankruptcy data', {
        message: (error as Error).message,
      });
    }
  }
}

export class GetComprehensiveJudgeProfileHandler extends BaseToolHandler {
  readonly name = 'get_comprehensive_judge_profile';
  readonly description =
    'Retrieve an enriched judicial profile with positions, education, and analytics';
  readonly category = 'analysis';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(comprehensiveJudgeSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        judge_id: {
          type: ['string', 'number'],
          description: 'Judge identifier to retrieve a comprehensive profile for',
        },
      },
      required: ['judge_id'],
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof comprehensiveJudgeSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_comprehensive_judge_profile');

    try {
      const cacheKey = 'comprehensive_judge_profile';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      const profile = await this.apiClient.getComprehensiveJudgeProfile(input.judge_id);
      context.cache?.set(cacheKey, input, profile, 86400);
      recordSuccess(context, timer, false);
      return this.success(profile);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to fetch comprehensive judge profile', error as Error, {
        judgeId: input.judge_id,
        requestId: context.requestId,
      });
      return this.error('Failed to fetch comprehensive judge profile', {
        message: (error as Error).message,
      });
    }
  }
}

export class GetComprehensiveCaseAnalysisHandler extends BaseToolHandler {
  readonly name = 'get_comprehensive_case_analysis';
  readonly description =
    'Retrieve an enriched case analysis including docket entries, parties, and tags';
  readonly category = 'analysis';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(comprehensiveCaseSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        cluster_id: {
          type: ['string', 'number'],
          description: 'Case cluster ID to analyze',
        },
      },
      required: ['cluster_id'],
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof comprehensiveCaseSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_comprehensive_case_analysis');

    try {
      const cacheKey = 'comprehensive_case_analysis';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      const analysis = await this.apiClient.getComprehensiveCaseAnalysis(input.cluster_id);
      context.cache?.set(cacheKey, input, analysis, 3600);
      recordSuccess(context, timer, false);
      return this.success(analysis);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to fetch comprehensive case analysis', error as Error, {
        clusterId: input.cluster_id,
        requestId: context.requestId,
      });
      return this.error('Failed to fetch comprehensive case analysis', {
        message: (error as Error).message,
      });
    }
  }
}

export class GetFinancialDisclosureDetailsHandler extends BaseToolHandler {
  readonly name = 'get_financial_disclosure_details';
  readonly description = 'Retrieve detailed financial disclosure data across multiple categories';
  readonly category = 'financial';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(disclosureDetailsSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        disclosure_type: {
          type: 'string',
          enum: [
            'investments',
            'debts',
            'gifts',
            'agreements',
            'positions',
            'reimbursements',
            'spouse_incomes',
            'non_investment_incomes',
          ],
          description: 'Category of financial disclosure data to retrieve',
        },
        judge: {
          type: ['string', 'number'],
          description: 'Filter by judge identifier',
        },
        year: {
          type: 'number',
          description: 'Filter disclosures by year',
        },
        page: {
          type: 'number',
          minimum: 1,
          description: 'Page number for pagination',
          default: 1,
        },
        page_size: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Number of results per page',
          default: 20,
        },
      },
      required: ['disclosure_type'],
      additionalProperties: true,
    };
  }

  async execute(
    input: z.infer<typeof disclosureDetailsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_financial_disclosure_details');

    try {
      const cacheKey = 'financial_disclosure_details';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      const { disclosure_type, ...params } = input;
      let result: any;

      switch (disclosure_type) {
        case 'investments':
          result = await this.apiClient.getFinancialInvestments(params);
          break;
        case 'debts':
          result = await this.apiClient.getFinancialDebts(params);
          break;
        case 'gifts':
          result = await this.apiClient.getFinancialGifts(params);
          break;
        case 'agreements':
          result = await this.apiClient.getFinancialAgreements(params);
          break;
        case 'positions':
          result = await this.apiClient.getDisclosurePositions(params);
          break;
        case 'reimbursements':
          result = await this.apiClient.getReimbursements(params);
          break;
        case 'spouse_incomes':
          result = await this.apiClient.getSpouseIncomes(params);
          break;
        case 'non_investment_incomes':
          result = await this.apiClient.getNonInvestmentIncomes(params);
          break;
        default:
          throw new Error(`Unknown disclosure type: ${disclosure_type}`);
      }

      context.cache?.set(cacheKey, input, result, 3600);
      recordSuccess(context, timer, false);
      return this.success(result);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to get financial disclosure details', error as Error, {
        requestId: context.requestId,
      });
      return this.error('Failed to get financial disclosure details', {
        message: (error as Error).message,
      });
    }
  }
}

export class ValidateCitationsHandler extends BaseToolHandler {
  readonly name = 'validate_citations';
  readonly description = 'Validate legal citations within a body of text';
  readonly category = 'analysis';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(validateCitationsSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text containing legal citations to validate',
        },
      },
      required: ['text'],
      additionalProperties: false,
    };
  }

  async execute(
    input: z.infer<typeof validateCitationsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('validate_citations');

    try {
      const cacheKey = 'validate_citations';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      const validation = await this.apiClient.validateCitations(input.text);
      context.cache?.set(cacheKey, input, validation, 1800);
      recordSuccess(context, timer, false);
      return this.success(validation);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to validate citations', error as Error, {
        requestId: context.requestId,
      });
      return this.error('Failed to validate citations', {
        message: (error as Error).message,
      });
    }
  }
}

export class GetEnhancedRECAPDataHandler extends BaseToolHandler {
  readonly name = 'get_enhanced_recap_data';
  readonly description = 'Access advanced RECAP datasets and utilities';
  readonly category = 'dockets';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      return success(enhancedRecapSchema.parse(input ?? {}));
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['fetch', 'query', 'email'],
          description: 'RECAP action to perform',
        },
      },
      required: ['action'],
      additionalProperties: true,
    };
  }

  async execute(
    input: z.infer<typeof enhancedRecapSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const timer = context.logger.startTimer('get_enhanced_recap_data');

    try {
      const cacheKey = 'enhanced_recap_data';
      const cached = context.cache?.get<any>(cacheKey, input);
      if (cached) {
        recordSuccess(context, timer, true);
        return this.success(cached);
      }

      const { action, ...params } = input;
      let result: any;

      switch (action) {
        case 'fetch':
          result = await this.apiClient.getRECAPFetch(params);
          break;
        case 'query':
          result = await this.apiClient.getRECAPQuery(params);
          break;
        case 'email':
          result = await this.apiClient.getRECAPEmail(params);
          break;
        default:
          throw new Error(`Unknown RECAP action: ${action}`);
      }

      context.cache?.set(cacheKey, input, result, 1800);
      recordSuccess(context, timer, false);
      return this.success(result);
    } catch (error) {
      recordFailure(context, timer, error as Error);
      context.logger.error('Failed to retrieve enhanced RECAP data', error as Error, {
        requestId: context.requestId,
        action: input.action,
      });
      return this.error('Failed to retrieve enhanced RECAP data', {
        message: (error as Error).message,
      });
    }
  }
}
