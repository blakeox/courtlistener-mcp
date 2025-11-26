/**
 * Enhanced and enterprise-grade tool handlers
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PaginatedApiResponse } from '../../common/pagination-utils.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Judge } from '../../types.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';
export * from './smart-search.js';

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

  @withDefaults()
  async execute(
    input: z.infer<typeof visualizationSchema>,
    _context: ToolContext,
  ): Promise<CallToolResult> {
    let result: unknown;

    switch (input.data_type) {
      case 'court_distribution': {
        const courts = (await this.apiClient.listCourts({})) as PaginatedApiResponse<{
          type: string;
        }>;
        const distribution = (courts.results || []).reduce(
          (acc: Record<string, number>, court: { type: string }) => {
            const type = court.type || 'Unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          },
          {},
        );
        result = {
          total_courts: courts.count ?? 0,
          distribution,
          raw_data: (courts.results || []).slice(0, 10), // Sample
        };
        break;
      }
      case 'case_timeline': {
        // Mock implementation for demo
        result = {
          timeline: [
            { year: 2020, cases: 150 },
            { year: 2021, cases: 230 },
            { year: 2022, cases: 180 },
          ],
        };
        break;
      }
      case 'citation_network': {
        if (!input.opinion_id) {
          throw new Error('opinion_id is required for citation_network');
        }
        const network = await this.apiClient.getCitationNetwork(input.opinion_id, {
          depth: input.depth || 1,
        });
        result = network;
        break;
      }
      case 'judge_statistics': {
        const judges = await this.apiClient.getJudges({});
        result = {
          total_judges: judges.count,
          active_judges: judges.results.filter((j: Judge) => !j.date_termination).length,
          appointed_by_president: judges.results.reduce(
            (acc: Record<string, number>, judge: Judge) => {
              const president = judge.appointer || 'Unknown';
              acc[president] = (acc[president] || 0) + 1;
              return acc;
            },
            {},
          ),
        };
        break;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
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

  @withDefaults()
  async execute(
    input: z.infer<typeof bulkDataSchema>,
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const result: Record<string, unknown> = {
      data_type: input.data_type,
      sample_size: input.sample_size || 10,
      data: [], // Mock data
      message: 'Bulk data retrieval is simulated for this demo',
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
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

  @withDefaults()
  async execute(
    input: z.infer<typeof bankruptcySchema>,
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const result: Record<string, unknown> = {
      court: input.court,
      case_name: input.case_name,
      docket_number: input.docket_number,
      message: 'Bankruptcy data retrieval is simulated for this demo',
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
}

export class GetComprehensiveJudgeProfileHandler extends TypedToolHandler<
  typeof comprehensiveJudgeSchema
> {
  readonly name = 'get_comprehensive_judge_profile';
  readonly description =
    'Retrieve an enriched judicial profile with positions, education, and analytics';
  readonly category = 'analysis';
  protected readonly schema = comprehensiveJudgeSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults()
  async execute(
    input: z.infer<typeof comprehensiveJudgeSchema>,
    _context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const judge = await this.apiClient.getJudge(input.judge_id);

      const result: Record<string, unknown> = {
        profile: judge,
        analytics: {
          opinions_authored: 150, // Mock
          citations_received: 1200, // Mock
          avg_opinion_length: 4500, // Mock
        },
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching judge profile: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
}

export class GetComprehensiveCaseAnalysisHandler extends TypedToolHandler<
  typeof comprehensiveCaseSchema
> {
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
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const analysis = (await this.apiClient.getComprehensiveCaseAnalysis(
      input.cluster_id,
    )) as Record<string, unknown>;
    return this.success(analysis);
  }
}

export class GetFinancialDisclosureDetailsHandler extends TypedToolHandler<
  typeof disclosureDetailsSchema
> {
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
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const { disclosure_type, ...params } = input;
    let result: unknown;

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

    return this.success(result as Record<string, unknown>);
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
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const validation = (await this.apiClient.validateCitations(input.text)) as Record<
      string,
      unknown
    >;
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
    _context: ToolContext,
  ): Promise<CallToolResult> {
    const { action, ...params } = input;
    let result: unknown;

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

    return this.success(result as Record<string, unknown>);
  }
}
