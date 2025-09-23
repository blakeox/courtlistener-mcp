import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Handler for getting financial disclosures
 */
export class GetFinancialDisclosuresHandler extends BaseToolHandler {
  readonly name = 'get_financial_disclosures';
  readonly description = 'Get financial disclosures for judges';
  readonly category = 'financial';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        judge_id: z.union([z.string(), z.number()]).transform(String).optional(),
        year: z.number().min(1990).max(new Date().getFullYear()).optional(),
        page: z.number().min(1).optional().default(1),
        page_size: z.number().min(1).max(100).optional().default(20)
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
          description: 'Filter by specific judge ID'
        },
        year: {
          type: 'number',
          minimum: 1990,
          maximum: new Date().getFullYear(),
          description: 'Filter by disclosure year'
        },
        page: {
          type: 'number',
          minimum: 1,
          description: 'Page number for pagination',
          default: 1
        },
        page_size: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Number of disclosures per page',
          default: 20
        }
      }
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting financial disclosures', {
        judgeId: input.judge_id,
        year: input.year,
        requestId: context.requestId
      });

      const response = await this.apiClient.getFinancialDisclosures(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} financial disclosures`,
        disclosures: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size)
        }
      });
    } catch (error) {
      context.logger.error('Failed to get financial disclosures', error as Error, {
        requestId: context.requestId
      });
      return this.error((error as Error).message);
    }
  }
}

/**
 * Handler for getting specific financial disclosure
 */
export class GetFinancialDisclosureHandler extends BaseToolHandler {
  readonly name = 'get_financial_disclosure';
  readonly description = 'Get details of a specific financial disclosure';
  readonly category = 'financial';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        disclosure_id: z.union([z.string(), z.number()]).transform(String)
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
        disclosure_id: {
          type: ['string', 'number'],
          description: 'Financial disclosure ID to retrieve'
        }
      },
      required: ['disclosure_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting financial disclosure', {
        disclosureId: input.disclosure_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getFinancialDisclosure(input.disclosure_id);

      return this.success({
        summary: `Retrieved financial disclosure ${input.disclosure_id}`,
        disclosure: response
      });
    } catch (error) {
      context.logger.error('Failed to get financial disclosure', error as Error, {
        disclosureId: input.disclosure_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { disclosureId: input.disclosure_id });
    }
  }
}

/**
 * Handler for getting parties and attorneys
 */
export class GetPartiesAndAttorneysHandler extends BaseToolHandler {
  readonly name = 'get_parties_and_attorneys';
  readonly description = 'Get parties and attorneys information for a case';
  readonly category = 'legal-entities';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        docket_id: z.union([z.string(), z.number()]).transform(String),
        include_attorneys: z.boolean().optional().default(true),
        include_parties: z.boolean().optional().default(true)
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
        docket_id: {
          type: ['string', 'number'],
          description: 'Docket ID to get parties and attorneys for'
        },
        include_attorneys: {
          type: 'boolean',
          description: 'Whether to include attorney information',
          default: true
        },
        include_parties: {
          type: 'boolean',
          description: 'Whether to include party information',
          default: true
        }
      },
      required: ['docket_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting parties and attorneys', {
        docketId: input.docket_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getPartiesAndAttorneys(input);

      return this.success({
        summary: `Retrieved parties and attorneys for docket ${input.docket_id}`,
        data: response
      });
    } catch (error) {
      context.logger.error('Failed to get parties and attorneys', error as Error, {
        docketId: input.docket_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { docketId: input.docket_id });
    }
  }
}

/**
 * Handler for managing alerts
 */
export class ManageAlertsHandler extends BaseToolHandler {
  readonly name = 'manage_alerts';
  readonly description = 'Manage legal alerts and notifications';
  readonly category = 'alerts';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        action: z.enum(['create', 'list', 'update', 'delete']),
        alert_id: z.union([z.string(), z.number()]).transform(String).optional(),
        query: z.string().optional(),
        frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
        alert_type: z.enum(['case', 'opinion', 'docket']).optional()
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
        action: {
          type: 'string',
          enum: ['create', 'list', 'update', 'delete'],
          description: 'Action to perform on alerts'
        },
        alert_id: {
          type: ['string', 'number'],
          description: 'Alert ID (required for update/delete)'
        },
        query: {
          type: 'string',
          description: 'Search query for the alert (required for create)'
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly'],
          description: 'Alert frequency'
        },
        alert_type: {
          type: 'string',
          enum: ['case', 'opinion', 'docket'],
          description: 'Type of content to alert on'
        }
      },
      required: ['action']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Managing alerts', {
        action: input.action,
        alertId: input.alert_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.manageAlerts(input);

      return this.success({
        summary: `Successfully ${input.action}d alert`,
        result: response
      });
    } catch (error) {
      context.logger.error('Failed to manage alerts', error as Error, {
        action: input.action,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { action: input.action });
    }
  }
}