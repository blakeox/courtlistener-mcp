import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';

/**
 * Zod schemas for opinions handlers
 */
const getOpinionTextSchema = z.object({
  opinion_id: z.union([z.coerce.number().int().positive(), z.string()]).transform((v) => String(v)),
  format: z.enum(['text', 'html', 'pdf']).optional().default('text'),
});

/**
 * Handler for getting opinion text
 */
export class GetOpinionTextHandler extends TypedToolHandler<typeof getOpinionTextSchema> {
  readonly name = 'get_opinion_text';
  readonly description = 'Get the full text of a specific opinion';
  readonly category = 'opinions';
  protected readonly schema = getOpinionTextSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getOpinionTextSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting opinion text', {
      opinionId: input.opinion_id,
      format: input.format,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getOpinionText({
      opinionId: input.opinion_id,
      format: input.format,
    });

    return this.success({
      summary: `Retrieved ${input.format} text for opinion ${input.opinion_id}`,
      opinion: response,
    });
  }
}

const analyzeLegalArgumentSchema = z.object({
  argument: z.string().min(1),
  search_query: z.string().min(1),
  jurisdiction: z.string().optional(),
  date_range_start: z.string().optional(),
  date_range_end: z.string().optional(),
});

/**
 * Handler for analyzing legal arguments in opinions
 */
export class AnalyzeLegalArgumentHandler extends TypedToolHandler<
  typeof analyzeLegalArgumentSchema
> {
  readonly name = 'analyze_legal_argument';
  readonly description = 'Analyze legal arguments and reasoning in opinions';
  readonly category = 'opinions';
  protected readonly schema = analyzeLegalArgumentSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof analyzeLegalArgumentSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Analyzing legal argument', {
      argument: input.argument,
      query: input.search_query,
      requestId: context.requestId,
    });

    // For now, synthesize a simple analysis object consistent with tests
    const response = (await this.apiClient.analyzeLegalArgument(input)) as Record<string, unknown>;

    // Ensure shape includes analysis.top_cases; coerce strings to object
    const responseAnalysis = response?.analysis as Record<string, unknown> | undefined;
    const analysis =
      typeof responseAnalysis === 'object' && responseAnalysis
        ? responseAnalysis
        : { top_cases: [] };

    return this.success({ analysis });
  }
}

const getCitationNetworkSchema = z.object({
  opinion_id: z.union([z.string(), z.number()]).transform(String),
  depth: z.number().min(1).max(3).optional().default(2),
  direction: z.enum(['cited_by', 'cites', 'both']).optional().default('both'),
  limit: z.number().min(1).max(100).optional().default(50),
});

/**
 * Handler for getting citation networks
 */
export class GetCitationNetworkHandler extends TypedToolHandler<typeof getCitationNetworkSchema> {
  readonly name = 'get_citation_network';
  readonly description = 'Get the citation network for an opinion or case';
  readonly category = 'opinions';
  protected readonly schema = getCitationNetworkSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getCitationNetworkSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting citation network', {
      opinionId: input.opinion_id,
      depth: input.depth,
      direction: input.direction,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getCitationNetwork(parseInt(input.opinion_id), {
      depth: input.depth,
      direction: input.direction,
      limit: input.limit,
    });

    return this.success({
      summary: `Retrieved citation network for opinion ${input.opinion_id}`,
      network: response,
    });
  }
}

const lookupCitationSchema = z.object({
  citation: z.string().min(1),
  normalize: z.boolean().optional().default(true),
  include_alternatives: z.boolean().optional().default(false),
});

/**
 * Handler for citation lookup
 */
export class LookupCitationHandler extends TypedToolHandler<typeof lookupCitationSchema> {
  readonly name = 'lookup_citation';
  readonly description = 'Look up cases by legal citation';
  readonly category = 'opinions';
  protected readonly schema = lookupCitationSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 7200 } })
  async execute(
    input: z.infer<typeof lookupCitationSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Looking up citation', {
      citation: input.citation,
      requestId: context.requestId,
    });

    const response = await this.apiClient.searchCitations(input.citation);

    return this.success({
      summary: `Found cases for citation: ${input.citation}`,
      results: response,
    });
  }
}
