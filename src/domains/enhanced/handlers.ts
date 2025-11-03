/**
 * Enhanced and enterprise-grade tool handlers
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';
import { createPaginationInfo } from '../../common/pagination-utils.js';

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

// Helper functions removed - now handled by @withDefaults decorator!

export class GetVisualizationDataHandler extends TypedToolHandler<typeof visualizationSchema> {
  readonly name = 'get_visualization_data';
  readonly description = 'Generate visualization-ready legal analytics datasets';
  readonly category = 'analytics';
  protected readonly schema = visualizationSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof visualizationSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
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

    return this.success(result);
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

export class GetBulkDataHandler extends TypedToolHandler<typeof bulkDataSchema> {
  readonly name = 'get_bulk_data';
  readonly description = 'Provide guidance and samples for CourtListener bulk data access';
  readonly category = 'analytics';
  protected readonly schema = bulkDataSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 7200 } })
  async execute(
    input: z.infer<typeof bulkDataSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
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

    return this.success(result);
  }
}

export class GetBankruptcyDataHandler extends TypedToolHandler<typeof bankruptcySchema> {
  readonly name = 'get_bankruptcy_data';
  readonly description = 'Retrieve bankruptcy-related docket data with contextual insights';
  readonly category = 'analytics';
  protected readonly schema = bankruptcySchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof bankruptcySchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const params = Object.fromEntries(
      Object.entries(input).filter(([_, value]) => value !== undefined && value !== null),
    );

    context.logger.info('Fetching bankruptcy dockets', {
      requestId: context.requestId,
      filters: params,
    });

    const bankruptcyDockets = await this.apiClient.getDockets({
      ...params,
      court__jurisdiction: 'FB',
    });

    return this.success({
      search_params: params,
      bankruptcy_cases: bankruptcyDockets,
      pagination: createPaginationInfo(bankruptcyDockets, Number(params.page ?? 1), Number(params.page_size ?? 20)),
      data_notes: [
        'Bankruptcy data includes cases from U.S. Bankruptcy Courts',
        'Use specific court codes for targeted searches',
        'RECAP documents may be available for detailed case information',
      ],
    });
  }
}

export class GetComprehensiveJudgeProfileHandler extends TypedToolHandler<typeof comprehensiveJudgeSchema> {
  readonly name = 'get_comprehensive_judge_profile';
  readonly description =
    'Retrieve an enriched judicial profile with positions, education, and analytics';
  readonly category = 'analysis';
  protected readonly schema = comprehensiveJudgeSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 86400 } })
  async execute(
    input: z.infer<typeof comprehensiveJudgeSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const profile = await this.apiClient.getComprehensiveJudgeProfile(input.judge_id);
    return this.success(profile);
  }
}

export class GetComprehensiveCaseAnalysisHandler extends TypedToolHandler<typeof comprehensiveCaseSchema> {
  readonly name = 'get_comprehensive_case_analysis';
  readonly description =
    'Retrieve an enriched case analysis including docket entries, parties, and tags';
  readonly category = 'analysis';
  protected readonly schema = comprehensiveCaseSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof comprehensiveCaseSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const analysis = await this.apiClient.getComprehensiveCaseAnalysis(input.cluster_id);
    return this.success(analysis);
  }
}

export class GetFinancialDisclosureDetailsHandler extends TypedToolHandler<typeof disclosureDetailsSchema> {
  readonly name = 'get_financial_disclosure_details';
  readonly description = 'Retrieve detailed financial disclosure data across multiple categories';
  readonly category = 'financial';
  protected readonly schema = disclosureDetailsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof disclosureDetailsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
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

    return this.success(result);
  }
}

export class ValidateCitationsHandler extends TypedToolHandler<typeof validateCitationsSchema> {
  readonly name = 'validate_citations';
  readonly description = 'Validate legal citations within a body of text';
  readonly category = 'analysis';
  protected readonly schema = validateCitationsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof validateCitationsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const validation = await this.apiClient.validateCitations(input.text);
    return this.success(validation);
  }
}

export class GetEnhancedRECAPDataHandler extends TypedToolHandler<typeof enhancedRecapSchema> {
  readonly name = 'get_enhanced_recap_data';
  readonly description = 'Access advanced RECAP datasets and utilities';
  readonly category = 'dockets';
  protected readonly schema = enhancedRecapSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof enhancedRecapSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
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

    return this.success(result);
  }
}
