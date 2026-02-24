import { EnhancedTool } from '../../types.js';

export const opinionToolDefinitions: EnhancedTool[] = [
  {
    name: 'get_opinion_text',
    description:
      'Retrieve the full text content of a specific legal opinion, including HTML and plain text formats',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Get opinion full text',
        description: 'Retrieve the complete text of an opinion for analysis',
        arguments: { opinion_id: 108713 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        opinion_id: {
          type: 'number',
          description:
            'CourtListener opinion ID. Use get_case_details to find opinion IDs from a case.',
          minimum: 1,
        },
      },
      required: ['opinion_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object' },
        metadata: { type: 'object' },
      },
      required: ['success', 'data'],
    },
  },
  {
    name: 'analyze_legal_argument',
    description:
      'Analyze a legal argument by finding supporting and opposing cases, with AI-powered relevance assessment',
    category: 'analysis',
    complexity: 'advanced',
    rateLimitWeight: 3,
    examples: [
      {
        name: 'Constitutional analysis',
        description: 'Find cases supporting a constitutional argument',
        arguments: {
          argument: 'The First Amendment protects commercial speech',
          search_query: 'commercial speech First Amendment',
          jurisdiction: 'scotus',
        },
      },
      {
        name: 'Precedent research',
        description: 'Research precedents for a specific legal principle',
        arguments: {
          argument: 'Qualified immunity protects government officials',
          search_query: 'qualified immunity government officials',
          date_range_start: '2010-01-01',
        },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        argument: {
          type: 'string',
          description: 'The legal argument or claim to analyze',
          minLength: 1,
        },
        search_query: {
          type: 'string',
          description: 'Keywords to search for relevant cases',
          minLength: 1,
        },
        jurisdiction: {
          type: 'string',
          description: 'Limit search to specific jurisdiction (court identifier)',
        },
        date_range_start: {
          type: 'string',
          description: 'Start date for case search (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
        date_range_end: {
          type: 'string',
          description: 'End date for case search (YYYY-MM-DD)',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
      },
      required: ['argument', 'search_query'],
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
      },
      required: ['success', 'data'],
    },
  },
  {
    name: 'get_citation_network',
    description:
      'Analyze citation networks and precedent relationships to understand case law evolution and influence',
    category: 'analysis',
    complexity: 'advanced',
    rateLimitWeight: 2,
    examples: [
      {
        name: 'Citation influence analysis',
        description: 'Map how a landmark case influenced later decisions',
        arguments: {
          opinion_id: 108713,
          depth: 2,
          cited_by: true,
          cites_to: true,
        },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        opinion_id: {
          type: 'number',
          description: 'Opinion ID to analyze citation network for',
          minimum: 1,
        },
        depth: {
          type: 'number',
          description: 'Depth of citation network to traverse (1-3, higher = more comprehensive)',
          minimum: 1,
          maximum: 3,
        },
        cited_by: {
          type: 'boolean',
          description: 'Include cases that cite this opinion (default: true)',
        },
        cites_to: {
          type: 'boolean',
          description: 'Include cases that this opinion cites (default: true)',
        },
      },
      required: ['opinion_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object' },
        metadata: { type: 'object' },
      },
      required: ['success', 'data'],
    },
  },
];
