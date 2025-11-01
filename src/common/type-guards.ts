/**
 * Type Guards
 *
 * Runtime type checking utilities for TypeScript.
 * Type guards provide type safety at runtime and improve TypeScript's type inference.
 *
 * @example
 * ```typescript
 * // Check if a value is a CourtListener response
 * if (isCourtListenerResponse(data)) {
 *   // TypeScript now knows data has 'results' property
 *   console.log(data.results.length);
 * }
 *
 * // Check if error is a specific type
 * try {
 *   await operation();
 * } catch (error) {
 *   if (isApplicationError(error)) {
 *     console.log(error.code, error.statusCode);
 *   }
 * }
 * ```
 */

import { ApplicationError, ApiError, ValidationError, RateLimitError } from './errors.js';
import { CourtListenerResponse, ServerConfig } from '../types.js';

/**
 * Check if a value is a non-null object
 *
 * @param value - Value to check
 * @returns True if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a string
 *
 * @param value - Value to check
 * @returns True if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if a value is a number
 *
 * @param value - Value to check
 * @returns True if value is a finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Check if a value is a boolean
 *
 * @param value - Value to check
 * @returns True if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if a value is an array
 *
 * @param value - Value to check
 * @returns True if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if a value is a CourtListener API response
 *
 * @param value - Value to check
 * @returns True if value matches CourtListenerResponse structure
 *
 * @example
 * ```typescript
 * const data = await api.fetch('/cases');
 * if (isCourtListenerResponse(data)) {
 *   // TypeScript knows data.results exists
 *   data.results.forEach(item => console.log(item));
 * }
 * ```
 */
export function isCourtListenerResponse<T = unknown>(
  value: unknown,
): value is CourtListenerResponse<T> {
  if (!isObject(value)) return false;

  // Must have 'results' array
  if (!('results' in value) || !isArray(value.results)) {
    return false;
  }

  // Optional pagination fields
  if ('count' in value && typeof value.count !== 'number') {
    return false;
  }

  if ('next' in value && value.next !== null && typeof value.next !== 'string') {
    return false;
  }

  if ('previous' in value && value.previous !== null && typeof value.previous !== 'string') {
    return false;
  }

  return true;
}

/**
 * Check if a value is an ApplicationError
 *
 * @param value - Value to check
 * @returns True if value is an ApplicationError
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error) {
 *   if (isApplicationError(error)) {
 *     console.log(`Error ${error.code}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function isApplicationError(value: unknown): value is ApplicationError {
  return value instanceof ApplicationError;
}

/**
 * Check if a value is an ApiError
 *
 * @param value - Value to check
 * @returns True if value is an ApiError
 */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * Check if a value is a ValidationError
 *
 * @param value - Value to check
 * @returns True if value is a ValidationError
 */
export function isValidationError(value: unknown): value is ValidationError {
  return value instanceof ValidationError;
}

/**
 * Check if a value is a RateLimitError
 *
 * @param value - Value to check
 * @returns True if value is a RateLimitError
 */
export function isRateLimitError(value: unknown): value is RateLimitError {
  return value instanceof RateLimitError;
}

/**
 * Check if a value is an Error (native or custom)
 *
 * @param value - Value to check
 * @returns True if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if a value has required ServerConfig properties
 *
 * @param value - Value to check
 * @returns True if value has ServerConfig structure
 */
export function isServerConfig(value: unknown): value is ServerConfig {
  if (!isObject(value)) return false;

  // Check required top-level properties
  return (
    'courtListener' in value &&
    isObject(value.courtListener) &&
    'cache' in value &&
    isObject(value.cache) &&
    'logging' in value &&
    isObject(value.logging)
  );
}

/**
 * Assert that a value is defined (not null or undefined)
 * Throws an error if the value is null or undefined
 *
 * @param value - Value to check
 * @param message - Error message if assertion fails
 * @throws {Error} If value is null or undefined
 *
 * @example
 * ```typescript
 * const user = await getUser(id);
 * assertDefined(user, 'User not found');
 * // TypeScript now knows user is not null/undefined
 * console.log(user.name);
 * ```
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined',
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is a string
 * Throws an error if the value is not a string
 *
 * @param value - Value to check
 * @param message - Error message if assertion fails
 * @throws {Error} If value is not a string
 */
export function assertString(
  value: unknown,
  message = 'Value is not a string',
): asserts value is string {
  if (!isString(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is a number
 * Throws an error if the value is not a number
 *
 * @param value - Value to check
 * @param message - Error message if assertion fails
 * @throws {Error} If value is not a number
 */
export function assertNumber(
  value: unknown,
  message = 'Value is not a number',
): asserts value is number {
  if (!isNumber(value)) {
    throw new Error(message);
  }
}

/**
 * Narrow a value to a specific type with a custom predicate
 *
 * @param value - Value to check
 * @param predicate - Custom type guard function
 * @returns The value if predicate is true, undefined otherwise
 *
 * @example
 * ```typescript
 * const value = narrowType(data, isCourtListenerResponse);
 * if (value) {
 *   // TypeScript knows value is CourtListenerResponse
 *   console.log(value.results);
 * }
 * ```
 */
export function narrowType<T>(
  value: unknown,
  predicate: (val: unknown) => val is T,
): T | undefined {
  return predicate(value) ? value : undefined;
}
