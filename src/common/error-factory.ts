/**
 * Error Factory
 * Provides a consistent way to create and handle errors across the application
 */

import {
  ApplicationError,
  ApiError,
  CircuitBreakerError,
  ConfigurationError,
  RateLimitError,
  ValidationError,
} from './errors.js';

/**
 * Context information for errors
 *
 * Provides additional metadata for debugging and tracing errors.
 */
export interface ErrorContext {
  /** Tool name that generated the error */
  tool?: string;
  /** Parameters passed to the tool/function */
  params?: Record<string, unknown>;
  /** User identifier for tracing */
  userId?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** API endpoint that failed */
  endpoint?: string;
  /** HTTP status code */
  statusCode?: number;
  /** Any other custom context */
  [key: string]: unknown;
}

/**
 * Error Factory
 *
 * Centralized factory for creating and handling errors consistently
 * across the application.
 *
 * **Benefits**:
 * - Consistent error creation patterns
 * - Automatic context tracking
 * - Type-safe error handling
 * - Formatted logging output
 * - User-friendly error messages
 *
 * @example
 * ```typescript
 * // Validation error
 * throw ErrorFactory.validation('Invalid query',
 *   { field: 'query', value: '' },
 *   { tool: 'search_cases' }
 * );
 *
 * // API error
 * throw ErrorFactory.api('Case not found', 404,
 *   { caseId: '123' },
 *   { endpoint: '/api/cases/123' }
 * );
 *
 * // Rate limit error
 * throw ErrorFactory.rateLimit('Too many requests', 60);
 *
 * // Convert unknown error
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   throw ErrorFactory.fromUnknown(error, { tool: 'search' });
 * }
 * ```
 */
export class ErrorFactory {
  /**
   * Create a validation error
   *
   * @param message - Error message
   * @param details - Additional error details
   * @param context - Error context (tool, params, etc.)
   * @returns ValidationError instance
   *
   * @example
   * ```typescript
   * throw ErrorFactory.validation('Invalid parameter', { field: 'query' }, { tool: 'search_cases' });
   * ```
   */
  static validation(
    message: string,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): ValidationError {
    const error = new ValidationError(message, details);
    if (context) {
      this.addContext(error, context);
    }
    return error;
  }

  /**
   * Create a configuration error
   *
   * @param message - Error message
   * @param details - Additional error details
   * @param context - Error context
   * @returns ConfigurationError instance
   */
  static configuration(
    message: string,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): ConfigurationError {
    const error = new ConfigurationError(message, details);
    if (context) {
      this.addContext(error, context);
    }
    return error;
  }

  /**
   * Create an API error
   *
   * @param message - Error message
   * @param statusCode - HTTP status code
   * @param details - Additional error details
   * @param context - Error context
   * @returns ApiError instance
   *
   * @example
   * ```typescript
   * throw ErrorFactory.api('Failed to fetch case', 404, { caseId: '123' }, { endpoint: '/api/cases/123' });
   * ```
   */
  static api(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): ApiError {
    const error = new ApiError(message, undefined, statusCode, details);
    if (context) {
      this.addContext(error, context);
    }
    return error;
  }

  /**
   * Create a rate limit error
   *
   * @param message - Error message
   * @param retryAfter - Seconds until retry is allowed
   * @param details - Additional error details
   * @param context - Error context
   * @returns RateLimitError instance
   *
   * @example
   * ```typescript
   * throw ErrorFactory.rateLimit('Rate limit exceeded', 60, {}, { userId: 'user123' });
   * ```
   */
  static rateLimit(
    message: string,
    retryAfter: number,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): RateLimitError {
    const error = new RateLimitError(message, retryAfter);
    if (context || details) {
      this.addContext(error, { ...context, ...details });
    }
    return error;
  }

  /**
   * Create a circuit breaker error
   *
   * @param message - Error message
   * @param details - Additional error details
   * @param context - Error context
   * @returns CircuitBreakerError instance
   */
  static circuitBreaker(
    message: string,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): CircuitBreakerError {
    const error = new CircuitBreakerError(message, details);
    if (context) {
      this.addContext(error, context);
    }
    return error;
  }

