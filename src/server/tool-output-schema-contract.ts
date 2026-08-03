/**
 * Canonical structuredContent output schemas for MCP tools.
 * Describes the ResponseBuilder envelope returned in CallToolResult.structuredContent.
 */

export type ToolOutputSchema = {
  type: 'object';
  properties: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
};

const METADATA_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} as const;

const PAGINATION_SCHEMA = {
  type: 'object',
  properties: {
    page: { type: 'number' },
    totalPages: { type: 'number' },
    totalItems: { type: 'number' },
    hasNext: { type: 'boolean' },
    hasPrevious: { type: 'boolean' },
    pageSize: { type: 'number' },
    nextCursor: { type: 'string' },
  },
  additionalProperties: true,
} as const;

export const TOOL_OUTPUT_SEARCH_RESULTS: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        results: { type: 'array', items: { type: 'object', additionalProperties: true } },
        count: { type: 'number' },
        pagination: PAGINATION_SCHEMA,
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_PAGINATED_LIST: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    pagination: PAGINATION_SCHEMA,
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data', 'pagination'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_OBJECT_DETAIL: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', additionalProperties: true },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_ANALYSIS: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        analysis: { type: 'object', additionalProperties: true },
        results: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_MUTATION: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        result: { type: 'object', additionalProperties: true },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_VALIDATION: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        citations: { type: 'array', items: { type: 'object', additionalProperties: true } },
        valid: { type: 'boolean' },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_ASYNC_STATUS: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['queued', 'running', 'succeeded', 'failed', 'expired'],
        },
        toolName: { type: 'string' },
        updatedAt: { type: 'string' },
        expiresAt: { type: 'string' },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_ASYNC_RESULT: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string' },
        result: { type: 'object', additionalProperties: true },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

export const TOOL_OUTPUT_ASYNC_CANCEL: ToolOutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        cancelled: { type: 'boolean' },
        status: { type: 'string' },
      },
      additionalProperties: true,
    },
    metadata: METADATA_SCHEMA,
  },
  required: ['success', 'data'],
  additionalProperties: false,
};

const SEARCH_TOOLS = new Set([
  'search_cases',
  'search_opinions',
  'advanced_search',
  'smart_search',
  'lookup_citation',
  'list_courts',
]);

const PAGINATED_LIST_TOOLS = new Set([
  'get_docket_entries',
  'get_dockets',
  'get_judges',
  'get_oral_arguments',
  'get_recap_documents',
  'get_financial_disclosures',
  'get_docket_alerts',
  'get_judge_educations',
  'get_judge_political_affiliations',
  'get_judicial_positions',
  'get_memberships',
  'get_opinion_citations',
  'get_parties_and_attorneys',
  'get_related_cases',
  'get_retention_events',
  'get_schools',
  'get_tags',
  'get_aba_ratings',
  'get_authorities',
]);

const ANALYSIS_TOOLS = new Set([
  'analyze_case_authorities',
  'analyze_legal_argument',
  'get_citation_network',
  'get_comprehensive_case_analysis',
  'get_comprehensive_judge_profile',
  'get_visualization_data',
  'get_visualization_metadata',
]);

const MUTATION_TOOLS = new Set(['manage_alerts', 'create_docket_alert']);

const VALIDATION_TOOLS = new Set(['validate_citations']);

export type ToolOutputSchemaKind =
  | 'search'
  | 'paginated'
  | 'analysis'
  | 'mutation'
  | 'validation'
  | 'detail';

export function classifyToolOutputSchemaKind(toolName: string): ToolOutputSchemaKind {
  if (SEARCH_TOOLS.has(toolName)) {
    return 'search';
  }
  if (PAGINATED_LIST_TOOLS.has(toolName)) {
    return 'paginated';
  }
  if (ANALYSIS_TOOLS.has(toolName)) {
    return 'analysis';
  }
  if (MUTATION_TOOLS.has(toolName)) {
    return 'mutation';
  }
  if (VALIDATION_TOOLS.has(toolName)) {
    return 'validation';
  }
  return 'detail';
}

export function buildDefaultToolOutputSchema(kind: ToolOutputSchemaKind): ToolOutputSchema {
  switch (kind) {
    case 'search':
      return TOOL_OUTPUT_SEARCH_RESULTS;
    case 'paginated':
      return TOOL_OUTPUT_PAGINATED_LIST;
    case 'analysis':
      return TOOL_OUTPUT_ANALYSIS;
    case 'mutation':
      return TOOL_OUTPUT_MUTATION;
    case 'validation':
      return TOOL_OUTPUT_VALIDATION;
    case 'detail':
      return TOOL_OUTPUT_OBJECT_DETAIL;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function resolveToolOutputSchema(
  toolName: string,
  explicit?: ToolOutputSchema,
): ToolOutputSchema {
  if (explicit) {
    return explicit;
  }
  return buildDefaultToolOutputSchema(classifyToolOutputSchemaKind(toolName));
}
