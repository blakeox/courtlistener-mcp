/**
 * Response Builder
 *
 * Utility for creating consistent CallToolResult responses across all handlers.
 *
 * **Benefits**:
 * - Consistent response formatting
 * - Easier to modify response structure globally
 * - Type-safe response creation
 * - Centralized response logic
 *
 * @example
 * ```typescript
 * // Success response
 * return ResponseBuilder.success({ caseId: '123', name: 'Case Name' });
 *
 * // Success with metadata
 * return ResponseBuilder.success(data, { cached: true, duration: 150 });
 *
 * // Error response
 * return ResponseBuilder.error('Case not found', { caseId: '123' });
 *
 * // Paginated response
 * return ResponseBuilder.paginated(cases, {
 *   page: 1,
 *   totalPages: 10,
 *   totalItems: 100,
 *   hasNext: true,
 *   hasPrevious: false
 * });
 * ```
 */

import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { PaginatedApiResponse, PaginationInfo, createPaginationInfo } from './pagination-utils.js';

/**
 * Pagination metadata for list responses
 */
export interface PaginationMetadata {
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages?: number;
  /** Total number of items across all pages */
  totalItems?: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrevious: boolean;
  /** Number of items per page */
  pageSize?: number;
}

/**
 * Response metadata for additional information
 */
export interface ResponseMetadata {
  /** Whether response was served from cache */
  cached?: boolean;
  /** Response duration in milliseconds */
  duration?: number;
  /** API version */
  apiVersion?: string;
  /** Any other custom metadata */
  [key: string]: unknown;
}

/**
 * ResponseBuilder
 *
 * Factory for creating standardized MCP CallToolResult responses.
 */
export class ResponseBuilder {
  /**
   * Create a successful response
   *
   * @param data - Response data
   * @param metadata - Optional metadata (cached, duration, etc.)
   * @returns CallToolResult with success format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.success({ id: '123', name: 'Case' });
   * return ResponseBuilder.success(data, { cached: true });
   * ```
   */
  static success(data: unknown, metadata?: ResponseMetadata): CallToolResult {
    const response = metadata
      ? { success: true as const, data, metadata }
      : { success: true as const, data };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        } as TextContent,
      ],
      structuredContent: response as Record<string, unknown>,
    };
  }

  /**
   * Create an error response
   *
   * @param message - Error message
   * @param details - Optional error details
   * @returns CallToolResult with error format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.error('Case not found', { caseId: '123' });
   * ```
   */
  static error(message: string, details?: Record<string, unknown>): CallToolResult {
    const response = details
      ? { success: false as const, error: message, details }
      : { success: false as const, error: message };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        } as TextContent,
      ],
      isError: true,
    };
  }

  /**
   * Create a paginated list response
   *
   * @param items - Array of items for current page
   * @param pagination - Pagination metadata
   * @param metadata - Optional response metadata
   * @returns CallToolResult with paginated format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.paginated(cases, {
   *   page: 1,
   *   totalPages: 10,
   *   totalItems: 100,
   *   hasNext: true,
   *   hasPrevious: false,
   *   pageSize: 10
   * });
   * ```
   */
  static paginated<T>(
    items: T[],
    pagination: PaginationMetadata,
    metadata?: ResponseMetadata,
  ): CallToolResult {
    const response = {
      success: true as const,
      data: items,
      pagination,
      ...(metadata && { metadata }),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        } as TextContent,
      ],
      structuredContent: response as Record<string, unknown>,
    };
  }

  /**
   * Create a response with custom content
   *
   * @param content - Custom MCP content array
   * @returns CallToolResult with custom content
   *
   * @example
   * ```typescript
   * return ResponseBuilder.custom([
   *   { type: 'text', text: 'First part' },
   *   { type: 'text', text: 'Second part' }
   * ]);
   * ```
   */
  static custom(content: TextContent[]): CallToolResult {
    return { content };
  }

  /**
   * Create a streaming response indicator
   *
   * @param message - Message indicating streaming
   * @param metadata - Optional metadata about the stream
   * @returns CallToolResult indicating streaming
   *
   * @example
   * ```typescript
   * return ResponseBuilder.streaming('Fetching large dataset...', {
   *   estimatedItems: 10000
   * });
   * ```
   */
  static streaming(message: string, metadata?: Record<string, unknown>): CallToolResult {
    return this.success({ streaming: true, message }, metadata);
  }

  /**
   * Create a validation error response
   *
   * @param field - Field that failed validation
   * @param message - Validation error message
   * @param value - Invalid value (optional)
   * @returns CallToolResult with validation error format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.validationError('query', 'Query cannot be empty', '');
   * ```
   */
  static validationError(field: string, message: string, value?: unknown): CallToolResult {
    return this.error(`Validation failed for '${field}': ${message}`, {
      field,
      ...(value !== undefined && { value }),
    });
  }

  /**
   * Create a not found response
   *
   * @param resource - Resource type that wasn't found
   * @param identifier - Identifier that wasn't found
   * @returns CallToolResult with not found format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.notFound('case', '12345');
   * ```
   */
  static notFound(resource: string, identifier: string | number): CallToolResult {
    return this.error(`${resource} not found`, {
      resource,
      identifier,
      statusCode: 404,
    });
  }

  /**
   * Create a rate limit exceeded response
   *
   * @param retryAfter - Seconds until retry is allowed
   * @param details - Optional details
   * @returns CallToolResult with rate limit format
   *
   * @example
   * ```typescript
   * return ResponseBuilder.rateLimitExceeded(60, { limit: 100 });
   * ```
   */
  static rateLimitExceeded(retryAfter: number, details?: Record<string, unknown>): CallToolResult {
    return this.error('Rate limit exceeded', {
      retryAfter,
      statusCode: 429,
      ...details,
    });
  }
}

