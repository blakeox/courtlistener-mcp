import { EnhancedTool } from '../../types.js';

export const docketToolDefinitions: EnhancedTool[] = [
  {
    name: 'get_docket_entry',
    description: 'Get a specific docket entry',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Single docket entry',
        description: 'Retrieve a single entry',
        arguments: { entry_id: 123 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: { entry_id: { type: ['number', 'string'] } },
      required: ['entry_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_docket_entries',
    description:
      'Get individual court filings and orders for a specific docket, providing case timeline and procedural history',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Get case filings',
        description: 'Retrieve all filings for a docket',
        arguments: { docket: 12345 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        docket: {
          type: ['number', 'string'],
          description: 'Docket ID to get entries for',
        },
        entry_number: {
          type: ['number', 'string'],
          description: 'Specific entry number to filter by',
        },
        date_filed_after: {
          type: 'string',
          description: 'Get entries filed after this date (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        date_filed_before: {
          type: 'string',
          description: 'Get entries filed before this date (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1,
        },
        page_size: {
          type: 'number',
          description: 'Number of entries per page (default: 20, max: 100)',
          minimum: 1,
          maximum: 100,
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from previous response (alternative to page/page_size)',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (used with cursor)',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['docket'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            results: { type: 'array' },
            count: { type: 'number' },
          },
        },
        metadata: { type: 'object' },
        pagination: {
          type: 'object',
          properties: {
            current_page: { type: 'number' },
            total_pages: { type: 'number' },
            total_results: { type: 'number' },
            has_next: { type: 'boolean' },
            has_previous: { type: 'boolean' },
          },
        },
      },
      required: ['success', 'data'],
    },
  },
  {
    name: 'get_originating_court_info',
    description: 'Get originating court information for appeals and transferred matters',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Originating court lookup',
        description: 'List originating court records for a docket',
        arguments: { docket: 12345 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        docket: { type: ['number', 'string'] },
        court: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_tags',
    description: 'Get CourtListener tags used for docket and content organization',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      { name: 'Tag search', description: 'List matching tags', arguments: { name: 'bankruptcy' } },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_docket_alerts',
    description: 'Get docket-specific alert subscriptions',
    category: 'monitoring',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'List alerts',
        description: 'List alerts for a docket',
        arguments: { docket: 12345 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        docket: { type: ['number', 'string'] },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_docket_alert',
    description: 'Create a docket-specific alert subscription',
    category: 'monitoring',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Create daily alert',
        description: 'Create a daily email alert for a docket',
        arguments: { docket: 12345, frequency: 'daily', alert_type: 'email' },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        docket: { type: ['number', 'string'] },
        frequency: { type: 'string' },
        alert_type: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['docket'],
      additionalProperties: false,
    },
  },
];
