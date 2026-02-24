/**
 * Pagination utilities for consistent response formatting
 * Phase 3: Reduce Complexity
 */

/**
 * Encode an offset as an opaque cursor string (base64url)
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

/**
 * Decode a cursor string back to an offset
 */
export function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = decoded.match(/^offset:(\d+)$/);
  if (!match || match[1] === undefined) {
    throw new Error('Invalid cursor format');
  }
  return parseInt(match[1], 10);
}

/**
 * Resolve cursor/limit or page/page_size to offset/limit.
 * Cursor takes priority when provided.
 */
export function resolveOffsetLimit(params: {
  cursor?: string | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}): { offset: number; limit: number } {
  if (params.cursor) {
    return { offset: decodeCursor(params.cursor), limit: params.limit ?? 20 };
  }
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 20;
  return { offset: (page - 1) * pageSize, limit: pageSize };
}

/**
 * Standard pagination response structure
 */
export interface PaginationInfo {
  page: number;
  page_size?: number;
  pageSize?: number;
  count?: number;
  total_pages?: number;
  totalPages?: number;
  total_results?: number;
  totalCount?: number;
  has_next?: boolean;
  has_previous?: boolean;
  nextCursor?: string;
}

/**
 * API response with pagination
 */
export interface PaginatedApiResponse<T = unknown> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
}

/**
 * Create standardized pagination info from API response
 *
 * @example
 * ```typescript
 * const pagination = createPaginationInfo(response, input.page, input.page_size);
 * return this.success({ results: response.results, pagination });
 * ```
 */
export function createPaginationInfo(
  response: PaginatedApiResponse,
  page: number,
  pageSize: number,
): PaginationInfo {
  const count = response.count ?? 0;
  const totalPages = Math.ceil(count / pageSize);

  const hasNext = page < totalPages;

  return {
    page,
    page_size: pageSize,
    count,
    total_pages: totalPages,
    has_next: hasNext,
    has_previous: page > 1,
    ...(hasNext ? { nextCursor: encodeCursor(page * pageSize) } : {}),
  };
}

/**
 * Alternative format with camelCase for consistency
 */
export function createPaginationInfoCamelCase(
  response: PaginatedApiResponse,
  page: number,
  pageSize: number,
): PaginationInfo {
  const count = response.count ?? 0;
  const totalPages = Math.ceil(count / pageSize);

  const hasNext = page < totalPages;

  return {
    page,
    pageSize,
    totalCount: count,
    totalPages,
    has_next: hasNext,
    has_previous: page > 1,
    ...(hasNext ? { nextCursor: encodeCursor(page * pageSize) } : {}),
  };
}

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  totalCount: number,
  page: number,
  pageSize: number,
): {
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  startIndex: number;
  endIndex: number;
} {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  return {
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
    startIndex,
    endIndex,
  };
}

/**
 * Validate pagination parameters
 */
export function validatePaginationParams(
  page: number,
  pageSize: number,
  maxPageSize: number = 100,
): { valid: boolean; error?: string } {
  if (page < 1) {
    return { valid: false, error: 'Page must be >= 1' };
  }

  if (pageSize < 1) {
    return { valid: false, error: 'Page size must be >= 1' };
  }

  if (pageSize > maxPageSize) {
    return { valid: false, error: `Page size must be <= ${maxPageSize}` };
  }

  return { valid: true };
}

/**
 * Extract results slice for pagination
 */
export function paginateResults<T>(
  items: T[],
  page: number,
  pageSize: number,
): { results: T[]; pagination: PaginationInfo } {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const results = items.slice(startIndex, endIndex);

  return {
    results,
    pagination: {
      page,
      page_size: pageSize,
      count: items.length,
      total_pages: Math.ceil(items.length / pageSize),
      has_next: endIndex < items.length,
      has_previous: page > 1,
    },
  };
}
