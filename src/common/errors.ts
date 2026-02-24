/**
 * Unified Error Handling System
 *
 * Provides a single error hierarchy for the entire application:
 *   ApplicationError          – lightweight base (code, statusCode, details)
 *     ├─ ApiError
 *     ├─ CircuitBreakerError
 *     ├─ CacheError
 *     ├─ ToolExecutionError
 *     └─ BaseError (abstract) – rich base (category, severity, context, …)
 *          ├─ ValidationError
 *          ├─ AuthenticationError
 *          ├─ AuthorizationError
 *          ├─ NotFoundError
 *          ├─ RateLimitError
 *          ├─ ExternalAPIError
 *          ├─ BusinessLogicError
 *          ├─ InternalServerError
 *          ├─ ConfigurationError
 *          └─ DependencyError
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Base error class
// ---------------------------------------------------------------------------

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
    if (statusCode !== undefined) this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Lightweight ApplicationError subclasses (unique to the original errors.ts)
// ---------------------------------------------------------------------------

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
    if (endpoint !== undefined) this.endpoint = endpoint;
    if (apiStatus !== undefined) this.apiStatus = apiStatus;
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

// ---------------------------------------------------------------------------
// Error context & enums (from infrastructure/error-types.ts)
// ---------------------------------------------------------------------------

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  timestamp: string;
  stackTrace?: string;
  additionalData?: Record<string, unknown>;
  correlationId?: string;
  sessionId?: string;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  EXTERNAL_API = 'external_api',
  DATABASE = 'database',
  NETWORK = 'network',
  INTERNAL = 'internal',
  BUSINESS_LOGIC = 'business_logic',
  CONFIGURATION = 'configuration',
  DEPENDENCY = 'dependency',
}

// ---------------------------------------------------------------------------
// BaseError – rich abstract base that extends ApplicationError
// ---------------------------------------------------------------------------

/**
 * Base application error class with enhanced context tracking.
 * Extends ApplicationError so that `instanceof ApplicationError` holds for all
 * subclasses in either the lightweight or the rich branch of the hierarchy.
 */
export abstract class BaseError extends ApplicationError {
  public readonly errorId: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly httpStatus: number;
  public readonly context: ErrorContext;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    httpStatus: number,
    context: Partial<ErrorContext> = {},
    isOperational = true,
    retryable = false,
  ) {
    super(message, category.toUpperCase(), httpStatus, context.additionalData);
    this.name = this.constructor.name;
    this.errorId = this.generateErrorId();
    this.category = category;
    this.severity = severity;
    this.httpStatus = httpStatus;
    this.isOperational = isOperational;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();

    this.context = {
      timestamp: this.timestamp,
      ...(this.stack !== undefined && { stackTrace: this.stack }),
      ...context,
    };

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
  }

  public toJSON() {
    return {
      errorId: this.errorId,
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp,
      isOperational: this.isOperational,
      retryable: this.retryable,
      context: {
        ...this.context,
        stackTrace: undefined,
      },
    };
  }

  public toLogFormat() {
    return {
      errorId: this.errorId,
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

// ---------------------------------------------------------------------------
// Rich BaseError subclasses (from infrastructure/error-types.ts)
// ---------------------------------------------------------------------------

/**
 * Validation errors for input validation failures
 */
export class ValidationError extends BaseError {
  public readonly validationErrors: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string; value?: unknown }> = [],
    context: Partial<ErrorContext> = {},
  ) {
    super(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, context, true, false);
    this.validationErrors = validationErrors;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication required', context: Partial<ErrorContext> = {}) {
    super(message, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, context, true, false);
  }
}

/**
 * Authorization errors
 */
export class AuthorizationError extends BaseError {
  public readonly requiredPermissions?: string[];

