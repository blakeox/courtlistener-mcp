import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Handler for getting opinion text
 */
export class GetOpinionTextHandler extends BaseToolHandler {
  readonly name = 'get_opinion_text';
  readonly description = 'Get the full text of a specific opinion';
  readonly category = 'opinions';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        opinion_id: z.union([z.string(), z.number()]).transform(String),
        format: z.enum(['text', 'html', 'pdf']).optional().default('text')
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
        opinion_id: {
          type: ['string', 'number'],
          description: 'Opinion ID to retrieve text for'
        },
        format: {
          type: 'string',
          enum: ['text', 'html', 'pdf'],
          description: 'Format for the opinion text',
          default: 'text'
        }
      },
      required: ['opinion_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting opinion text', {
        opinionId: input.opinion_id,
        format: input.format,
        requestId: context.requestId
      });

      const response = await this.apiClient.getOpinionText({
        opinion_id: input.opinion_id,
        format: input.format
      });

      return this.success({
        summary: `Retrieved ${input.format} text for opinion ${input.opinion_id}`,
        opinion: response
      });
    } catch (error) {
      context.logger.error('Failed to get opinion text', error as Error, {
        opinionId: input.opinion_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { opinionId: input.opinion_id });
    }
  }
}

/**
 * Handler for analyzing legal arguments in opinions
 */
export class AnalyzeLegalArgumentHandler extends BaseToolHandler {
  readonly name = 'analyze_legal_argument';
  readonly description = 'Analyze legal arguments and reasoning in opinions';
  readonly category = 'opinions';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        opinion_id: z.union([z.string(), z.number()]).transform(String),
        analysis_type: z.enum(['reasoning', 'precedents', 'citations', 'structure']).optional().default('reasoning'),
        include_context: z.boolean().optional().default(true)
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
        opinion_id: {
          type: ['string', 'number'],
          description: 'Opinion ID to analyze'
        },
        analysis_type: {
          type: 'string',
          enum: ['reasoning', 'precedents', 'citations', 'structure'],
          description: 'Type of analysis to perform',
          default: 'reasoning'
        },
        include_context: {
          type: 'boolean',
          description: 'Whether to include contextual information',
          default: true
        }
      },
      required: ['opinion_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Analyzing legal argument', {
        opinionId: input.opinion_id,
        analysisType: input.analysis_type,
        requestId: context.requestId
      });

      const response = await this.apiClient.analyzeLegalArgument(input);

      return this.success({
        summary: `Analyzed ${input.analysis_type} in opinion ${input.opinion_id}`,
        analysis: response
      });
    } catch (error) {
      context.logger.error('Failed to analyze legal argument', error as Error, {
        opinionId: input.opinion_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { opinionId: input.opinion_id });
    }
  }
}

/**
 * Handler for getting citation networks
 */
export class GetCitationNetworkHandler extends BaseToolHandler {
  readonly name = 'get_citation_network';
  readonly description = 'Get the citation network for an opinion or case';
  readonly category = 'opinions';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        opinion_id: z.union([z.string(), z.number()]).transform(String),
        depth: z.number().min(1).max(3).optional().default(2),
        direction: z.enum(['cited_by', 'cites', 'both']).optional().default('both'),
        limit: z.number().min(1).max(100).optional().default(50)
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
        opinion_id: {
          type: ['string', 'number'],
          description: 'Opinion ID to get citation network for'
        },
        depth: {
          type: 'number',
          minimum: 1,
          maximum: 3,
          description: 'Network depth (1-3)',
          default: 2
        },
        direction: {
          type: 'string',
          enum: ['cited_by', 'cites', 'both'],
          description: 'Citation direction to explore',
          default: 'both'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of citations to return',
          default: 50
        }
      },
      required: ['opinion_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting citation network', {
        opinionId: input.opinion_id,
        depth: input.depth,
        direction: input.direction,
        requestId: context.requestId
      });

      const response = await this.apiClient.getCitationNetwork(
        parseInt(input.opinion_id), 
        { 
          depth: input.depth, 
          direction: input.direction, 
          limit: input.limit 
        }
      );

      return this.success({
        summary: `Retrieved citation network for opinion ${input.opinion_id}`,
        network: response
      });
    } catch (error) {
      context.logger.error('Failed to get citation network', error as Error, {
        opinionId: input.opinion_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { opinionId: input.opinion_id });
    }
  }
}

/**
 * Handler for citation lookup
 */
export class LookupCitationHandler extends BaseToolHandler {
  readonly name = 'lookup_citation';
  readonly description = 'Look up cases by legal citation';
  readonly category = 'opinions';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        citation: z.string().min(1),
        normalize: z.boolean().optional().default(true),
        include_alternatives: z.boolean().optional().default(false)
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
        citation: {
          type: 'string',
          description: 'Legal citation to look up (e.g., "410 U.S. 113")'
        },
        normalize: {
          type: 'boolean',
          description: 'Whether to normalize the citation format',
          default: true
        },
        include_alternatives: {
          type: 'boolean',
          description: 'Whether to include alternative citations',
          default: false
        }
      },
      required: ['citation']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Looking up citation', {
        citation: input.citation,
        requestId: context.requestId
      });

      const response = await this.apiClient.searchCitations(input.citation);

      return this.success({
        summary: `Found cases for citation: ${input.citation}`,
        results: response
      });
    } catch (error) {
      context.logger.error('Failed to lookup citation', error as Error, {
        citation: input.citation,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { citation: input.citation });
    }
  }
}