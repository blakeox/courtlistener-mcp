/**
 * Express Integration for Advanced Error Handling
 * Integrates error boundaries, recovery, and reporting with Express HTTP server
 */

import { randomUUID } from 'node:crypto';
import _express, { Request, Response, NextFunction, Application } from 'express';
import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ErrorBoundaryMiddleware, ErrorBoundaryConfig } from './error-boundary.js';
import { ErrorRecoveryService, RecoveryOptions } from './error-recovery.js';
import { ErrorReportingService, ErrorReportingConfig } from './error-reporting.js';
import {
  BaseError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ErrorContextBuilder,
  ErrorCategory,
  ErrorSeverity,
  ErrorContext,
} from './error-types.js';

export interface ErrorHandlingConfig {
  boundary: Partial<ErrorBoundaryConfig>;
  recovery: Partial<RecoveryOptions>;
  reporting: Partial<ErrorReportingConfig>;
  timeout: {
    enabled: boolean;
    timeoutMs: number;
  };
  requestId: {
    enabled: boolean;
    header: string;
    generate: boolean;
  };
}

/**
 * Express error handling integration service
 */
export class ExpressErrorHandler {
  private app: Application;
  private logger: Logger;
  private metrics?: MetricsCollector;
  private circuitBreaker?: CircuitBreaker;
  private boundary: ErrorBoundaryMiddleware;
  private recovery: ErrorRecoveryService;
  private reporting: ErrorReportingService;
  private config: ErrorHandlingConfig;

  constructor(
    app: Application,
    logger: Logger,
    config: Partial<ErrorHandlingConfig> = {},
    metrics?: MetricsCollector,
    circuitBreaker?: CircuitBreaker,
  ) {
    this.app = app;
    this.logger = logger;
    this.metrics = metrics;
    this.circuitBreaker = circuitBreaker;

    this.config = {
      boundary: {},
      recovery: {},
      reporting: {},
      timeout: {
        enabled: true,
        timeoutMs: 30000, // 30 seconds
      },
      requestId: {
        enabled: true,
        header: 'x-request-id',
        generate: true,
      },
      ...config,
    };

    // Initialize services
    this.boundary = new ErrorBoundaryMiddleware(logger, this.config.boundary, metrics);

    this.recovery = new ErrorRecoveryService(logger, circuitBreaker, this.config.recovery);

    this.reporting = new ErrorReportingService(logger, this.config.reporting, metrics);

    this.setupMiddleware();
  }

  /**
   * Setup all error handling middleware
   */
  private setupMiddleware(): void {
    // Request ID middleware (first)
    if (this.config.requestId.enabled) {
      this.app.use(this.requestIdMiddleware.bind(this));
    }

    // Request timeout middleware
    if (this.config.timeout.enabled) {
      this.app.use(this.boundary.handleTimeout(this.config.timeout.timeoutMs));
    }

    // Recovery wrapper for route handlers
    this.setupRecoveryWrapper();

    // Error boundary middleware (last)
    this.app.use(this.boundary.handleNotFound);
    this.app.use(this.enhancedErrorHandler.bind(this));
  }

