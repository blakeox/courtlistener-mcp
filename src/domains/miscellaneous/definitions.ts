import { EnhancedTool } from '../../types.js';

export const miscellaneousToolDefinitions: EnhancedTool[] = [
  {
    name: 'validate_citations',
    description:
      'Validate and parse citations from text to prevent AI hallucinations and ensure accurate legal references',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Citation validation',
        description: 'Check if citations in text are valid',
        arguments: {
          text: 'See Roe v. Wade, 410 U.S. 113 (1973) and Brown v. Board, 347 U.S. 483 (1954)',
        },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text containing citations to validate',
          minLength: 1,
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];
