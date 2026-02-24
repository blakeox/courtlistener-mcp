import { EnhancedTool } from '../../types.js';

export const courtToolDefinitions: EnhancedTool[] = [
  {
    name: 'list_courts',
    description:
      'List all available courts with their metadata, jurisdiction information, and operational status',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'List all federal courts',
        description: 'Get all federal courts currently in use',
        arguments: { jurisdiction: 'F', in_use: true },
      },
      {
        name: 'List Supreme Court',
        description: 'Get Supreme Court information',
        arguments: { jurisdiction: 'F' },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        jurisdiction: {
          type: 'string',
          description: 'Filter by jurisdiction: F=Federal, S=State, C=Circuit, etc.',
          enum: ['F', 'FD', 'FB', 'FT', 'FS', 'S', 'SA', 'C', 'I'],
        },
        in_use: {
          type: 'boolean',
          description: 'Filter by whether court is currently in use',
        },
      },
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
];