// ---------------------------------------------------------------------------
// Response formatting utilities (merged from response-utils.ts)
// ---------------------------------------------------------------------------

/**
 * Standard search result response
 */
export interface SearchResultResponse<T = unknown> {
  summary: string;
  results: T[];
  pagination?: PaginationInfo;
  search_parameters?: Record<string, unknown>;
}

/**
 * Create standardized search result response
 */
export function createSearchResponse<T>(
  results: T[],
  count: number,
  page: number,
  pageSize: number,
  searchParams?: Record<string, unknown>,
): SearchResultResponse<T> {
  return {
    summary: `Found ${count} results`,
    results,
    pagination: createPaginationInfo({ count, results }, page, pageSize),
    ...(searchParams && { search_parameters: searchParams }),
  };
}

/**
 * Create response for single entity fetch
 */
export function createEntityResponse<T>(
  entity: T,
  entityType: string,
  entityId: string | number,
): {
  summary: string;
  [key: string]: unknown;
} {
  return {
    summary: `Retrieved ${entityType} ${entityId}`,
    [entityType]: entity,
  };
}

/**
 * Create response for list of entities
 */
export function createListResponse<T>(
  entities: T[],
  entityType: string,
  pluralType?: string,
): {
  summary: string;
  [key: string]: unknown;
} {
  const plural = pluralType || `${entityType}s`;
  return {
    summary: `Retrieved ${entities.length} ${plural}`,
    [plural]: entities,
  };
}

/**
 * Create response with pagination for list queries
 */
export function createPaginatedListResponse<T>(
  response: PaginatedApiResponse<T>,
  page: number,
  pageSize: number,
  entityType: string,
  pluralType?: string,
): {
  summary: string;
  pagination: PaginationInfo;
  [key: string]: unknown;
} {
  const plural = pluralType || `${entityType}s`;
  const results = response.results || [];

  return {
    summary: `Retrieved ${results.length} ${plural}`,
    [plural]: results,
    pagination: createPaginationInfo(response, page, pageSize),
  };
}

/**
 * Create analysis response with structured data
 */
export function createAnalysisResponse<T>(
  analysis: T,
  analysisType: string,
  targetId?: string | number,
): {
  summary: string;
  analysis: T;
} {
  const summary = targetId
    ? `Analyzed ${analysisType} for ${targetId}`
    : `Completed ${analysisType} analysis`;

  return {
    summary,
    analysis,
  };
}

/**
 * Format summary message with count
 */
export function formatCountSummary(count: number, entityType: string, pluralType?: string): string {
  const plural = pluralType || `${entityType}s`;
  const singular = entityType;

  if (count === 0) return `No ${plural} found`;
  if (count === 1) return `Found 1 ${singular}`;
  return `Found ${count} ${plural}`;
}

/**
 * Format action summary message
 */
export function formatActionSummary(
  action: string,
  entityType: string,
  entityId?: string | number,
): string {
  const pastTense = action.endsWith('e') ? `${action}d` : `${action}ed`;

  if (entityId) {
    return `Successfully ${pastTense} ${entityType} ${entityId}`;
  }

  return `Successfully ${pastTense} ${entityType}`;
}