  constructor(
    message = 'Insufficient permissions',
    requiredPermissions?: string[],
    context: Partial<ErrorContext> = {},
  ) {
    super(message, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, context, true, false);
    if (requiredPermissions !== undefined) this.requiredPermissions = requiredPermissions;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      requiredPermissions: this.requiredPermissions,
    };
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends BaseError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    message = 'Resource not found',
    resourceType?: string,
    resourceId?: string,
    context: Partial<ErrorContext> = {},
  ) {
    super(message, ErrorCategory.NOT_FOUND, ErrorSeverity.LOW, 404, context, true, false);
    if (resourceType !== undefined) this.resourceType = resourceType;
    if (resourceId !== undefined) this.resourceId = resourceId;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    };
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  public readonly limit: number;
  public readonly windowMs: number;
  public readonly retryAfter: number;

  constructor(
    limit: number,
    windowMs: number,
    retryAfter: number,
    context: Partial<ErrorContext> = {},
  ) {
    super(
      `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      429,
      context,
      true,
      true,
    );
    this.limit = limit;
    this.windowMs = windowMs;
    this.retryAfter = retryAfter;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      limit: this.limit,
      windowMs: this.windowMs,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * External API errors
 */
export class ExternalAPIError extends BaseError {
  public readonly apiName: string;
  public readonly apiStatusCode?: number;
  public readonly apiResponse?: unknown;

  constructor(
    apiName: string,
    message: string,
    apiStatusCode?: number,
    apiResponse?: unknown,
    context: Partial<ErrorContext> = {},
  ) {
    const isRetryable = apiStatusCode ? apiStatusCode >= 500 || apiStatusCode === 429 : true;
    const severity =
      apiStatusCode && apiStatusCode >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;

    super(
      `External API error from ${apiName}: ${message}`,
      ErrorCategory.EXTERNAL_API,
      severity,
      502,
      context,
      true,
      isRetryable,
    );
    this.apiName = apiName;
    if (apiStatusCode !== undefined) this.apiStatusCode = apiStatusCode;
    this.apiResponse = apiResponse;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      apiName: this.apiName,
      apiStatusCode: this.apiStatusCode,
      apiResponse: this.apiResponse,
    };
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicError extends BaseError {
  public readonly businessCode?: string;

  constructor(message: string, businessCode?: string, context: Partial<ErrorContext> = {}) {
    super(message, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, 422, context, true, false);
    if (businessCode !== undefined) this.businessCode = businessCode;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      businessCode: this.businessCode,
    };
  }
}

/**
 * Internal server errors
 */
export class InternalServerError extends BaseError {
  constructor(
    message = 'Internal server error',
    context: Partial<ErrorContext> = {},
    isOperational = false,
  ) {
    super(
      message,
      ErrorCategory.INTERNAL,
      ErrorSeverity.CRITICAL,
      500,
      context,
      isOperational,
      false,
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseError {
  public readonly configKey?: string;

  constructor(message: string, configKey?: string, context: Partial<ErrorContext> = {}) {
    super(message, ErrorCategory.CONFIGURATION, ErrorSeverity.CRITICAL, 500, context, false, false);
    if (configKey !== undefined) this.configKey = configKey;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
    };
  }
}

/**
 * Dependency errors (database, cache, etc.)
 */
export class DependencyError extends BaseError {
  public readonly dependencyName: string;
  public readonly dependencyType: string;

  constructor(
    dependencyName: string,
    dependencyType: string,
    message: string,
    context: Partial<ErrorContext> = {},
  ) {
    super(
      `Dependency error from ${dependencyName} (${dependencyType}): ${message}`,
      ErrorCategory.DEPENDENCY,
      ErrorSeverity.HIGH,
      503,
      context,
      true,
      true,
    );
    this.dependencyName = dependencyName;
    this.dependencyType = dependencyType;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      dependencyName: this.dependencyName,
      dependencyType: this.dependencyType,
    };
  }
}

// ---------------------------------------------------------------------------
// ErrorContextBuilder (from infrastructure/error-types.ts)
// ---------------------------------------------------------------------------

/**
 * Error context builder utility
 */
export class ErrorContextBuilder {
  private context: Partial<ErrorContext> = {};

  public setRequestId(requestId: string): this {
    this.context.requestId = requestId;
    return this;
  }

  public setUserId(userId: string): this {
    this.context.userId = userId;
    return this;
  }

  public setEndpoint(endpoint: string): this {
    this.context.endpoint = endpoint;
    return this;
  }

  public setMethod(method: string): this {
    this.context.method = method;
    return this;
  }

  public setCorrelationId(correlationId: string): this {
    this.context.correlationId = correlationId;
    return this;
  }

  public setSessionId(sessionId: string): this {
    this.context.sessionId = sessionId;
    return this;
  }

  public addData(key: string, value: unknown): this {
    if (!this.context.additionalData) {
      this.context.additionalData = {};
    }
    this.context.additionalData[key] = value;
    return this;
  }

  public build(): ErrorContext {
    return {
      timestamp: new Date().toISOString(),
      ...this.context,
    };
  }
}

// ---------------------------------------------------------------------------
// ErrorFactory (merged from common/error-factory.ts + error-types.ts)
// ---------------------------------------------------------------------------

/**
 * Centralized factory for creating and handling errors consistently.
 */
export class ErrorFactory {
  private static defaultContext: Partial<ErrorContext> = {};

  public static setDefaultContext(context: Partial<ErrorContext>): void {
    this.defaultContext = context;
  }

  // -- creation helpers (ApplicationError branch) --

  /**
   * Create a generic application error
   */
  static application(
    message: string,
    code?: string,
    statusCode?: number,
    details?: Record<string, unknown>,
  ): ApplicationError {
    return new ApplicationError(message, code || 'APPLICATION_ERROR', statusCode, details);
  }

  /**
   * Create an API error
   */
  static api(message: string, statusCode: number, details?: Record<string, unknown>): ApiError {
    return new ApiError(message, undefined, statusCode, details);
  }

  /**
   * Create a circuit breaker error
   */
  static circuitBreaker(message: string, details?: Record<string, unknown>): CircuitBreakerError {
    return new CircuitBreakerError(message, details);
  }

  // -- creation helpers (BaseError branch) --

  /**
   * Create a validation error
   */
  static validation(
    message: string,
    validationErrors?: Array<{ field: string; message: string; value?: unknown }>,
    additionalContext?: Partial<ErrorContext>,
  ): ValidationError {
    return new ValidationError(message, validationErrors, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /** Alias matching the error-types.ts factory name */
  static createValidationError = ErrorFactory.validation;

  /**
   * Create a configuration error
   */
  static configuration(
    message: string,
    configKey?: string,
    additionalContext?: Partial<ErrorContext>,
  ): ConfigurationError {
    return new ConfigurationError(message, configKey, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(
    limit: number,
    windowMs: number,
    retryAfter: number,
    additionalContext?: Partial<ErrorContext>,
  ): RateLimitError {
    return new RateLimitError(limit, windowMs, retryAfter, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /**
   * Create a not-found error
   */
  static createNotFoundError(
    message: string,
    resourceType?: string,
    resourceId?: string,
    additionalContext?: Partial<ErrorContext>,
  ): NotFoundError {
    return new NotFoundError(message, resourceType, resourceId, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /**
   * Create an external API error
   */
  static createExternalAPIError(
    apiName: string,
    message: string,
    statusCode?: number,
    response?: unknown,
    additionalContext?: Partial<ErrorContext>,
  ): ExternalAPIError {
    return new ExternalAPIError(apiName, message, statusCode, response, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /**
   * Create a business logic error
   */
  static createBusinessLogicError(
    message: string,
    businessCode?: string,
    additionalContext?: Partial<ErrorContext>,
  ): BusinessLogicError {
    return new BusinessLogicError(message, businessCode, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  /**
   * Create an internal server error
   */
  static createInternalServerError(
    message?: string,
    additionalContext?: Partial<ErrorContext>,
  ): InternalServerError {
    return new InternalServerError(message, { ...this.defaultContext, ...additionalContext });
  }

  // -- conversion / inspection helpers --

  /**
   * Create an error from an unknown error type
   */
  static fromUnknown(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApplicationError(error.message, 'UNKNOWN_ERROR', 500, {
        originalError: error.name,
        stack: error.stack,
      });
    }

    return new ApplicationError(String(error), 'UNKNOWN_ERROR', 500, {
      originalValue: error,
    });
  }

  /**
   * Format error for logging
   */
  static formatForLogging(error: unknown): {
    message: string;
    code?: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    stack?: string;
  } {
    if (error instanceof ApplicationError) {
      return {
        message: error.message,
        code: error.code,
        ...(error.statusCode !== undefined && { statusCode: error.statusCode }),
        ...(error.details !== undefined && { details: error.details }),
        ...(error.stack !== undefined && { stack: error.stack }),
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        ...(error.stack !== undefined && { stack: error.stack }),
      };
    }

    return { message: String(error) };
  }

  /**
   * Check if error is a specific type
   */
  static isType<T extends ApplicationError>(
    error: unknown,
    errorClass: new (...args: never[]) => T,
  ): error is T {
    return error instanceof errorClass;
  }

  /**
   * Extract error message safely
   */
  static getMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Create a user-friendly error message
   */
  static getUserMessage(error: unknown): string {
    if (error instanceof ApplicationError) {
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
