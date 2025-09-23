/**
 * Search Domain Tool Handlers
 * Handles all search-related tools in the CourtListener system
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { Result, success, failure } from '../../common/types.js';
import { CourtListenerAPI } from '../../courtlistener.js';

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
      orderBy: input.orderBy || 'relevance'
    };

    return success(validatedInput);
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Searching opinions', { 
        query: input.q, 
        page: input.page,
        requestId: context.requestId 
      });

      const response = await this.apiClient.searchOpinions(input);

      return this.success({
        summary: `Found ${response.count ?? 0} opinions`,
        results: response.results,
        pagination: {
          page: input.page,
          totalPages: Math.ceil((response.count ?? 0) / input.pageSize),
          totalCount: response.count ?? 0
        }
      });
    } catch (error) {
      context.logger.error('Opinion search failed', error as Error, {
        query: input.q,
        requestId: context.requestId
      });
      
      return this.error(
        'Failed to search opinions',
        { message: (error as Error).message }
      );
    }
  }

  getSchema() {
    return {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query for opinions'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Number of results per page (default: 20, max: 100)',
          minimum: 1,
          maximum: 100
        },
        court: {
          type: 'string',
          description: 'Filter by court identifier'
        },
        judge: {
          type: 'string',
          description: 'Filter by judge name'
        },
        dateAfter: {
          type: 'string',
          description: 'Filter opinions after this date (YYYY-MM-DD)'
        },
        dateBefore: {
          type: 'string',
          description: 'Filter opinions before this date (YYYY-MM-DD)'
        },
        orderBy: {
          type: 'string',
          enum: ['relevance', 'date', 'name'],
          description: 'Sort order (default: relevance)'
        }
      }
    };
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
      dateBefore: input.dateBefore || undefined
    });
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Searching cases', { 
        query: input.q,
        requestId: context.requestId 
      });

      const response = await this.apiClient.searchCases(input);

      return this.success({
        summary: `Found ${response.count ?? 0} cases`,
        results: response.results,
        pagination: {
          page: input.page,
          totalPages: Math.ceil((response.count ?? 0) / input.pageSize),
          totalCount: response.count ?? 0
        }
      });
    } catch (error) {
      context.logger.error('Case search failed', error as Error, {
        query: input.q,
        requestId: context.requestId
      });
      
      return this.error(
        'Failed to search cases',
        { message: (error as Error).message }
      );
    }
  }

  getSchema() {
    return {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query for cases'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number', 
          description: 'Number of results per page (default: 20, max: 100)',
          minimum: 1,
          maximum: 100
        },
        court: {
          type: 'string',
          description: 'Filter by court identifier'
        },
        dateAfter: {
          type: 'string',
          description: 'Filter cases after this date (YYYY-MM-DD)'
        },
        dateBefore: {
          type: 'string',
          description: 'Filter cases before this date (YYYY-MM-DD)'
        }
      }
    };
  }
}