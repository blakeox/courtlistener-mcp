/**
 * Error Recovery and Resilience Patterns
 * Implements retry logic, fallback strategies, and circuit breaker integration
 */

import { Logger } from './logger.js';
import { CircuitBreaker } from './circuit-breaker.js';
import {
  BaseError,
  ErrorSeverity,
  ErrorCategory,
  ErrorContext,
  ErrorContextBuilder,
} from './error-types.js';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: ErrorCategory[];
  retryableStatuses: number[];
  jitterMs: number;
}

export interface FallbackConfig {
  enableFallbacks: boolean;
  cacheStaleDataMs: number;
  defaultResponses: Record<string, any>;
  gracefulDegradation: boolean;
}

export interface RecoveryOptions {
  enableRetry: boolean;
  enableFallback: boolean;
  enableCircuitBreaker: boolean;
  retryConfig: Partial<RetryConfig>;
  fallbackConfig: Partial<FallbackConfig>;
}

/**
 * Advanced error recovery system with multiple resilience patterns
 */
export class ErrorRecoveryService {
  private logger: Logger;
  private circuitBreaker?: CircuitBreaker;
  private retryConfig: RetryConfig;
  private fallbackConfig: FallbackConfig;

  constructor(
    logger: Logger,
    circuitBreaker?: CircuitBreaker,
    options: Partial<RecoveryOptions> = {},
  ) {
    this.logger = logger;
    this.circuitBreaker = circuitBreaker;

    this.retryConfig = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableErrors: [
        ErrorCategory.NETWORK,
        ErrorCategory.RATE_LIMIT,
        ErrorCategory.EXTERNAL_API,
      ],
      retryableStatuses: [408, 429, 500, 502, 503, 504],
      jitterMs: 100,
      ...options.retryConfig,
    };

