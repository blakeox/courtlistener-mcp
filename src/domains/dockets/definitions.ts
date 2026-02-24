import { EnhancedTool } from '../../types.js';

export const docketToolDefinitions: EnhancedTool[] = [
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
      },
      required: ['docket'],
      additionalProperties: false,
    },
  },
];
