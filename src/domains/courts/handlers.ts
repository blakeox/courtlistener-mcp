import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { withDefaults } from '../../server/handler-decorators.js';
import {
  createPaginationInfo,
  PaginatedApiResponse,
  resolveOffsetLimit,
} from '../../common/pagination-utils.js';

/**
 * Zod schemas for courts handlers
 */
const listCourtsSchema = z.object({
  jurisdiction: z.string().optional(),
  court_type: z.enum(['federal', 'state', 'appellate', 'district', 'supreme']).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from previous response (alternative to page/page_size)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of results to return (used with cursor)'),
});

const getJudgesSchema = z.object({
  court: z.string().optional(),
  name: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from previous response (alternative to page/page_size)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of results to return (used with cursor)'),
});

const getJudgeSchema = z.object({
  judge_id: z.union([z.string(), z.number()]).transform(String),
});

/**
 * Handler for listing courts
 */
export class ListCourtsHandler extends TypedToolHandler<typeof listCourtsSchema> {
  readonly name = 'list_courts';
  readonly description = 'List courts with optional filtering';
  readonly category = 'courts';
  protected readonly schema = listCourtsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof listCourtsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Listing courts', {
      jurisdiction: input.jurisdiction,
      courtType: input.court_type,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.listCourts(input)) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length ?? 0} courts`,
      courts: response.results,
      pagination: createPaginationInfo(response, input.page, input.page_size),
    });
  }
}

/**
 * Handler for getting judges information
 */
export class GetJudgesHandler extends TypedToolHandler<typeof getJudgesSchema> {
  readonly name = 'get_judges';
  readonly description = 'Get information about judges';
  readonly category = 'courts';
  protected readonly schema = getJudgesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgesSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting judges', {
      court: input.court,
      name: input.name,
      requestId: context.requestId,
    });

    const { offset, limit: resolvedLimit } = resolveOffsetLimit(input);
    const page = input.cursor ? Math.floor(offset / resolvedLimit) + 1 : input.page;
    const pageSize = input.cursor ? resolvedLimit : input.page_size;

    const response = await this.apiClient.getJudges({ ...input, page, page_size: pageSize });

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} judges`,
      judges: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

/**
 * Handler for getting specific judge information
 */
export class GetJudgeHandler extends TypedToolHandler<typeof getJudgeSchema> {
  readonly name = 'get_judge';
  readonly description = 'Get detailed information about a specific judge';
  readonly category = 'courts';
  protected readonly schema = getJudgeSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgeSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting judge details', {
      judgeId: input.judge_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getJudge(parseInt(input.judge_id));

    return this.successWithResource(
      {
        summary: `Retrieved details for judge ${input.judge_id}`,
        judge: response,
      },
      `courtlistener://judge/${input.judge_id}`,
      response,
    );
  }
}