    this.fallbackConfig = {
      enableFallbacks: true,
      cacheStaleDataMs: 300000, // 5 minutes
      defaultResponses: {},
      gracefulDegradation: true,
      ...options.fallbackConfig,
    };
  }

  /**
   * Execute operation with full error recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: Partial<RecoveryOptions> = {},
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Use circuit breaker if available and enabled
      if (options.enableCircuitBreaker && this.circuitBreaker) {
        return await this.circuitBreaker.execute(async () => {
          return await this.executeWithRetry(operation, context, options);
        });
      }

      // Execute with retry
      return await this.executeWithRetry(operation, context, options);
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.warn(`Operation failed after ${duration}ms`, {
        operation: context.endpoint,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      // Try fallback if enabled
      if (options.enableFallback !== false && this.fallbackConfig.enableFallbacks) {
        const fallbackResult = await this.attemptFallback<T>(error, context);
        if (fallbackResult !== null) {
          return fallbackResult;
        }
      }

      // No recovery possible, rethrow
      throw error;
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options: Partial<RecoveryOptions> = {},
  ): Promise<T> {
    const config = { ...this.retryConfig, ...options.retryConfig };
    let lastError: any;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      attempt++;

      try {
        const result = await operation();

        if (attempt > 1) {
          this.logger.info(`Operation succeeded on attempt ${attempt}`, {
            operation: context.endpoint,
            attempt,
            totalAttempts: config.maxAttempts,
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error, config)) {
          this.logger.debug(`Non-retryable error, not retrying`, {
            operation: context.endpoint,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Don't retry on last attempt
        if (attempt >= config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const baseDelay = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs,
        );
        const jitter = Math.random() * config.jitterMs;
        const delay = baseDelay + jitter;

        this.logger.warn(`Operation failed on attempt ${attempt}, retrying in ${delay}ms`, {
          operation: context.endpoint,
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: error instanceof Error ? error.message : String(error),
        });

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    this.logger.error(`Operation failed after ${config.maxAttempts} attempts`, lastError, {
      operation: context.endpoint,
      totalAttempts: config.maxAttempts,
    });

    throw lastError;
  }

  /**
   * Attempt fallback recovery strategies
   */
  private async attemptFallback<T>(error: any, context: ErrorContext): Promise<T | null> {
    this.logger.info(`Attempting fallback recovery`, {
      operation: context.endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      // Strategy 1: Return cached/stale data if available
      const cachedResult = await this.getCachedData<T>(context);
      if (cachedResult !== null) {
        this.logger.info(`Fallback: Returning cached data`, {
          operation: context.endpoint,
        });
        return cachedResult;
      }

      // Strategy 2: Return default response if configured
      const defaultResult = this.getDefaultResponse<T>(context);
      if (defaultResult !== null) {
        this.logger.info(`Fallback: Returning default response`, {
          operation: context.endpoint,
        });
        return defaultResult;
      }

      // Strategy 3: Graceful degradation
      if (this.fallbackConfig.gracefulDegradation) {
        const degradedResult = await this.gracefulDegradation<T>(context);
        if (degradedResult !== null) {
          this.logger.info(`Fallback: Graceful degradation response`, {
            operation: context.endpoint,
          });
          return degradedResult;
        }
      }

      return null;
    } catch (fallbackError) {
      this.logger.warn(`Fallback strategy failed`, {
        operation: context.endpoint,
        fallbackError:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      return null;
    }
  }

  /**
   * Check if error is retryable based on configuration
   */
  private isRetryableError(error: any, config: RetryConfig): boolean {
    // Check if it's a BaseError with retryable flag
    if (error instanceof BaseError) {
      return error.retryable && config.retryableErrors.includes(error.category);
    }

    // Check HTTP status codes for non-BaseError instances
    if (error.status && config.retryableStatuses.includes(error.status)) {
      return true;
    }

    // Check error types/names
    const retryableNames = [
      'TimeoutError',
      'NetworkError',
      'ConnectionError',
      'ECONNRESET',
      'ETIMEDOUT',
    ];
    if (error.name && retryableNames.includes(error.name)) {
      return true;
    }

    // Check error codes
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    return false;
  }

  /**
   * Get cached data if available and not too stale
   */
  private async getCachedData<T>(context: ErrorContext): Promise<T | null> {
    // This would integrate with your cache service
    // For now, return null as placeholder
    return null;
  }

  /**
   * Get default response for the operation
   */
  private getDefaultResponse<T>(context: ErrorContext): T | null {
    const endpoint = context.endpoint;
    if (endpoint && this.fallbackConfig.defaultResponses[endpoint]) {
      return this.fallbackConfig.defaultResponses[endpoint] as T;
    }
    return null;
  }

  /**
   * Implement graceful degradation strategies
   */
  private async gracefulDegradation<T>(context: ErrorContext): Promise<T | null> {
    const endpoint = context.endpoint;

    // Legal API specific degradation strategies
    if (endpoint?.includes('/search')) {
      // Return empty search results instead of failing
      return {
        results: [],
        count: 0,
        message: 'Search temporarily unavailable, please try again later',
      } as T;
    }

    if (endpoint?.includes('/case')) {
      // Return basic case info or cached summary
      return {
        error: 'Case details temporarily unavailable',
        available: false,
        retry_after: 300,
      } as T;
    }

    return null;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create context for recovery operations
   */
  public createRecoveryContext(
    endpoint: string,
    method: string,
    additionalData?: Record<string, any>,
  ): ErrorContext {
    const builder = new ErrorContextBuilder()
      .setRequestId(`recovery_${Date.now()}`)
      .setEndpoint(endpoint)
      .setMethod(method)
      .setCorrelationId(`recovery_${Math.random().toString(36).substr(2, 9)}`)
      .addData('recovery', true)
      .addData('timestamp', new Date().toISOString());

    // Add additional data if provided
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        builder.addData(key, value);
      });
    }

    return builder.build();
  }

  /**
   * Register default fallback responses
   */
  public registerDefaultResponse(endpoint: string, response: any): void {
    this.fallbackConfig.defaultResponses[endpoint] = response;
  }

  /**
   * Update retry configuration
   */
  public updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Update fallback configuration
   */
  public updateFallbackConfig(config: Partial<FallbackConfig>): void {
    this.fallbackConfig = { ...this.fallbackConfig, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): { retry: RetryConfig; fallback: FallbackConfig } {
    return {
      retry: { ...this.retryConfig },
      fallback: { ...this.fallbackConfig },
    };
  }
}

/**
 * Utility functions for error recovery patterns
 */

/**
 * Wrap a function with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  logger: Logger,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const recovery = new ErrorRecoveryService(logger);
  if (config) {
    recovery.updateRetryConfig(config);
  }

  const context = recovery.createRecoveryContext('wrapped_operation', 'FUNCTION_CALL');

  return recovery.executeWithRecovery(operation, context, {
    enableRetry: true,
    enableFallback: false,
  });
}

/**
 * Wrap a function with fallback logic
 */
export async function withFallback<T>(
  operation: () => Promise<T>,
  fallbackValue: T,
  logger?: Logger,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (logger) {
      logger.warn(`Operation failed, using fallback`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return fallbackValue;
  }
}
