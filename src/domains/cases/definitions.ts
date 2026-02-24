import { EnhancedTool } from '../../types.js';

export const caseToolDefinitions: EnhancedTool[] = [
  {
    name: 'get_case_details',
    description:
      'Get comprehensive details about a specific case including full metadata, citations, and related information',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Get case details',
        description: 'Retrieve full details for a known case',
        arguments: { cluster_id: 112332 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        cluster_id: {
          type: 'number',
          description:
            'CourtListener cluster ID for the case. Use search_cases to find cluster IDs.',
          minimum: 1,
        },
      },
      required: ['cluster_id'],
      additionalProperties: false,
    },
  },
];
