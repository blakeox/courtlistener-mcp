/**
 * Search Domain Tool Handlers
 * Handles all search-related tools in the CourtListener system
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';

/**
 * Zod schemas for search handlers
 */
const searchOpinionsSchema = z
  .object({
    query: z.string().optional(),
    q: z.string().optional(),
    court: z.string().optional(),
    judge: z.string().optional(),
    dateAfter: z.string().optional(),
    dateBefore: z.string().optional(),
    date_filed_after: z.string().optional(),
    date_filed_before: z.string().optional(),
    orderBy: z.string().optional(),
    order_by: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((parsed) => ({
    query: parsed.query ?? parsed.q,
    court: parsed.court,
    judge: parsed.judge,
    date_filed_after: parsed.date_filed_after ?? parsed.dateAfter,
    date_filed_before: parsed.date_filed_before ?? parsed.dateBefore,
    order_by: parsed.order_by ?? parsed.orderBy ?? 'relevance',
    page: parsed.page ?? 1,
    page_size: parsed.page_size ?? parsed.pageSize ?? 20,
  }));

const advancedSearchSchema = z
  .object({
    type: z.enum(['o', 'r', 'p', 'oa']).default('o'),
    query: z.string().min(1).optional(),
    court: z.string().optional(),
    judge: z.string().optional(),
    case_name: z.string().optional(),
    citation: z.string().optional(),
    docket_number: z.string().optional(),
    date_filed_after: z.string().optional(),
    date_filed_before: z.string().optional(),
    precedential_status: z.string().optional(),
    cited_lt: z.number().optional(),
    cited_gt: z.number().optional(),
    status: z.string().optional(),
    nature_of_suit: z.string().optional(),
    order_by: z.string().optional(),
    page: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(100).optional().default(20),
  })
  .superRefine((value, ctx) => {
    const meaningfulKeys = [
      'query',
      'court',
      'judge',
      'case_name',
      'citation',
      'docket_number',
      'date_filed_after',
      'date_filed_before',
      'precedential_status',
      'cited_lt',
      'cited_gt',
      'status',
      'nature_of_suit',
    ] as const;

    const hasSearchInput = meaningfulKeys.some((key) => {
      const field = value[key];
      return field !== undefined && field !== null && field !== '';
    });

    if (!hasSearchInput) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one search parameter must be provided (e.g., query, court, citation).',
      });
    }
  });

const searchCasesSchema = z
  .object({
    query: z.string().optional(),
    q: z.string().optional(),
    court: z.string().optional(),
    judge: z.string().optional(),
    case_name: z.string().optional(),
    citation: z.string().optional(),
    date_filed_after: z.string().optional(),
    date_filed_before: z.string().optional(),
    precedential_status: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((parsed) => ({
    query: parsed.query ?? parsed.q,
    court: parsed.court,
    judge: parsed.judge,
    case_name: parsed.case_name,
    citation: parsed.citation,
    date_filed_after: parsed.date_filed_after,
    date_filed_before: parsed.date_filed_before,
    precedential_status: parsed.precedential_status,
    page: parsed.page ?? 1,
    page_size: parsed.page_size ?? parsed.pageSize ?? 20,
  }));

export class SearchOpinionsHandler extends TypedToolHandler<typeof searchOpinionsSchema> {
  readonly name = 'search_opinions';
  readonly description = 'Search for legal opinions with various filters and parameters';
  readonly category = 'search';
  protected readonly schema = searchOpinionsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof searchOpinionsSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Searching opinions', {
      query: input.query,
      page: input.page,
      requestId: context.requestId,
    });

    const searchParams: Record<string, unknown> = {
      page: input.page,
      page_size: input.page_size,
      order_by: input.order_by,
    };

    if (input.query) searchParams.q = input.query;
    if (input.court) searchParams.court = input.court;
    if (input.judge) searchParams.judge = input.judge;
    if (input.date_filed_after) searchParams.date_filed_after = input.date_filed_after;
    if (input.date_filed_before) searchParams.date_filed_before = input.date_filed_before;

    const response = await this.apiClient.searchOpinions(searchParams);

    return this.success({
      summary: `Found ${response.count ?? 0} opinions`,
      results: response.results,
      pagination: {
        page: input.page,
        totalPages: Math.ceil((response.count ?? 0) / input.page_size),
        totalCount: response.count ?? 0,
        pageSize: input.page_size,
      },
      search_parameters: {
        query: input.query,
        court: input.court,
        judge: input.judge,
        date_filed_after: input.date_filed_after,
        date_filed_before: input.date_filed_before,
        order_by: input.order_by,
      },
    });
  }
}

