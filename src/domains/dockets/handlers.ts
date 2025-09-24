import { BaseToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { Result } from '../../common/types.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * Handler for getting dockets
 */
export class GetDocketsHandler extends BaseToolHandler {
  readonly name = 'get_dockets';
  readonly description = 'Get docket information with filtering options';
  readonly category = 'dockets';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        court: z.string().optional(),
        case_name: z.string().optional(),
        docket_number: z.string().optional(),
        date_filed: z.string().optional(),
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
        court: {
          type: 'string',
          description: 'Filter by court'
        },
        case_name: {
          type: 'string',
          description: 'Search by case name'
        },
        docket_number: {
          type: 'string',
          description: 'Filter by docket number'
        },
        date_filed: {
          type: 'string',
          description: 'Filter by filing date (YYYY-MM-DD or range)'
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
          description: 'Number of dockets per page',
          default: 20
        }
      }
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting dockets', {
        court: input.court,
        caseName: input.case_name,
        requestId: context.requestId
      });

      const response = await this.apiClient.getDockets(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} dockets`,
        dockets: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size)
        }
      });
    } catch (error) {
      context.logger.error('Failed to get dockets', error as Error, {
        requestId: context.requestId
      });
      return this.error((error as Error).message);
    }
  }
}

/**
 * Handler for getting specific docket information
 */
export class GetDocketHandler extends BaseToolHandler {
  readonly name = 'get_docket';
  readonly description = 'Get detailed information about a specific docket';
  readonly category = 'dockets';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        docket_id: z.union([z.string(), z.number()]).transform(String),
        include_entries: z.boolean().optional().default(true)
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
          description: 'Docket ID to retrieve information for'
        },
        include_entries: {
          type: 'boolean',
          description: 'Whether to include docket entries',
          default: true
        }
      },
      required: ['docket_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting docket details', {
        docketId: input.docket_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getDocket(input.docket_id);

      return this.success({
        summary: `Retrieved details for docket ${input.docket_id}`,
        docket: response
      });
    } catch (error) {
      context.logger.error('Failed to get docket details', error as Error, {
        docketId: input.docket_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { docketId: input.docket_id });
    }
  }
}

/**
 * Handler for managing RECAP documents
 */
export class GetRecapDocumentsHandler extends BaseToolHandler {
  readonly name = 'get_recap_documents';
  readonly description = 'Get RECAP documents for a docket';
  readonly category = 'dockets';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        docket_id: z.union([z.string(), z.number()]).transform(String),
        document_type: z.string().optional(),
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
        docket_id: {
          type: ['string', 'number'],
          description: 'Docket ID to get documents for'
        },
        document_type: {
          type: 'string',
          description: 'Filter by document type'
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
          description: 'Number of documents per page',
          default: 20
        }
      },
      required: ['docket_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting RECAP documents', {
        docketId: input.docket_id,
        documentType: input.document_type,
        requestId: context.requestId
      });

      const response = await this.apiClient.getRECAPDocuments(input);

      return this.success({
        summary: `Retrieved ${response.results?.length || 0} RECAP documents for docket ${input.docket_id}`,
        documents: response.results,
        pagination: {
          page: input.page,
          count: response.count,
          total_pages: Math.ceil((response.count || 0) / input.page_size)
        }
      });
    } catch (error) {
      context.logger.error('Failed to get RECAP documents', error as Error, {
        docketId: input.docket_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { docketId: input.docket_id });
    }
  }
}

/**
 * Handler for getting specific RECAP document
 */
export class GetRecapDocumentHandler extends BaseToolHandler {
  readonly name = 'get_recap_document';
  readonly description = 'Get a specific RECAP document';
  readonly category = 'dockets';

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const schema = z.object({
        document_id: z.union([z.string(), z.number()]).transform(String),
        include_content: z.boolean().optional().default(false)
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
        document_id: {
          type: ['string', 'number'],
          description: 'RECAP document ID to retrieve'
        },
        include_content: {
          type: 'boolean',
          description: 'Whether to include document content/text',
          default: false
        }
      },
      required: ['document_id']
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    try {
      context.logger.info('Getting RECAP document', {
        documentId: input.document_id,
        requestId: context.requestId
      });

      const response = await this.apiClient.getRECAPDocument(input.document_id);

      return this.success({
        summary: `Retrieved RECAP document ${input.document_id}`,
        document: response
      });
    } catch (error) {
      context.logger.error('Failed to get RECAP document', error as Error, {
        documentId: input.document_id,
        requestId: context.requestId
      });
      return this.error((error as Error).message, { documentId: input.document_id });
    }
  }
}

export class GetDocketEntriesHandler extends BaseToolHandler {
  readonly name = 'get_docket_entries';
  readonly description = 'Retrieve individual docket entries with filtering and pagination';
  readonly category = 'dockets';

  private static schema = z.object({
    docket: z.union([z.string(), z.number()]).transform(String),
    entry_number: z.union([z.string(), z.number()]).transform(String).optional(),
    date_filed_after: z.string().optional(),
    date_filed_before: z.string().optional(),
    page: z.number().min(1).optional().default(1),
    page_size: z.number().min(1).max(100).optional().default(20)
  });

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  validate(input: any): Result<any, Error> {
    try {
      const parsed = GetDocketEntriesHandler.schema.parse(input || {});
      return { success: true, data: parsed };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }

  getSchema(): any {
    return {
      type: 'object',
      properties: {
        docket: {
          type: ['string', 'number'],
          description: 'Docket ID to retrieve entries for'
        },
        entry_number: {
          type: ['string', 'number'],
          description: 'Filter to a specific entry number'
        },
        date_filed_after: {
          type: 'string',
          description: 'Return entries filed after this date (YYYY-MM-DD)'
        },
        date_filed_before: {
          type: 'string',
          description: 'Return entries filed before this date (YYYY-MM-DD)'
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
          description: 'Number of entries per page (max 100)',
          default: 20
        }
      },
      required: ['docket'],
      additionalProperties: false
    };
  }

  async execute(input: any, context: ToolContext): Promise<CallToolResult> {
    const params = {
      docket: input.docket,
      entry_number: input.entry_number,
      date_filed_after: input.date_filed_after,
      date_filed_before: input.date_filed_before,
      page: input.page ?? 1,
      page_size: input.page_size ?? 20
    };

    const timer = context.logger.startTimer('get_docket_entries');

    try {
      const cacheKey = 'docket_entries';
      const cached = context.cache?.get<any>(cacheKey, params);
      if (cached) {
        context.logger.info('Returning cached docket entries', {
          docketId: params.docket,
          requestId: context.requestId
        });
        context.metrics?.recordRequest(timer.end(true), true);
        return this.success(cached);
      }

      context.logger.info('Fetching docket entries', {
        docketId: params.docket,
        requestId: context.requestId
      });

      const entries = await this.apiClient.getDocketEntries(params);

      const result = {
        docket_id: params.docket,
        docket_entries: entries,
        pagination: {
          page: params.page,
          page_size: params.page_size,
          total_results: entries.count ?? 0
        }
      };

      context.cache?.set(cacheKey, params, result, 1800);
      context.metrics?.recordRequest(timer.end(true), false);

      return this.success(result);
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      context.metrics?.recordFailure(duration);
      context.logger.error('Failed to fetch docket entries', error as Error, {
        docketId: params.docket,
        requestId: context.requestId
      });

      return this.error('Failed to retrieve docket entries', {
        message: (error as Error).message
      });
    }
  }
}