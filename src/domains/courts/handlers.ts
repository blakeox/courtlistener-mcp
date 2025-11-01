import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Handler for listing courts
 */
export class ListCourtsHandler extends BaseToolHandler {
  readonly name = 'list_courts';
  readonly description = 'List courts with optional filtering';
  readonly category = 'courts';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        jurisdiction: z.string().optional(),
        court_type: z.enum(['federal', 'state', 'appellate', 'district', 'supreme']).optional(),
        page: z.number().min(1).optional().default(1),
        page_size: z.number().min(1).max(100).optional().default(20),
      });

      const validated = schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        jurisdiction: {
          type: 'string',
          description: 'Filter by jurisdiction (e.g., federal, state name)',
        },
        court_type: {
          type: 'string',
          enum: ['federal', 'state', 'appellate', 'district', 'supreme'],
          description: 'Filter by court type',
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
          description: 'Number of courts per page',
          default: 20,
        },
      },
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Listing courts', {
        jurisdiction: input.jurisdiction,
        courtType: input.court_type,
        requestId: context.requestId,
      });

      const response = await this.apiClient.listCourts(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} courts`,
        courts: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size),
        },
      });
    } catch (error) {
      context.logger.error('Failed to list courts', error as Error, {
        requestId: context.requestId,
      });
      return this.error((error as Error).message);
    }
  }
}

/**
 * Handler for getting judges information
 */
export class GetJudgesHandler extends BaseToolHandler {
  readonly name = 'get_judges';
  readonly description = 'Get information about judges';
  readonly category = 'courts';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        court: z.string().optional(),
        name: z.string().optional(),
        active: z.boolean().optional(),
        page: z.number().min(1).optional().default(1),
        page_size: z.number().min(1).max(100).optional().default(20),
      });

      const validated = schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        court: {
          type: 'string',
          description: 'Filter by court',
        },
        name: {
          type: 'string',
          description: 'Search by judge name',
        },
        active: {
          type: 'boolean',
          description: 'Filter by active status',
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
          description: 'Number of judges per page',
          default: 20,
        },
      },
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting judges', {
        court: input.court,
        name: input.name,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getJudges(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} judges`,
        judges: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size),
        },
      });
    } catch (error) {
      context.logger.error('Failed to get judges', error as Error, {
        requestId: context.requestId,
      });
      return this.error((error as Error).message);
    }
  }
}

/**
 * Handler for getting specific judge information
 */
export class GetJudgeHandler extends BaseToolHandler {
  readonly name = 'get_judge';
  readonly description = 'Get detailed information about a specific judge';
  readonly category = 'courts';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        judge_id: z.union([z.string(), z.number()]).transform(String),
      });

      const validated = schema.parse(input);
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        judge_id: {
          type: ['string', 'number'],
          description: 'Judge ID to retrieve information for',
        },
      },
      required: ['judge_id'],
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting judge details', {
        judgeId: input.judge_id,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getJudge(input.judge_id);

      return this.success({
        summary: `Retrieved details for judge ${input.judge_id}`,
        judge: response,
      });
    } catch (error) {
      context.logger.error('Failed to get judge details', error as Error, {
        judgeId: input.judge_id,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { judgeId: input.judge_id });
    }
  }
}
