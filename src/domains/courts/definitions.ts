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
  {
    name: 'get_judicial_positions',
    description: 'Get judicial positions and appointments for a person or court',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Judge appointment history',
        description: 'List judicial positions for a person',
        arguments: { person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
        court: { type: 'string' },
        position_type: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_judicial_position',
    description: 'Get a specific judicial position by ID',
    category: 'details',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Position detail',
        description: 'Fetch one judicial position',
        arguments: { position_id: 100 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: { position_id: { type: ['string', 'number'] } },
      required: ['position_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_judge_educations',
    description: 'Get education history for judges and judicial figures',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Judge education',
        description: 'List education history',
        arguments: { person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
        school: { type: 'string' },
        degree_level: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_judge_political_affiliations',
    description: 'Get political affiliation records for judges',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Political affiliations',
        description: 'List affiliations for a judge',
        arguments: { person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
        political_party: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_aba_ratings',
    description: 'Get ABA ratings for judges',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'ABA ratings',
        description: 'List ABA ratings for a person',
        arguments: { person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_retention_events',
    description: 'Get judicial retention and re-election event records',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'Retention history',
        description: 'List retention events',
        arguments: { person: 2581 },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
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
    name: 'get_schools',
    description: 'Get educational institutions referenced by CourtListener judicial data',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      {
        name: 'School search',
        description: 'Find schools by name',
        arguments: { name: 'Harvard' },
      },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_memberships',
    description: 'Get professional memberships for judges and judicial figures',
    category: 'reference',
    complexity: 'simple',
    rateLimitWeight: 1,
    examples: [
      { name: 'Judge memberships', description: 'List memberships', arguments: { person: 2581 } },
    ],
    inputSchema: {
      type: 'object',
      properties: {
        person: { type: ['string', 'number'] },
        organization: { type: 'string' },
        page: { type: 'number', minimum: 1 },
        page_size: { type: 'number', minimum: 1, maximum: 100 },
        cursor: { type: 'string' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
];