export class AdvancedSearchHandler extends TypedToolHandler<typeof advancedSearchSchema> {
  readonly name = 'advanced_search';
  readonly description = 'Execute advanced legal research queries with multi-parameter filtering';
  readonly category = 'search';
  protected readonly schema = advancedSearchSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof advancedSearchSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Performing advanced search', {
      requestId: context.requestId,
      type: input.type,
      hasQuery: Boolean(input.query),
    });

    const results = await this.apiClient.advancedSearch({
      ...input,
      page_size: input.page_size,
    });

    const searchTypeLabels: Record<string, string> = {
      o: 'Opinions',
      r: 'RECAP Documents',
      p: 'People & Judges',
      oa: 'Oral Arguments',
    };

    return this.success({
      search_type: searchTypeLabels[input.type] || 'Opinions',
      search_parameters: input,
      total_results: results.count ?? 0,
      results: results.results ?? results,
      advanced_features: {
        citation_filtering:
          input.cited_lt !== undefined || input.cited_gt !== undefined ? 'Applied' : 'Available',
        temporal_analysis:
          input.date_filed_after || input.date_filed_before ? 'Applied' : 'Available',
        jurisdictional_filtering: input.court ? 'Applied' : 'Available',
        procedural_filtering: input.status || input.nature_of_suit ? 'Applied' : 'Available',
      },
      research_recommendations: [
        'Use citation count filters to locate influential opinions.',
        'Apply filing date windows to analyze trends across time.',
        'Combine jurisdiction and status filters for precise dockets.',
        'Leverage multi-type searches to assemble comprehensive briefs.',
      ],
    });
  }
}

export class SearchCasesHandler extends TypedToolHandler<typeof searchCasesSchema> {
  readonly name = 'search_cases';
  readonly description = 'Search for legal cases and dockets';
  readonly category = 'search';
  protected readonly schema = searchCasesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  async execute(
    input: z.infer<typeof searchCasesSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    try {
      context.logger.info('Searching cases', {
        query: input.query,
        requestId: context.requestId,
      });

      const searchParams: Record<string, unknown> = {
        page: input.page,
        page_size: input.page_size,
      };

      if (input.query) searchParams.q = input.query;
      if (input.court) searchParams.court = input.court;
      if (input.judge) searchParams.judge = input.judge;
      if (input.case_name) searchParams.case_name = input.case_name;
      if (input.citation) searchParams.citation = input.citation;
      if (input.date_filed_after) searchParams.date_filed_after = input.date_filed_after;
      if (input.date_filed_before) searchParams.date_filed_before = input.date_filed_before;
      if (input.precedential_status) searchParams.precedential_status = input.precedential_status;

      const response = await this.apiClient.searchCases(searchParams);

      return this.success({
        summary: `Found ${response.count ?? 0} cases`,
        results: response.results,
        pagination: {
          page: input.page,
          totalPages: Math.ceil((response.count ?? 0) / input.page_size),
          totalCount: response.count ?? 0,
          page_size: input.page_size,
        },
        search_parameters: {
          query: input.query,
          court: input.court,
          judge: input.judge,
          case_name: input.case_name,
          citation: input.citation,
          date_filed_after: input.date_filed_after,
          date_filed_before: input.date_filed_before,
          precedential_status: input.precedential_status,
        },
      });
    } catch (error) {
      context.logger.error('Case search failed', error as Error, {
        query: input.query,
        requestId: context.requestId,
      });

      return this.error('Failed to search cases', { message: (error as Error).message });
    }
  }
}
