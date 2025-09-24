import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Result } from '../../common/types.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';

/**
 * Handler for case-related operations
 */
export class GetCaseDetailsHandler extends BaseToolHandler {
  readonly name = 'get_case_details';
  readonly description = 'Get detailed information about a specific case';
  readonly category = 'cases';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z
        .object({
          // Accept integers (including negatives) and strings, we'll enforce positivity in transform
          cluster_id: z.union([z.coerce.number().int(), z.string()]).optional(),
          id: z.union([z.coerce.number().int(), z.string()]).optional(),
        })
        .refine(data => data.cluster_id !== undefined || data.id !== undefined, {
          message: 'cluster_id (or legacy id) is required',
          path: ['cluster_id'],
        })
        .transform(data => {
          const raw = (data.cluster_id ?? data.id) as string | number;
          const num = Number(raw);
          if (!Number.isFinite(num) || num <= 0) {
            // Include phrase the test suite checks for
            throw new Error('cluster_id must be a positive integer');
          }
          return { cluster_id: String(num) };
        });

      const validated = schema.parse(input ?? {});
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        cluster_id: {
          type: ['string', 'number'],
          description: 'Case cluster ID (preferred). Use search_cases to discover IDs.',
        },
        id: {
          type: ['string', 'number'],
          description: 'Legacy case ID alias (deprecated).',
        },
      },
      anyOf: [{ required: ['cluster_id'] }, { required: ['id'] }],
      additionalProperties: false,
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting case details', {
        clusterId: input.cluster_id,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getCaseDetails({
        clusterId: Number(input.cluster_id),
      });

      return this.success({
        summary: `Retrieved details for case ${input.cluster_id}`,
        case: response,
      });
    } catch (error) {
      context.logger.error('Failed to get case details', error as Error, {
        clusterId: input.cluster_id,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { clusterId: input.cluster_id });
    }
  }
}

/**
 * Handler for getting related cases
 */
export class GetRelatedCasesHandler extends BaseToolHandler {
  readonly name = 'get_related_cases';
  readonly description = 'Find cases related to a specific case';
  readonly category = 'cases';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z
        .object({
          opinion_id: z.union([z.string(), z.number()]).optional(),
          cluster_id: z.union([z.string(), z.number()]).optional(),
          case_id: z.union([z.string(), z.number()]).optional(),
          limit: z.coerce.number().int().min(1).max(100).optional().default(10),
        })
        .refine(data => data.opinion_id ?? data.cluster_id ?? data.case_id, {
          message: 'opinion_id or cluster_id is required to look up related cases',
          path: ['opinion_id'],
        })
        .transform(data => ({
          opinion_id: Number(data.opinion_id ?? data.cluster_id ?? data.case_id),
          limit: data.limit,
        }));

      const validated = schema.parse(input ?? {});
      return { success: true, data: validated };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        opinion_id: {
          type: ['string', 'number'],
          description: 'Opinion ID to find related opinions/cases for',
        },
        cluster_id: {
          type: ['string', 'number'],
          description: 'Case cluster ID (alias for opinion-based lookups)',
        },
        case_id: {
          type: ['string', 'number'],
          description: 'Legacy case identifier (treated like cluster_id)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of related cases to return',
          default: 10,
        },
      },
      anyOf: [{ required: ['opinion_id'] }, { required: ['cluster_id'] }, { required: ['case_id'] }],
      additionalProperties: false,
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting related cases', {
        opinionId: input.opinion_id,
        requestId: context.requestId,
      });

      const response = await this.apiClient.getRelatedCases(input.opinion_id);

      return this.success({
        summary: `Found ${response.length || 0} related cases/opinions`,
        relatedCases: Array.isArray(response) ? response.slice(0, input.limit) : response,
      });
    } catch (error) {
      context.logger.error('Failed to get related cases', error as Error, {
        opinionId: input.opinion_id,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { opinionId: input.opinion_id });
    }
  }
}

/**
 * Handler for case citations and authorities analysis
 */
export class AnalyzeCaseAuthoritiesHandler extends BaseToolHandler {
  readonly name = 'analyze_case_authorities';
  readonly description = 'Analyze the legal authorities cited in a case';
  readonly category = 'cases';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        case_id: z.union([z.string(), z.number()]).transform(String),
        include_citations: z.boolean().optional().default(true),
        depth: z.number().min(1).max(3).optional().default(1),
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
        case_id: {
          type: ['string', 'number'],
          description: 'Case ID to analyze authorities for',
        },
        include_citations: {
          type: 'boolean',
          description: 'Whether to include citation analysis',
          default: true,
        },
        depth: {
          type: 'number',
          description: 'Analysis depth (1-3)',
          minimum: 1,
          maximum: 3,
          default: 1,
        },
      },
      required: ['case_id'],
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Analyzing case authorities', {
        caseId: input.case_id,
        requestId: context.requestId,
      });

      const response = await this.apiClient.analyzeCaseAuthorities(input);

      return this.success({
        summary: `Analyzed authorities for case ${input.case_id}`,
        analysis: response,
      });
    } catch (error) {
      context.logger.error('Failed to analyze case authorities', error as Error, {
        caseId: input.case_id,
        requestId: context.requestId,
      });
      return this.error((error as Error).message, { caseId: input.case_id });
    }
  }
}
