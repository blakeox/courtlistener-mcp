import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CourtListenerAPI } from '../../courtlistener.js';
import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { withDefaults } from '../../server/handler-decorators.js';

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
});

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
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting dockets', {
      court: input.court,
      caseName: input.case_name,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getDockets(input);

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} dockets`,
      dockets: response.results,
      pagination: {
        page: input.page,
        count: response.count,
        total_pages: Math.ceil((response.count || 0) / input.page_size),
      },
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
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting docket details', {
      docketId: input.docket_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getDocket(parseInt(input.docket_id));

    return this.success({
      summary: `Retrieved details for docket ${input.docket_id}`,
      docket: response,
    });
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
    context: ToolContext
  ): Promise<CallToolResult> {
    context.logger.info('Getting RECAP documents', {
      docketId: input.docket_id,
      documentType: input.document_type,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getRECAPDocuments(input);

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} RECAP documents for docket ${input.docket_id}`,
      documents: response.results,
      pagination: {
        page: input.page,
        count: response.count,
        total_pages: Math.ceil((response.count || 0) / input.page_size),
      },
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
    context: ToolContext
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
    context: ToolContext
  ): Promise<CallToolResult> {
    const params = {
      docket: input.docket,
      entry_number: input.entry_number,
      date_filed_after: input.date_filed_after,
      date_filed_before: input.date_filed_before,
      page: input.page,
      page_size: input.page_size,
    };

    context.logger.info('Fetching docket entries', {
      docketId: params.docket,
      requestId: context.requestId,
    });

    const entries = await this.apiClient.getDocketEntries(params);

    return this.success({
      docket_id: params.docket,
      docket_entries: entries,
      pagination: {
        page: params.page,
        page_size: params.page_size,
        total_results: entries.count ?? 0,
      },
    });
  }
}
