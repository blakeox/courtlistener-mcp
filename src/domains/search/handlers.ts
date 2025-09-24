/**
 * Search Domain Tool Handlers
 * Handles all search-related tools in the CourtListener system
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { failure, Result, success } from '../../common/types.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';

export class SearchOpinionsHandler extends BaseToolHandler {
  readonly name = 'search_opinions';
  readonly description = 'Search for legal opinions with various filters and parameters';
  readonly category = 'search';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    if (!input || typeof input !== 'object') {
      return failure(new Error('Input must be an object'));
    }

    // Validate required or common parameters
    const validatedInput = {
      q: input.q || '',
      page: Math.max(1, parseInt(input.page) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(input.pageSize) || 20)),
      court: input.court || undefined,
      judge: input.judge || undefined,
      dateAfter: input.dateAfter || undefined,
      dateBefore: input.dateBefore || undefined,
      orderBy: input.orderBy || 'relevance',
    };

    return success(validatedInput);
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Searching opinions', {
        query: input.q,
        page: input.page,
        requestId: context.requestId,
      });

      const response = await this.apiClient.searchOpinions(input);

      return this.success({
        summary: `Found ${response.count ?? 0} opinions`,
        results: response.results,
        pagination: {
          page: input.page,
          totalPages: Math.ceil((response.count ?? 0) / input.pageSize),
          totalCount: response.count ?? 0,
        },
      });
    } catch (error) {
      context.logger.error('Opinion search failed', error as Error, {
        query: input.q,
        requestId: context.requestId,
      });

      return this.error('Failed to search opinions', { message: (error as Error).message });
    }
  }

  getSchema() {
    return {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query for opinions',
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          minimum: 1,
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (default: 20, max: 100)',
          minimum: 1,
          maximum: 100,
        },
        court: {
          type: 'string',
          description: 'Filter by court identifier',
        },
        judge: {
          type: 'string',
          description: 'Filter by judge name',
        },
        dateAfter: {
          type: 'string',
          description: 'Filter opinions after this date (YYYY-MM-DD)',
        },
        dateBefore: {
          type: 'string',
          description: 'Filter opinions before this date (YYYY-MM-DD)',
        },
        orderBy: {
          type: 'string',
          enum: ['relevance', 'date', 'name'],
          description: 'Sort order (default: relevance)',
        },
      },
    };
  }
}

export class AdvancedSearchHandler extends BaseToolHandler {
  readonly name = 'advanced_search';
  readonly description = 'Execute advanced legal research queries with multi-parameter filtering';
  readonly category = 'search';

  private static readonly schema = z
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

      const hasSearchInput = meaningfulKeys.some(key => {
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

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const parsed = AdvancedSearchHandler.schema.parse(input || {});
      return success(parsed);
    } catch (error) {
      return failure(error as Error);
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['o', 'r', 'p', 'oa'],
          description: 'Search index type: opinions (o), RECAP documents (r), people/judges (p), oral arguments (oa)',
          default: 'o',
        },
        query: {
          type: 'string',
          description: 'Primary keyword search across case metadata',
        },
        court: {
          type: 'string',
          description: 'Filter results to a specific court ID',
        },
        judge: {
          type: 'string',
          description: 'Filter by judge name',
        },
        case_name: {
          type: 'string',
          description: 'Search by case caption',
        },
        citation: {
          type: 'string',
          description: 'Match a particular citation value',
        },
        docket_number: {
          type: 'string',
          description: 'Search by docket number',
        },
        date_filed_after: {
          type: 'string',
          description: 'Filter by filing date lower bound (YYYY-MM-DD)',
        },
        date_filed_before: {
          type: 'string',
          description: 'Filter by filing date upper bound (YYYY-MM-DD)',
        },
        precedential_status: {
          type: 'string',
          description: 'Restrict to a specific precedential status',
        },
        cited_lt: {
          type: 'number',
          description: 'Return results cited fewer than this count',
        },
        cited_gt: {
          type: 'number',
          description: 'Return results cited more than this count',
        },
        status: {
          type: 'string',
          description: 'Filter docket status (e.g., open, closed)',
        },
        nature_of_suit: {
          type: 'string',
          description: 'Filter by nature of suit classification',
        },
        order_by: {
          type: 'string',
          description: 'Sort results by the supplied field',
        },
        page: {
          type: 'number',
          minimum: 1,
          description: 'Page number for pagination',
        },
        page_size: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Number of results per page (max 100)',
          default: 20,
        },
      },
      additionalProperties: false,
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    const cacheKey = 'advanced_search';
    const cached = context.cache?.get<any>(cacheKey, input);
    if (cached) {
      context.logger.info('Advanced search served from cache', {
        requestId: context.requestId,
        searchType: input.type,
      });
      return this.success(cached);
    }

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

    const responseData = {
      search_type: searchTypeLabels[input.type] || 'Opinions',
      search_parameters: input,
      total_results: results.count ?? 0,
      results: results.results ?? results,
      advanced_features: {
        citation_filtering: input.cited_lt !== undefined || input.cited_gt !== undefined ? 'Applied' : 'Available',
        temporal_analysis: input.date_filed_after || input.date_filed_before ? 'Applied' : 'Available',
        jurisdictional_filtering: input.court ? 'Applied' : 'Available',
        procedural_filtering: input.status || input.nature_of_suit ? 'Applied' : 'Available',
      },
      research_recommendations: [
        'Use citation count filters to locate influential opinions.',
        'Apply filing date windows to analyze trends across time.',
        'Combine jurisdiction and status filters for precise dockets.',
        'Leverage multi-type searches to assemble comprehensive briefs.',
      ],
    };

    context.cache?.set(cacheKey, input, responseData, 3600);

    return this.success(responseData);
  }
}

export class SearchCasesHandler extends BaseToolHandler {
  readonly name = 'search_cases';
  readonly description = 'Search for legal cases and dockets';
  readonly category = 'search';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    if (!input || typeof input !== 'object') {
      return failure(new Error('Input must be an object'));
    }

    return success({
      q: input.q || '',
      page: Math.max(1, parseInt(input.page) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(input.pageSize) || 20)),
      court: input.court || undefined,
      dateAfter: input.dateAfter || undefined,
      dateBefore: input.dateBefore || undefined,
    });
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Searching cases', {
        query: input.q,
        requestId: context.requestId,
      });

      const response = await this.apiClient.searchCases(input);

      return this.success({
        summary: `Found ${response.count ?? 0} cases`,
        results: response.results,
        pagination: {
          page: input.page,
          totalPages: Math.ceil((response.count ?? 0) / input.pageSize),
          totalCount: response.count ?? 0,
        },
      });
    } catch (error) {
      context.logger.error('Case search failed', error as Error, {
        query: input.q,
        requestId: context.requestId,
      });

      return this.error('Failed to search cases', { message: (error as Error).message });
    }
  }

  getSchema() {
    return {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query for cases',
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          minimum: 1,
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (default: 20, max: 100)',
          minimum: 1,
          maximum: 100,
        },
        court: {
          type: 'string',
          description: 'Filter by court identifier',
        },
        dateAfter: {
          type: 'string',
          description: 'Filter cases after this date (YYYY-MM-DD)',
        },
        dateBefore: {
          type: 'string',
          description: 'Filter cases before this date (YYYY-MM-DD)',
        },
      },
    };
  }
}
