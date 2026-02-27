import { z } from 'zod';

/**
 * Shared pagination schema fields used across domain handlers.
 * Provides consistent page/page_size/cursor/limit parameters.
 *
 * @example
 * const mySchema = z.object({
 *   query: z.string(),
 *   ...paginationFields(),
 * });
 */
export function paginationFields(defaults?: {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}) {
  const { page = 1, pageSize = 20, maxPageSize = 100 } = defaults ?? {};
  return {
    page: z.number().int().min(1).optional().default(page),
    page_size: z.number().int().min(1).max(maxPageSize).optional().default(pageSize),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(maxPageSize).optional(),
  };
}

/** Pre-built pagination schema for direct use */
export const PaginationSchema = z.object(paginationFields());

export type PaginationParams = z.infer<typeof PaginationSchema>;
