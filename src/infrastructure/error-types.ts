/**
 * Advanced Error Handling System for Legal MCP Server
 * Provides comprehensive error types, context tracking, and structured responses
 */

import { Logger } from './logger.js';

// Base error context interface
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  timestamp: string;
  stackTrace?: string;
  additionalData?: Record<string, any>;
  correlationId?: string;
  sessionId?: string;
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for classification
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
  DEPENDENCY = 'dependency'
}

/**
 * Base application error class with enhanced context tracking
 */
export abstract class BaseError extends Error {
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
    retryable = false
  ) {
    super(message);
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
      stackTrace: this.stack,
      ...context
    };

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        stackTrace: undefined // Don't expose stack traces in API responses
      }
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
      context: this.context
    };
  }
}

/**
 * Validation errors for input validation failures
 */
export class ValidationError extends BaseError {
  public readonly validationErrors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string; value?: any }> = [],
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW,
      400,
      context,
      true,
      false
    );
    this.validationErrors = validationErrors;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors
    };
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication required', context: Partial<ErrorContext> = {}) {
    super(
      message,
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.MEDIUM,
      401,
      context,
      true,
      false
    );
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
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      ErrorCategory.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      403,
      context,
      true,
      false
    );
    this.requiredPermissions = requiredPermissions;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      requiredPermissions: this.requiredPermissions
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
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      ErrorCategory.NOT_FOUND,
      ErrorSeverity.LOW,
      404,
      context,
      true,
      false
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceId: this.resourceId
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
    context: Partial<ErrorContext> = {}
  ) {
    super(
      `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      429,
      context,
      true,
      true
    );
    this.limit = limit;
    this.windowMs = windowMs;
    this.retryAfter = retryAfter;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      limit: this.limit,
      windowMs: this.windowMs,
      retryAfter: this.retryAfter
    };
  }
}

/**
 * External API errors
 */
export class ExternalAPIError extends BaseError {
  public readonly apiName: string;
  public readonly apiStatusCode?: number;
  public readonly apiResponse?: any;

  constructor(
    apiName: string,
    message: string,
    apiStatusCode?: number,
    apiResponse?: any,
    context: Partial<ErrorContext> = {}
  ) {
    const isRetryable = apiStatusCode ? apiStatusCode >= 500 || apiStatusCode === 429 : true;
    const severity = apiStatusCode && apiStatusCode >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;

    super(
      `External API error from ${apiName}: ${message}`,
      ErrorCategory.EXTERNAL_API,
      severity,
      502,
      context,
      true,
      isRetryable
    );
    this.apiName = apiName;
    this.apiStatusCode = apiStatusCode;
    this.apiResponse = apiResponse;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      apiName: this.apiName,
      apiStatusCode: this.apiStatusCode,
      apiResponse: this.apiResponse
    };
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicError extends BaseError {
  public readonly businessCode?: string;

  constructor(
    message: string,
    businessCode?: string,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.MEDIUM,
      422,
      context,
      true,
      false
    );
    this.businessCode = businessCode;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      businessCode: this.businessCode
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
    isOperational = false
  ) {
    super(
      message,
      ErrorCategory.INTERNAL,
      ErrorSeverity.CRITICAL,
      500,
      context,
      isOperational,
      false
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseError {
  public readonly configKey?: string;

  constructor(
    message: string,
    configKey?: string,
    context: Partial<ErrorContext> = {}
  ) {
    super(
      message,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.CRITICAL,
      500,
      context,
      false,
      false
    );
    this.configKey = configKey;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      configKey: this.configKey
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
    context: Partial<ErrorContext> = {}
  ) {
    super(
      `Dependency error from ${dependencyName} (${dependencyType}): ${message}`,
      ErrorCategory.DEPENDENCY,
      ErrorSeverity.HIGH,
      503,
      context,
      true,
      true
    );
    this.dependencyName = dependencyName;
    this.dependencyType = dependencyType;
  }

  public toJSON() {
    return {
      ...super.toJSON(),
      dependencyName: this.dependencyName,
      dependencyType: this.dependencyType
    };
  }
}

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

  public addData(key: string, value: any): this {
    if (!this.context.additionalData) {
      this.context.additionalData = {};
    }
    this.context.additionalData[key] = value;
    return this;
  }

  public build(): ErrorContext {
    return {
      timestamp: new Date().toISOString(),
      ...this.context
    };
  }
}

/**
 * Error factory for creating errors with proper context
 */
export class ErrorFactory {
  private static defaultContext: Partial<ErrorContext> = {};

  public static setDefaultContext(context: Partial<ErrorContext>): void {
    this.defaultContext = context;
  }

  public static createValidationError(
    message: string,
    validationErrors?: Array<{ field: string; message: string; value?: any }>,
    additionalContext?: Partial<ErrorContext>
  ): ValidationError {
    return new ValidationError(
      message,
      validationErrors,
      { ...this.defaultContext, ...additionalContext }
    );
  }

  public static createNotFoundError(
    message: string,
    resourceType?: string,
    resourceId?: string,
    additionalContext?: Partial<ErrorContext>
  ): NotFoundError {
    return new NotFoundError(
      message,
      resourceType,
      resourceId,
      { ...this.defaultContext, ...additionalContext }
    );
  }

  public static createExternalAPIError(
    apiName: string,
    message: string,
    statusCode?: number,
    response?: any,
    additionalContext?: Partial<ErrorContext>
  ): ExternalAPIError {
    return new ExternalAPIError(
      apiName,
      message,
      statusCode,
      response,
      { ...this.defaultContext, ...additionalContext }
    );
  }

  public static createBusinessLogicError(
    message: string,
    businessCode?: string,
    additionalContext?: Partial<ErrorContext>
  ): BusinessLogicError {
    return new BusinessLogicError(
      message,
      businessCode,
      { ...this.defaultContext, ...additionalContext }
    );
  }

  public static createInternalServerError(
    message?: string,
    additionalContext?: Partial<ErrorContext>
  ): InternalServerError {
    return new InternalServerError(
      message,
      { ...this.defaultContext, ...additionalContext }
    );
  }
}