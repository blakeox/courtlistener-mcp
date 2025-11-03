/**
 * Response formatting utilities for consistent handler outputs
 * Phase 3: Reduce Complexity
 */

import { PaginatedApiResponse, PaginationInfo, createPaginationInfo } from './pagination-utils.js';

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
  searchParams?: Record<string, unknown>
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
  entityId: string | number
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
  pluralType?: string
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
  pluralType?: string
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
  targetId?: string | number
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
export function formatCountSummary(
  count: number,
  entityType: string,
  pluralType?: string
): string {
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
  entityId?: string | number
): string {
  const pastTense = action.endsWith('e') ? `${action}d` : `${action}ed`;
  
  if (entityId) {
    return `Successfully ${pastTense} ${entityType} ${entityId}`;
  }
  
  return `Successfully ${pastTense} ${entityType}`;
}

