import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Zod schemas for oral arguments handlers
 */
const getOralArgumentsSchema = z.object({
  court: z.string().optional(),
  case_name: z.string().optional(),
  date_argued: z.string().optional(),
  docket_id: z.union([z.string(), z.number()]).transform(String).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
});

const getOralArgumentSchema = z.object({
  oral_argument_id: z.union([z.string(), z.number()]).transform(String),
  include_transcript: z.boolean().optional().default(false),
  include_audio_url: z.boolean().optional().default(true),
});

/**
 * Handler for getting oral arguments
 */
export class GetOralArgumentsHandler extends TypedToolHandler<typeof getOralArgumentsSchema> {
  readonly name = 'get_oral_arguments';
  readonly description = 'Get oral arguments with filtering options';
  readonly category = 'oral-arguments';
  protected readonly schema = getOralArgumentsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  async execute(
    input: z.infer<typeof getOralArgumentsSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
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
export class GetOralArgumentHandler extends TypedToolHandler<typeof getOralArgumentSchema> {
  readonly name = 'get_oral_argument';
  readonly description = 'Get detailed information about a specific oral argument';
  readonly category = 'oral-arguments';
  protected readonly schema = getOralArgumentSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  async execute(
    input: z.infer<typeof getOralArgumentSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
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
