import { EnhancedTool } from '../../types.js';

export const searchToolDefinitions: EnhancedTool[] = [
  {
    name: 'search_cases',
    description:
      "Search for legal cases and opinions using CourtListener's comprehensive database with advanced filtering capabilities",
    category: 'search',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Search by citation',
        description: 'Find a specific case using its legal citation',
        arguments: { citation: '410 U.S. 113' },
      },
      {
        name: 'Search by case name',
        description: 'Find cases containing specific names',
        arguments: { case_name: 'Roe v. Wade' },
      },
      {
        name: 'Court-specific search',
        description: "Search within a specific court's opinions",
        arguments: {
          query: 'privacy rights',
          court: 'scotus',
          date_filed_after: '2020-01-01',
        },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for case names, legal concepts, or keywords',
        },
        court: {
          type: 'string',
          description:
            "Court identifier (e.g., 'scotus', 'ca1', 'ca2'). Use list_courts to see available courts.",
        },
        judge: {
          type: 'string',
          description: 'Judge name to filter by',
        },
        case_name: {
          type: 'string',
          description: 'Specific case name to search for',
        },
        citation: {
          type: 'string',
          description: "Legal citation (e.g., '410 U.S. 113')",
        },
        date_filed_after: {
          type: 'string',
          description: 'Find cases filed after this date (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        date_filed_before: {
          type: 'string',
          description: 'Find cases filed before this date (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        precedential_status: {
          type: 'string',
          description: 'Filter by precedential status',
          enum: [
            'Published',
            'Unpublished',
            'Errata',
            'Separate',
            'In-chambers',
            'Relating-to',
            'Unknown',
          ],
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (starts at 1)',
          minimum: 1,
        },
        page_size: {
          type: 'number',
          description: 'Number of results per page (max 100, recommended: 20)',
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
];
