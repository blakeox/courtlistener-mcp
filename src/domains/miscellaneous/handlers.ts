import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { withDefaults } from '../../server/handler-decorators.js';
import { createPaginationInfo } from '../../common/pagination-utils.js';

/**
 * Zod schemas for miscellaneous handlers
 */
const getFinancialDisclosuresSchema = z.object({
  judge_id: z.union([z.string(), z.number()]).transform(String).optional(),
  year: z.number().min(1990).max(new Date().getFullYear()).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
});

const getFinancialDisclosureSchema = z.object({
  disclosure_id: z.union([z.string(), z.number()]).transform(String),
});

const getPartiesAndAttorneysSchema = z.object({
  docket_id: z.union([z.string(), z.number()]).transform(String),
  include_attorneys: z.boolean().optional().default(true),
  include_parties: z.boolean().optional().default(true),
});

const manageAlertsSchema = z.object({
  action: z.enum(['create', 'list', 'update', 'delete']),
  alert_id: z.union([z.string(), z.number()]).transform(String).optional(),
  query: z.string().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  alert_type: z.enum(['case', 'opinion', 'docket']).optional(),
});

/**
 * Handler for getting financial disclosures
 */
export class GetFinancialDisclosuresHandler extends TypedToolHandler<
  typeof getFinancialDisclosuresSchema
> {
  readonly name = 'get_financial_disclosures';
  readonly description = 'Get financial disclosures for judges';
  readonly category = 'financial';
  protected readonly schema = getFinancialDisclosuresSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getFinancialDisclosuresSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting financial disclosures', {
      judgeId: input.judge_id,
      year: input.year,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getFinancialDisclosures(input);

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} financial disclosures`,
      disclosures: response.results,
      pagination: createPaginationInfo(response, input.page, input.page_size),
    });
  }
}

/**
 * Handler for getting specific financial disclosure
 */
export class GetFinancialDisclosureHandler extends TypedToolHandler<
  typeof getFinancialDisclosureSchema
> {
  readonly name = 'get_financial_disclosure';
  readonly description = 'Get details of a specific financial disclosure';
  readonly category = 'financial';
  protected readonly schema = getFinancialDisclosureSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getFinancialDisclosureSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting financial disclosure', {
      disclosureId: input.disclosure_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getFinancialDisclosure(parseInt(input.disclosure_id));

    return this.success({
      summary: `Retrieved financial disclosure ${input.disclosure_id}`,
      disclosure: response,
    });
  }
}

/**
 * Handler for getting parties and attorneys
 */
export class GetPartiesAndAttorneysHandler extends TypedToolHandler<
  typeof getPartiesAndAttorneysSchema
> {
  readonly name = 'get_parties_and_attorneys';
  readonly description = 'Get parties and attorneys information for a case';
  readonly category = 'legal-entities';
  protected readonly schema = getPartiesAndAttorneysSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getPartiesAndAttorneysSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting parties and attorneys', {
      docketId: input.docket_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getPartiesAndAttorneys(input);

    return this.success({
      summary: `Retrieved parties and attorneys for docket ${input.docket_id}`,
      data: response,
    });
  }
}

/**
 * Handler for managing alerts
 */
export class ManageAlertsHandler extends TypedToolHandler<typeof manageAlertsSchema> {
  readonly name = 'manage_alerts';
  readonly description = 'Manage legal alerts and notifications';
  readonly category = 'alerts';
  protected readonly schema = manageAlertsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof manageAlertsSchema>,
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Managing alerts', {
      action: input.action,
      alertId: input.alert_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.manageAlerts(input);

    return this.success({
      summary: `Successfully ${input.action}d alert`,
      result: response,
    });
  }
}
