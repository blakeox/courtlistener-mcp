import { EnhancedTool } from '../../types.js';

export const enhancedToolDefinitions: EnhancedTool[] = [
  {
    name: 'get_comprehensive_judge_profile',
    description:
      'Get complete judicial profile including positions, education, political affiliations, ABA ratings, and financial disclosures',
    category: 'analysis',
    complexity: 'advanced',
    rateLimitWeight: 4,
    examples: [
      {
        name: 'Complete judge analysis',
        description: 'Get comprehensive profile for judicial analytics',
        arguments: { judge_id: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        judge_id: {
          type: 'number',
          description: 'Judge ID for comprehensive profile',
          minimum: 1,
        },
      },
      required: ['judge_id'],
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
    name: 'get_comprehensive_case_analysis',
    description:
      'Get complete case analysis including docket entries, parties, attorneys, and tags for full case intelligence',
    category: 'analysis',
    complexity: 'advanced',
    rateLimitWeight: 4,
    examples: [
      {
        name: 'Full case intelligence',
        description: 'Get comprehensive case data for legal strategy',
        arguments: { cluster_id: 112332 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        cluster_id: {
          type: 'number',
          description: 'Case cluster ID for comprehensive analysis',
          minimum: 1,
        },
      },
      required: ['cluster_id'],
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
    name: 'get_financial_disclosure_details',
    description:
      'Get detailed financial disclosure information including investments, debts, gifts, and income sources',
    category: 'details',
    complexity: 'intermediate',
    rateLimitWeight: 2,
    examples: [
      {
        name: 'Investment analysis',
        description: 'Get judge investment portfolios',
        arguments: { disclosure_type: 'investments', person: 2581 },
      },
      {
        name: 'Gift analysis',
        description: 'Get gifts received by judge',
        arguments: { disclosure_type: 'gifts', person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        disclosure_type: {
          type: 'string',
          description: 'Type of financial disclosure',
          enum: [
            'investments',
            'debts',
            'gifts',
            'agreements',
            'positions',
            'reimbursements',
            'spouse_incomes',
            'non_investment_incomes',
          ],
        },
        person: {
          type: 'number',
          description: 'Judge ID for financial disclosures',
          minimum: 1,
        },
        year: {
          type: 'number',
          description: 'Disclosure year',
          minimum: 1980,
        },
      },
      required: ['disclosure_type'],
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
    name: 'get_enhanced_recap_data',
    description:
      'Access advanced RECAP/PACER features including document fetching and email notifications',
    category: 'details',
    complexity: 'intermediate',
    rateLimitWeight: 2,
    examples: [
      {
        name: 'Fetch PACER document',
        description: 'Retrieve document from PACER',
        arguments: { action: 'fetch', pacer_doc_id: '12345' },
      },
      {
        name: 'RECAP query',
        description: 'Query RECAP database',
        arguments: { action: 'query', court: 'dcd', case_number: '1:20-cv-01234' },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'RECAP action to perform',
          enum: ['fetch', 'query', 'email'],
        },
        pacer_doc_id: {
          type: 'string',
          description: 'PACER document ID for fetching',
        },
        court: {
          type: 'string',
          description: 'Court identifier for queries',
        },
        case_number: {
          type: 'string',
          description: 'Case number for queries',
        },
      },
      required: ['action'],
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
