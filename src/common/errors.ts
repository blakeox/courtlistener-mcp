/**
 * Custom error classes for better error handling and type safety
 */

/**
 * Base error class for all application errors
 */
export class ApplicationError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
  }
}

/**
 * Validation error for input parameters
 */
export class ValidationError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * API client error (CourtListener API)
 */
export class ApiError extends ApplicationError {
  public readonly endpoint?: string;
  public readonly apiStatus?: number;

  constructor(
    message: string,
    endpoint?: string,
    apiStatus?: number,
    details?: Record<string, unknown>,
  ) {
    super(message, 'API_ERROR', apiStatus || 500, details);
    this.endpoint = endpoint;
    this.apiStatus = apiStatus;
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends ApplicationError {
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CIRCUIT_BREAKER_ERROR', 503, details);
  }
}

/**
 * Cache error
 */
export class CacheError extends ApplicationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CACHE_ERROR', 500, details);
  }
}

/**
 * Tool execution error
 */
export class ToolExecutionError extends ApplicationError {
  public readonly toolName: string;

  constructor(message: string, toolName: string, details?: Record<string, unknown>) {
    super(message, 'TOOL_EXECUTION_ERROR', 500, { toolName, ...details });
    this.toolName = toolName;
  }
}
