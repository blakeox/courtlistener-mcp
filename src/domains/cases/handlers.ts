import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';

/**
 * Zod schemas for cases handlers
 */
const getCaseDetailsSchema = z
  .object({
    cluster_id: z.union([z.coerce.number().int(), z.string()]).optional(),
    id: z.union([z.coerce.number().int(), z.string()]).optional(),
  })
  .refine((data) => data.cluster_id !== undefined || data.id !== undefined, {
    message: 'cluster_id (or legacy id) is required',
    path: ['cluster_id'],
  })
  .transform((data) => {
    const raw = (data.cluster_id ?? data.id) as string | number;
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error('cluster_id must be a positive integer');
    }
    return { cluster_id: String(num) };
  });

const getRelatedCasesSchema = z
  .object({
    opinion_id: z.union([z.string(), z.number()]).optional(),
    cluster_id: z.union([z.string(), z.number()]).optional(),
    case_id: z.union([z.string(), z.number()]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  })
  .refine((data) => data.opinion_id ?? data.cluster_id ?? data.case_id, {
    message: 'opinion_id or cluster_id is required to look up related cases',
    path: ['opinion_id'],
  })
  .transform((data) => ({
    opinion_id: Number(data.opinion_id ?? data.cluster_id ?? data.case_id),
    limit: data.limit,
  }));

const analyzeCaseAuthoritiesSchema = z.object({
  case_id: z.union([z.string(), z.number()]).transform(String),
  include_citations: z.boolean().optional().default(true),
  depth: z.number().min(1).max(3).optional().default(1),
});

/**
 * Handler for case-related operations
 */
export class GetCaseDetailsHandler extends TypedToolHandler<typeof getCaseDetailsSchema> {
  readonly name = 'get_case_details';
  readonly description = 'Get detailed information about a specific case';
  readonly category = 'cases';
  protected readonly schema = getCaseDetailsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getCaseDetailsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting case details', {
      clusterId: input.cluster_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getCaseDetails({
      clusterId: Number(input.cluster_id),
    });

    return this.successWithResource(
      {
        summary: `Retrieved details for case ${input.cluster_id}`,
        case: response,
      },
      `courtlistener://case/${input.cluster_id}`,
      response,
    );
  }
}

/**
 * Handler for getting related cases
 */
export class GetRelatedCasesHandler extends TypedToolHandler<typeof getRelatedCasesSchema> {
  readonly name = 'get_related_cases';
  readonly description = 'Find cases related to a specific case';
  readonly category = 'cases';
  protected readonly schema = getRelatedCasesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getRelatedCasesSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting related cases', {
      opinionId: input.opinion_id,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getRelatedCases(input.opinion_id)) as unknown[];

    return this.success({
      summary: `Found ${response.length || 0} related cases/opinions`,
      relatedCases: Array.isArray(response) ? response.slice(0, input.limit) : response,
    });
  }
}

/**
 * Handler for case citations and authorities analysis
 */
export class AnalyzeCaseAuthoritiesHandler extends TypedToolHandler<
  typeof analyzeCaseAuthoritiesSchema
> {
  readonly name = 'analyze_case_authorities';
  readonly description = 'Analyze the legal authorities cited in a case';
  readonly category = 'cases';
  protected readonly schema = analyzeCaseAuthoritiesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof analyzeCaseAuthoritiesSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Analyzing case authorities', {
      caseId: input.case_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.analyzeCaseAuthorities(input);

    return this.success({
      summary: `Analyzed authorities for case ${input.case_id}`,
      analysis: response,
    });
  }
}