  /**
   * Create a generic application error
   *
   * @param message - Error message
   * @param code - Error code
   * @param statusCode - HTTP status code
   * @param details - Additional error details
   * @param context - Error context
   * @returns ApplicationError instance
   */
  static application(
    message: string,
    code?: string,
    statusCode?: number,
    details?: Record<string, unknown>,
    context?: ErrorContext,
  ): ApplicationError {
    const error = new ApplicationError(message, code || 'APPLICATION_ERROR', statusCode, details);
    if (context) {
      this.addContext(error, context);
    }
    return error;
  }

  /**
   * Create an error from an unknown error type
   * Useful for error handling where the error type is unknown
   *
   * @param error - Unknown error (Error, string, or other)
   * @param context - Error context
   * @returns ApplicationError instance
   *
   * @example
   * ```typescript
   * try {
   *   // some operation
   * } catch (err) {
   *   throw ErrorFactory.fromUnknown(err, { tool: 'search_cases' });
   * }
   * ```
   */
  static fromUnknown(error: unknown, context?: ErrorContext): ApplicationError {
    if (error instanceof ApplicationError) {
      if (context) {
        this.addContext(error, context);
      }
      return error;
    }

    if (error instanceof Error) {
      const appError = new ApplicationError(error.message, 'UNKNOWN_ERROR', 500, {
        originalError: error.name,
        stack: error.stack,
      });
      if (context) {
        this.addContext(appError, context);
      }
      return appError;
    }

    const appError = new ApplicationError(String(error), 'UNKNOWN_ERROR', 500, {
      originalValue: error,
    });
    if (context) {
      this.addContext(appError, context);
    }
    return appError;
  }

  /**
   * Add context to an error
   * Creates a new error with context merged into details
   *
   * @param error - Error to add context to
   * @param context - Context information
   */
  private static addContext(error: ApplicationError, context: ErrorContext): void {
    // Merge context into error details
    const mergedDetails = {
      ...(error.details || {}),
      ...Object.fromEntries(
        Object.entries(context).filter(([, value]) => value !== undefined && value !== null),
      ),
    };

    // Note: We can't mutate error.details as it's readonly
    // Instead, we'd need to create a new error instance or handle context separately
    // For now, we'll just log that context was provided
    // In practice, you'd handle context at the point of error creation
    if (Object.keys(mergedDetails).length > 0) {
      // Store in a way that can be accessed (if needed, extend error classes)
      (error as { _context?: Record<string, unknown> })._context = mergedDetails;
    }
  }

  /**
   * Format error for logging
   *
   * @param error - Error to format
   * @returns Formatted error object
   */
  static formatForLogging(error: unknown): {
    message: string;
    code?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    stack?: string;
  } {
    if (error instanceof ApplicationError) {
      const context = (error as { _context?: Record<string, unknown> })._context;
      return {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details: { ...(error.details || {}), ...(context || {}) },
        stack: error.stack,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      message: String(error),
    };
  }

  /**
   * Check if error is a specific type
   *
   * @param error - Error to check
   * @param errorClass - Error class to check against
   * @returns True if error is instance of the specified class
   *
   * @example
   * ```typescript
   * if (ErrorFactory.isType(error, ValidationError)) {
   *   // Handle validation error
   * }
   * ```
   */
  static isType<T extends ApplicationError>(
    error: unknown,
    errorClass: new (...args: never[]) => T,
  ): error is T {
    return error instanceof errorClass;
  }

  /**
   * Extract error message safely
   * Handles unknown error types gracefully
   *
   * @param error - Error to extract message from
   * @returns Error message string
   */
  static getMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Create a user-friendly error message
   * Strips sensitive information and formats for display
   *
   * @param error - Error to format
   * @returns User-friendly error message
   */
  static getUserMessage(error: unknown): string {
    if (error instanceof ApplicationError) {
      // Return a user-friendly message based on error type
      if (error instanceof ValidationError) {
        return 'Invalid input provided. Please check your parameters.';
      }
      if (error instanceof ConfigurationError) {
        return 'Configuration error. Please contact support.';
      }
      if (error instanceof RateLimitError) {
        return `Rate limit exceeded. Please try again in ${error.retryAfter} seconds.`;
      }
      if (error instanceof CircuitBreakerError) {
        return 'Service temporarily unavailable. Please try again later.';
      }
      if (error instanceof ApiError) {
        return `API request failed: ${error.message}`;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'An unexpected error occurred. Please try again.';
  }
}
