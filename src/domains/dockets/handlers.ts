import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';
import {
  createPaginationInfo,
  PaginatedApiResponse,
  resolveOffsetLimit,
} from '../../common/pagination-utils.js';

/**
 * Zod schemas for dockets handlers
 */
const getDocketsSchema = z.object({
  court: z.string().optional(),
  case_name: z.string().optional(),
  docket_number: z.string().optional(),
  date_filed: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getDocketSchema = z.object({
  docket_id: z.union([z.string(), z.number()]).transform(String),
  include_entries: z.boolean().optional().default(true),
});

const getRecapDocumentsSchema = z.object({
  docket_id: z.union([z.string(), z.number()]).transform(String),
  document_type: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
});

const getRecapDocumentSchema = z.object({
  document_id: z.union([z.string(), z.number()]).transform(String),
  include_content: z.boolean().optional().default(false),
});

const getDocketEntriesSchema = z.object({
  docket: z.union([z.string(), z.number()]).transform(String),
  entry_number: z.union([z.string(), z.number()]).transform(String).optional(),
  date_filed_after: z.string().optional(),
  date_filed_before: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getDocketEntrySchema = z.object({
  entry_id: z.union([z.string(), z.number()]).transform(String),
});

const getOriginatingCourtInfoSchema = z.object({
  docket: z.union([z.string(), z.number()]).transform(String).optional(),
  court: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getTagsSchema = z.object({
  name: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getDocketAlertsSchema = z.object({
  docket: z.union([z.string(), z.number()]).transform(String).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const createDocketAlertSchema = z.object({
  docket: z.union([z.string(), z.number()]).transform(String),
  frequency: z.string().optional(),
  alert_type: z.string().optional(),
  email: z.string().optional(),
});

function resolvePagination(input: {
  cursor?: string | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}): { page: number; pageSize: number } {
  const { offset, limit: resolvedLimit } = resolveOffsetLimit(input);
  return {
    page: input.cursor ? Math.floor(offset / resolvedLimit) + 1 : (input.page ?? 1),
    pageSize: input.cursor ? resolvedLimit : (input.page_size ?? 20),
  };
}

/**
 * Handler for getting dockets
 */
export class GetDocketsHandler extends TypedToolHandler<typeof getDocketsSchema> {
  readonly name = 'get_dockets';
  readonly description = 'Get docket information with filtering options';
  readonly category = 'dockets';
  protected readonly schema = getDocketsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getDocketsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting dockets', {
      court: input.court,
      caseName: input.case_name,
      requestId: context.requestId,
    });

    const { offset, limit: resolvedLimit } = resolveOffsetLimit(input);
    const page = input.cursor ? Math.floor(offset / resolvedLimit) + 1 : input.page;
    const pageSize = input.cursor ? resolvedLimit : input.page_size;

    const response = await this.apiClient.getDockets({ ...input, page, page_size: pageSize });

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} dockets`,
      dockets: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

/**
 * Handler for getting specific docket information
 */
export class GetDocketHandler extends TypedToolHandler<typeof getDocketSchema> {
  readonly name = 'get_docket';
  readonly description = 'Get detailed information about a specific docket';
  readonly category = 'dockets';
  protected readonly schema = getDocketSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getDocketSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting docket details', {
      docketId: input.docket_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getDocket(parseInt(input.docket_id));

    return this.successWithResource(
      {
        summary: `Retrieved details for docket ${input.docket_id}`,
        docket: response,
      },
      `courtlistener://docket/${input.docket_id}`,
      response,
    );
  }
}

/**
 * Handler for managing RECAP documents
 */
export class GetRecapDocumentsHandler extends TypedToolHandler<typeof getRecapDocumentsSchema> {
  readonly name = 'get_recap_documents';
  readonly description = 'Get RECAP documents for a docket';
  readonly category = 'dockets';
  protected readonly schema = getRecapDocumentsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getRecapDocumentsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting RECAP documents', {
      docketId: input.docket_id,
      documentType: input.document_type,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getRECAPDocuments(input)) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} RECAP documents for docket ${input.docket_id}`,
      documents: response.results,
      pagination: createPaginationInfo(response, input.page, input.page_size),
    });
  }
}

/**
 * Handler for getting specific RECAP document
 */
export class GetRecapDocumentHandler extends TypedToolHandler<typeof getRecapDocumentSchema> {
  readonly name = 'get_recap_document';
  readonly description = 'Get a specific RECAP document';
  readonly category = 'dockets';
  protected readonly schema = getRecapDocumentSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getRecapDocumentSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting RECAP document', {
      documentId: input.document_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getRECAPDocument(parseInt(input.document_id));

    return this.success({
      summary: `Retrieved RECAP document ${input.document_id}`,
      document: response,
    });
  }
}

/**
 * Handler for getting docket entries
 */
export class GetDocketEntriesHandler extends TypedToolHandler<typeof getDocketEntriesSchema> {
  readonly name = 'get_docket_entries';
  readonly description = 'Retrieve individual docket entries with filtering and pagination';
  readonly category = 'dockets';
  protected readonly schema = getDocketEntriesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof getDocketEntriesSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);

    const params = {
      docket: input.docket,
      entry_number: input.entry_number,
      date_filed_after: input.date_filed_after,
      date_filed_before: input.date_filed_before,
      page,
      page_size: pageSize,
    };

    context.logger.info('Fetching docket entries', {
      docketId: params.docket,
      requestId: context.requestId,
    });

    const entries = (await this.apiClient.getDocketEntries(params)) as PaginatedApiResponse;

    return this.success({
      docket_id: params.docket,
      docket_entries: entries,
      pagination: createPaginationInfo(entries, params.page, params.page_size),
    });
  }
}

export class GetDocketEntryHandler extends TypedToolHandler<typeof getDocketEntrySchema> {
  readonly name = 'get_docket_entry';
  readonly description = 'Get a specific docket entry';
  readonly category = 'dockets';
  protected readonly schema = getDocketEntrySchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof getDocketEntrySchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting docket entry', {
      entryId: input.entry_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getDocketEntry(parseInt(input.entry_id, 10));

    return this.success({
      summary: `Retrieved docket entry ${input.entry_id}`,
      docket_entry: response,
    });
  }
}

export class GetOriginatingCourtInfoHandler extends TypedToolHandler<
  typeof getOriginatingCourtInfoSchema
> {
  readonly name = 'get_originating_court_info';
  readonly description = 'Get originating court information for appeals and transferred matters';
  readonly category = 'dockets';
  protected readonly schema = getOriginatingCourtInfoSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof getOriginatingCourtInfoSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting originating court info', {
      docket: input.docket,
      court: input.court,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getOriginatingCourtInfo({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} originating court records`,
      originating_court_info: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetTagsHandler extends TypedToolHandler<typeof getTagsSchema> {
  readonly name = 'get_tags';
  readonly description = 'Get CourtListener tags used for docket and content organization';
  readonly category = 'dockets';
  protected readonly schema = getTagsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof getTagsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting tags', {
      name: input.name,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getTags({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} tags`,
      tags: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetDocketAlertsHandler extends TypedToolHandler<typeof getDocketAlertsSchema> {
  readonly name = 'get_docket_alerts';
  readonly description = 'Get docket-specific alert subscriptions';
  readonly category = 'dockets';
  protected readonly schema = getDocketAlertsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 1800 } })
  async execute(
    input: z.infer<typeof getDocketAlertsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting docket alerts', {
      docket: input.docket,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getDocketAlerts({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} docket alerts`,
      docket_alerts: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class CreateDocketAlertHandler extends TypedToolHandler<typeof createDocketAlertSchema> {
  readonly name = 'create_docket_alert';
  readonly description = 'Create a docket-specific alert subscription';
  readonly category = 'dockets';
  protected readonly schema = createDocketAlertSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults()
  async execute(
    input: z.infer<typeof createDocketAlertSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Creating docket alert', {
      docket: input.docket,
      requestId: context.requestId,
    });

    const response = await this.apiClient.createDocketAlert(input);

    return this.success({
      summary: `Created docket alert for docket ${input.docket}`,
      result: response,
    });
  }
}
