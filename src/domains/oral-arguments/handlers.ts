import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Handler for getting oral arguments
 */
export class GetOralArgumentsHandler extends BaseToolHandler {
  readonly name = 'get_oral_arguments';
  readonly description = 'Get oral arguments with filtering options';
  readonly category = 'oral-arguments';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        court: z.string().optional(),
        case_name: z.string().optional(),
        date_argued: z.string().optional(),
        docket_id: z.union([z.string(), z.number()]).transform(String).optional(),
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
        case_name: {
          type: 'string',
          description: 'Search by case name',
        },
        date_argued: {
          type: 'string',
          description: 'Filter by argument date (YYYY-MM-DD or range)',
        },
        docket_id: {
          type: ['string', 'number'],
          description: 'Filter by docket ID',
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
          description: 'Number of oral arguments per page',
          default: 20,
        },
      },
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting oral arguments', {
        court: input.court,
        caseName: input.case_name,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getOralArguments(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} oral arguments`,
        oralArguments: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size),
        },
      });
    } catch (error) {
      context.logger.error('Failed to get oral arguments', error as Error, {
        requestId: context.requestId,
      });
      return this.error((error as Error).message);
    }
  }
}

/**
 * Handler for getting specific oral argument
 */
export class GetOralArgumentHandler extends BaseToolHandler {
  readonly name = 'get_oral_argument';
  readonly description = 'Get detailed information about a specific oral argument';
  readonly category = 'oral-arguments';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        oral_argument_id: z.union([z.string(), z.number()]).transform(String),
        include_transcript: z.boolean().optional().default(false),
        include_audio_url: z.boolean().optional().default(true),
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
        oral_argument_id: {
          type: ['string', 'number'],
          description: 'Oral argument ID to retrieve information for',
        },
        include_transcript: {
          type: 'boolean',
          description: 'Whether to include transcript text',
          default: false,
        },
        include_audio_url: {
          type: 'boolean',
          description: 'Whether to include audio file URLs',
          default: true,
        },
      },
      required: ['oral_argument_id'],
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting oral argument details', {
        oralArgumentId: input.oral_argument_id,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getOralArgument(input.oral_argument_id);

      return this.success({
        summary: `Retrieved details for oral argument ${input.oral_argument_id}`,
        oralArgument: response,
      });
    } catch (error) {
      context.logger.error('Failed to get oral argument details', error as Error, {
        oralArgumentId: input.oral_argument_id,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { oralArgumentId: input.oral_argument_id });
    }
  }
}
