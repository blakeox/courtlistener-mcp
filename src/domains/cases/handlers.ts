import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

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
      const schema = z.object({
        id: z.union([z.string(), z.number()]).transform(String)
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
        id: {
          type: ['string', 'number'],
          description: 'Case ID to retrieve details for'
        }
      },
      required: ['id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting case details', {
        caseId: input.id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getCaseDetails(input.id);

      return this.success({
        summary: `Retrieved details for case ${input.id}`,
        case: response
      });
    } catch (error) {
      context.logger.error('Failed to get case details', error as Error, {
        caseId: input.id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { caseId: input.id });
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
      const schema = z.object({
        case_id: z.union([z.string(), z.number()]).transform(String),
        limit: z.number().optional().default(10)
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
          description: 'Case ID to find related cases for'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of related cases to return',
          default: 10
        }
      },
      required: ['case_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting related cases', {
        caseId: input.case_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getRelatedCases(input);

      return this.success({
        summary: `Found ${response.length || 0} related cases`,
        relatedCases: response
      });
    } catch (error) {
      context.logger.error('Failed to get related cases', error as Error, {
        caseId: input.case_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { caseId: input.case_id });
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
        depth: z.number().min(1).max(3).optional().default(1)
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
          description: 'Case ID to analyze authorities for'
        },
        include_citations: {
          type: 'boolean',
          description: 'Whether to include citation analysis',
          default: true
        },
        depth: {
          type: 'number',
          description: 'Analysis depth (1-3)',
          minimum: 1,
          maximum: 3,
          default: 1
        }
      },
      required: ['case_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Analyzing case authorities', {
        caseId: input.case_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.analyzeCaseAuthorities(input);

      return this.success({
        summary: `Analyzed authorities for case ${input.case_id}`,
        analysis: response
      });
    } catch (error) {
      context.logger.error('Failed to analyze case authorities', error as Error, {
        caseId: input.case_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { caseId: input.case_id });
    }
  }
}