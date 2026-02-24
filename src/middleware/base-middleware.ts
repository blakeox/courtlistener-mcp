/**
 * Base Middleware
 *
 * Abstract base class for middleware components providing common patterns
 * and consistent interfaces.
 *
 * **Features**:
 * - Consistent middleware interface
 * - Shared logging patterns
 * - Error handling utilities
 * - Configuration validation
 *
 * @example
 * ```typescript
 * export class AuthenticationMiddleware extends BaseMiddleware {
 *   readonly name = 'authentication';
 *
 *   constructor(private config: AuthConfig, logger: Logger) {
 *     super(logger);
 *   }
 *
 *   async process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
 *     this.logProcess('Processing authentication');
 *
 *     if (!this.validateAuth(context)) {
 *       throw this.createError('Authentication failed');
 *     }
 *
 *     return await next();
 *   }
 * }
 * ```
 */

import { Logger } from '../infrastructure/logger.js';
import { ApplicationError } from '../common/errors.js';

/**
 * Request context passed through middleware chain
 */
export interface RequestContext {
  /** Unique request identifier for tracing */
  requestId: string;
  /** Request start time in milliseconds */
  startTime: number;
  /** Additional request metadata */
  metadata: Record<string, unknown>;
  /** User ID if authenticated */
  userId?: string;
  /** Session ID if available */
  sessionId?: string;
}

/**
 * Abstract base class for middleware
 *
 * Provides common functionality for all middleware components including
 * logging, error handling, and consistent interfaces.
 */
export abstract class BaseMiddleware {
  protected readonly logger: Logger;

  /**
   * Middleware name for identification and logging
   */
  abstract readonly name: string;

  /**
   * Constructor
   *
   * @param logger - Logger instance
   */
  constructor(logger: Logger) {
    this.logger = logger.child(this.constructor.name);
  }

  /**
   * Process a request through this middleware
   *
   * @param context - Request context
   * @param next - Function to call next middleware or handler
   * @returns Promise resolving to the result
   *
   * @example
   * ```typescript
   * async process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
   *   this.logProcess('Processing request');
   *
   *   // Pre-processing
   *   await this.beforeProcess(context);
   *
   *   // Execute next middleware
   *   const result = await next();
   *
   *   // Post-processing
   *   return await this.afterProcess(context, result);
   * }
   * ```
   */
  abstract process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown>;

  /**
   * Log middleware processing
   *
   * @param message - Log message
   * @param metadata - Additional metadata
   */
  protected logProcess(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, {
      middleware: this.name,
      ...metadata,
    });
  }

  /**
   * Log middleware success
   *
   * @param message - Log message
   * @param metadata - Additional metadata
   */
  protected logSuccess(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, {
      middleware: this.name,
      ...metadata,
    });
  }

  /**
   * Log middleware warning
   *
   * @param message - Warning message
   * @param metadata - Additional metadata
   */
  protected logWarning(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, {
      middleware: this.name,
      ...metadata,
    });
  }

  /**
   * Log middleware error
   *
   * @param message - Error message
   * @param error - Error object
   * @param metadata - Additional metadata
   */
  protected logError(message: string, error: Error, metadata?: Record<string, unknown>): void {
    this.logger.error(message, error, {
      middleware: this.name,
      ...metadata,
    });
  }

  /**
   * Create a middleware-specific error
   *
   * @param message - Error message
   * @param details - Error details
   * @returns ApplicationError with middleware context
   */
  protected createError(message: string, details?: Record<string, unknown>): ApplicationError {
    return new ApplicationError(message, `${this.name.toUpperCase()}_ERROR`, 500, {
      middleware: this.name,
      ...details,
    });
  }

  /**
   * Measure execution time
   *
   * @returns Timer object with end() method
   */
  protected startTimer() {
    const start = Date.now();
    const middleware = this.name;
    const logger = this.logger;

    return {
      end(metadata?: Record<string, unknown>): number {
        const duration = Date.now() - start;
        logger.debug(`${middleware} completed`, {
          duration,
          ...metadata,
        });
        return duration;
      },
    };
  }
}

/**
 * Middleware chain executor
 *
 * Executes a series of middleware in order, passing control through the chain.
 */
export class MiddlewareChain {
  private middlewares: BaseMiddleware[] = [];

  /**
   * Add middleware to the chain
   *
   * @param middleware - Middleware instance
   * @returns This chain for fluent API
   */
  use(middleware: BaseMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute the middleware chain
   *
   * @param context - Request context
   * @param finalHandler - Final handler to execute after all middleware
   * @returns Promise resolving to the result
   */
  async execute<T>(context: RequestContext, finalHandler: () => Promise<T>): Promise<T> {
    let index = 0;

    const next = async (): Promise<T> => {
      if (index >= this.middlewares.length) {
        return finalHandler();
      }

      const middleware = this.middlewares[index++];
      if (!middleware) {
        return finalHandler();
      }
      return middleware.process(context, next) as Promise<T>;
    };

    return next();
  }

  /**
   * Get middleware names in order
   *
   * @returns Array of middleware names
   */
  getMiddlewareNames(): string[] {
    return this.middlewares.map((m) => m.name);
  }
}