  /**
   * Request ID middleware
   */
  private requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers[this.config.requestId.header] as string) ||
      (this.config.requestId.generate
        ? `req_${Date.now()}_${randomUUID().replace(/-/g, '').substring(0, 12)}`
        : undefined);

    if (requestId) {
      req.headers[this.config.requestId.header] = requestId;
      res.setHeader(this.config.requestId.header, requestId);
    }

    next();
  }

  /**
   * Enhanced error handler with reporting integration
   */
  private enhancedErrorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Convert to BaseError if needed
    const context = new ErrorContextBuilder()
      .setRequestId((req.headers[this.config.requestId.header] as string) || 'unknown')
      .setEndpoint(req.originalUrl)
      .setMethod(req.method)
      .setUserId(req.headers['x-user-id'] as string)
      .setSessionId(req.headers['x-session-id'] as string)
      .setCorrelationId(req.headers['x-correlation-id'] as string)
      .addData('userAgent', req.headers['user-agent'])
      .addData('ip', req.ip || req.connection.remoteAddress)
      .build();

    let appError: BaseError;
    if (error instanceof BaseError) {
      appError = error;
      // Update context if needed
      if (!appError.context.requestId && context.requestId) {
        Object.assign(appError.context, context);
      }
    } else {
      // Convert standard errors to BaseErrors
      appError = this.convertToBaseError(error, context);
    }

    // Report to centralized system
    this.reporting.reportError(appError);

    // Handle the error with boundary middleware
    this.boundary.handleError(appError, req, res, next);
  }

  /**
   * Setup recovery wrapper for route handlers
   */
  private setupRecoveryWrapper(): void {
    // Instead of wrapping the app methods, we'll provide a utility method
    // for developers to wrap their handlers if needed
  }

  /**
   * Utility method to wrap individual handlers with error recovery
   */
  public wrapHandlerWithRecovery(handler: Function, method = 'UNKNOWN', path = '/unknown') {
    return this.wrapHandlerInternal(handler, method, path);
  }

  /**
   * Wrap individual route handler with recovery
   */
  private wrapHandlerInternal(handler: Function, method: string, path: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const context = this.recovery.createRecoveryContext(path, method, {
          handlerName: handler.name || 'anonymous',
        });

        // Execute with recovery if it's an async handler
        if (handler.constructor.name === 'AsyncFunction') {
          await this.recovery.executeWithRecovery(() => handler(req, res, next), context, {
            enableRetry: false, // Don't retry HTTP handlers by default
            enableFallback: true,
            enableCircuitBreaker: true,
          });
        } else {
          // Synchronous handler
          handler(req, res, next);
        }
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Convert standard errors to BaseError instances
   */
  private convertToBaseError(error: Error, context: Partial<ErrorContext> | undefined): BaseError {
    // Handle specific error types
    if (error.name === 'ValidationError' || error.message.toLowerCase().includes('validation')) {
      return new ValidationError(
        error.message,
        [], // validation errors array
        context,
      );
    }

    if (
      error.name === 'UnauthorizedError' ||
      error.message.toLowerCase().includes('unauthorized')
    ) {
      return new AuthenticationError('Authentication required', context);
    }

    if (error.name === 'NotFoundError' || error.message.toLowerCase().includes('not found')) {
      return new NotFoundError(error.message, undefined, undefined, context);
    }

    if (
      error.name === 'TooManyRequestsError' ||
      error.message.toLowerCase().includes('rate limit')
    ) {
      return new RateLimitError(
        100, // limit
        60000, // window in ms (1 minute)
        60, // retry after seconds
        context,
      );
    }

    // Default to internal server error
    return new (class extends BaseError {
      constructor() {
        super(
          error.message || 'An unexpected error occurred',
          'INTERNAL' as ErrorCategory,
          'HIGH' as ErrorSeverity,
          500,
          context,
          true,
          false,
        );
      }
    })();
  }

  /**
   * Add error reporting endpoints
   */
  public addErrorReportingEndpoints(): void {
    // Error reports dashboard
    this.app.get(
      '/admin/errors',
      this.boundary.wrapAsync(async (req: Request, res: Response) => {
        const filters = {
          severity: req.query.severity as ErrorSeverity | undefined,
          category: req.query.category as ErrorCategory | undefined,
          status: req.query.status as string,
          limit: parseInt(req.query.limit as string) || 50,
          offset: parseInt(req.query.offset as string) || 0,
        };

        const reports = this.reporting.getErrorReports(filters);
        const trends = this.reporting.getErrorTrends();

        res.json({
          reports,
          trends,
          pagination: {
            limit: filters.limit,
            offset: filters.offset,
            total: reports.length,
          },
        });
      }),
    );

    // Error trends endpoint
    this.app.get(
      '/admin/errors/trends',
      this.boundary.wrapAsync(async (req: Request, res: Response) => {
        const timeWindow = (req.query.timeWindow as string) || '1h';
        const trends = this.reporting.getErrorTrends(timeWindow);
        res.json({ trends });
      }),
    );

    // Error metrics endpoint
    this.app.get(
      '/admin/errors/metrics',
      this.boundary.wrapAsync(async (req: Request, res: Response) => {
        const errorMetrics = this.boundary.getMetrics();
        res.json(errorMetrics);
      }),
    );

    // Export error reports
    this.app.get(
      '/admin/errors/export',
      this.boundary.wrapAsync(async (req: Request, res: Response) => {
        const format = (req.query.format as 'json' | 'csv') || 'json';
        const data = this.reporting.exportReports(format);

        const contentType = format === 'csv' ? 'text/csv' : 'application/json';
        const filename = `error-reports-${new Date().toISOString().split('T')[0]}.${format}`;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(data);
      }),
    );

    // Update error resolution
    this.app.patch(
      '/admin/errors/:errorKey/resolution',
      this.boundary.wrapAsync(async (req: Request, res: Response) => {
        const { errorKey } = req.params;
        const { status, assignee, notes } = req.body;

        const updated = this.reporting.updateErrorResolution(errorKey, status, assignee, notes);

        if (updated) {
          res.json({ success: true, message: 'Error resolution updated' });
        } else {
          res.status(404).json({ error: 'Error report not found' });
        }
      }),
    );
  }

  /**
   * Get error handling services
   */
  public getServices() {
    return {
      boundary: this.boundary,
      recovery: this.recovery,
      reporting: this.reporting,
    };
  }

  /**
   * Get error handling metrics
   */
  public getErrorMetrics() {
    return {
      boundary: this.boundary.getMetrics(),
      reports: this.reporting.getErrorReports({ limit: 100 }),
      trends: this.reporting.getErrorTrends(),
    };
  }

  /**
   * Shutdown error handling services
   */
  public shutdown(): void {
    this.reporting.shutdown();
  }
}
