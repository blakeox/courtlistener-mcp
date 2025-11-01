/**
 * Common validation utilities and type-safe helpers
 */

import { z } from 'zod';
import { Result, failure, success } from './types.js';

/**
 * Type-safe configuration value parser
 */
export function parseLogLevel(value: string | undefined): 'debug' | 'info' | 'warn' | 'error' {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  return 'info';
}

/**
 * Type-safe configuration value parser
 */
export function parseLogFormat(value: string | undefined): 'json' | 'text' {
  if (value === 'json' || value === 'text') {
    return value;
  }
  return 'json';
}

/**
 * Safe integer parser with validation
 */
export function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
  min = 1,
  max?: number,
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    return defaultValue;
  }
  return parsed;
}

/**
 * Validate with Zod schema and return Result type
 */
export function validateWithZod<T>(schema: z.ZodSchema<T>, input: unknown): Result<T, Error> {
  try {
    const parsed = schema.parse(input);
    return success(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return failure(new Error(`Validation failed: ${message}`));
    }
    return failure(error as Error);
  }
}

/**
 * Type-safe handler input validator
 */
export interface ValidatedInput<T> {
  readonly value: T;
}

/**
 * Create a validated input wrapper
 */
export function createValidatedInput<T>(value: T): ValidatedInput<T> {
  return { value };
}
