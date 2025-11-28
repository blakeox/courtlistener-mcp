/**
 * Error Boundary Middleware for Express Applications
 * Provides centralized error handling, logging, and structured responses
 */

import { Request, Response, NextFunction } from 'express';
import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';
import {
  BaseError,
  ErrorSeverity,
  ErrorCategory,
  ErrorContext,
  InternalServerError,
  ErrorContextBuilder,
} from './error-types.js';

export interface ErrorBoundaryConfig {
  enableStackTrace: boolean;
  enableDetailedErrors: boolean;
  enableMetrics: boolean;
  enableAlerts: boolean;
  alertThresholds: {
    criticalErrorsPerMinute: number;
    highErrorsPerMinute: number;
    totalErrorsPerMinute: number;
  };
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Map<ErrorCategory, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  errorsByStatusCode: Map<number, number>;
  criticalErrorsInLastMinute: number;
  highErrorsInLastMinute: number;
  averageResponseTime: number;
}

/**
 * Advanced error boundary middleware with comprehensive error handling
 */
export class ErrorBoundaryMiddleware {
  private logger: Logger;
  private metrics?: MetricsCollector;
  private config: ErrorBoundaryConfig;
  private errorMetrics: ErrorMetrics;
  private recentErrors: Array<{ timestamp: number; severity: ErrorSeverity }> = [];

  constructor(
    logger: Logger,
    config: Partial<ErrorBoundaryConfig> = {},
    metrics?: MetricsCollector,
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.config = {
      enableStackTrace: process.env.NODE_ENV === 'development',
      enableDetailedErrors: process.env.NODE_ENV === 'development',
      enableMetrics: true,
      enableAlerts: true,
      alertThresholds: {
        criticalErrorsPerMinute: 5,
        highErrorsPerMinute: 10,
        totalErrorsPerMinute: 50,
      },
      ...config,
    };

    this.errorMetrics = {
      totalErrors: 0,
      errorsByCategory: new Map(),
      errorsBySeverity: new Map(),
      errorsByStatusCode: new Map(),
      criticalErrorsInLastMinute: 0,
      highErrorsInLastMinute: 0,
      averageResponseTime: 0,
    };

    // Clean up old error records every minute
    setInterval(() => this.cleanupOldErrors(), 60000);
  }

  /**
   * Main error handling middleware
   */
  public handleError = (error: Error, req: Request, res: Response, _next: NextFunction): void => {
    const startTime = Date.now();

    try {
      // Build error context from request
      const context = this.buildErrorContext(req);

      // Convert to BaseError if needed
      const appError = this.normalizeError(error, context);

      // Log the error
      this.logError(appError, req);

      // Update metrics
      this.updateMetrics(appError);

      // Check alert thresholds
      this.checkAlertThresholds();

      // Send response
      this.sendErrorResponse(appError, req, res);

      // Record response time
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeMetrics(responseTime);
    } catch (handlingError) {
      // If error handling itself fails, fall back to basic response
      this.logger.error(
        'Error in error handling middleware',
        handlingError instanceof Error ? handlingError : new Error(String(handlingError)),
      );
      this.sendFallbackErrorResponse(res);
    }
  };

  /**
   * Async error wrapper for route handlers
   */
  public wrapAsync = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };

  /**
   * 404 Not Found handler
   */
  public handleNotFound = (req: Request, res: Response, next: NextFunction): void => {
    const context = this.buildErrorContext(req);
    const error = new (class extends BaseError {
      constructor() {
        super(
          `Route ${req.method} ${req.originalUrl} not found`,
          ErrorCategory.NOT_FOUND,
          ErrorSeverity.LOW,
          404,
          context,
          true,
          false,
        );
      }
    })();

    this.handleError(error, req, res, next);
  };

  /**
   * Request timeout handler
   */
  public handleTimeout = (timeoutMs: number) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          const context = this.buildErrorContext(req);
          const error = new (class extends BaseError {
            constructor() {
              super(
                `Request timeout after ${timeoutMs}ms`,
                ErrorCategory.INTERNAL,
                ErrorSeverity.HIGH,
                408,
                context,
                true,
                true,
              );
            }
          })();

          next(error);
        }
      }, timeoutMs);

      res.on('finish', () => clearTimeout(timeout));
      res.on('close', () => clearTimeout(timeout));

      next();
    };
  };

  /**
   * Build error context from Express request
   */
  private buildErrorContext(req: Request): ErrorContext {
    return new ErrorContextBuilder()
      .setRequestId((req.headers['x-request-id'] as string) || `req_${Date.now()}`)
      .setUserId(req.headers['x-user-id'] as string)
      .setEndpoint(req.originalUrl)
      .setMethod(req.method)
      .setCorrelationId(req.headers['x-correlation-id'] as string)
      .setSessionId(req.headers['x-session-id'] as string)
      .addData('userAgent', req.headers['user-agent'])
      .addData('ip', req.ip || req.connection.remoteAddress)
      .addData('query', req.query)
      .addData('params', req.params)
      .build();
  }

  /**
   * Convert any error to BaseError
   */
  private normalizeError(error: Error, context: ErrorContext): BaseError {
    if (error instanceof BaseError) {
      // Update context if it doesn't have one
      if (!error.context.requestId && context.requestId) {
        Object.assign(error.context, context);
      }
      return error;
    }

    // Handle specific known error types
    if (error.name === 'ValidationError') {
      return new (class extends BaseError {
        constructor() {
          super(
            error.message,
            ErrorCategory.VALIDATION,
            ErrorSeverity.LOW,
            400,
            context,
            true,
            false,
          );
        }
      })();
    }

    if (error.name === 'CastError' || error.name === 'MongoError') {
      return new (class extends BaseError {
        constructor() {
          super(
            'Database operation failed',
            ErrorCategory.DATABASE,
            ErrorSeverity.HIGH,
            500,
            context,
            true,
            true,
          );
        }
      })();
    }

    if (error.name === 'TimeoutError') {
      return new (class extends BaseError {
        constructor() {
          super(
            error.message || 'Operation timed out',
            ErrorCategory.NETWORK,
            ErrorSeverity.MEDIUM,
            408,
            context,
            true,
            true,
          );
        }
      })();
    }

    // Default to internal server error
    return new InternalServerError(
      this.config.enableDetailedErrors ? error.message : 'An unexpected error occurred',
      context,
      false,
    );
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: BaseError, req: Request): void {
    const logData = {
      ...error.toLogFormat(),
      request: {
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(`Critical error: ${error.message}`, error, logData);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(`High severity error: ${error.message}`, error, logData);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(`Medium severity error: ${error.message}`, logData);
        break;
      case ErrorSeverity.LOW:
        this.logger.info(`Low severity error: ${error.message}`, logData);
        break;
    }
  }

  /**
   * Update error metrics
   */
  private updateMetrics(error: BaseError): void {
    if (!this.config.enableMetrics) return;

    this.errorMetrics.totalErrors++;

    // Update by category
    const categoryCount = this.errorMetrics.errorsByCategory.get(error.category) || 0;
    this.errorMetrics.errorsByCategory.set(error.category, categoryCount + 1);

    // Update by severity
    const severityCount = this.errorMetrics.errorsBySeverity.get(error.severity) || 0;
    this.errorMetrics.errorsBySeverity.set(error.severity, severityCount + 1);

    // Update by status code
    const statusCount = this.errorMetrics.errorsByStatusCode.get(error.httpStatus) || 0;
    this.errorMetrics.errorsByStatusCode.set(error.httpStatus, statusCount + 1);

    // Track recent errors for alerting
    this.recentErrors.push({
      timestamp: Date.now(),
      severity: error.severity,
    });

    // Send metrics to collector
    if (this.metrics) {
      this.metrics.recordFailure(0); // Error occurred, no response time available
    }
  }

  /**
   * Update response time metrics
   */
  private updateResponseTimeMetrics(responseTime: number): void {
    // Simple moving average (in production, use a proper sliding window)
    this.errorMetrics.averageResponseTime =
      (this.errorMetrics.averageResponseTime + responseTime) / 2;
  }

  /**
   * Check if alert thresholds are exceeded
   */
  private checkAlertThresholds(): void {
    if (!this.config.enableAlerts) return;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Count recent errors
    const recentCritical = this.recentErrors.filter(
      (e) => e.timestamp >= oneMinuteAgo && e.severity === ErrorSeverity.CRITICAL,
    ).length;

    const recentHigh = this.recentErrors.filter(
      (e) => e.timestamp >= oneMinuteAgo && e.severity === ErrorSeverity.HIGH,
    ).length;

    const recentTotal = this.recentErrors.filter((e) => e.timestamp >= oneMinuteAgo).length;

    // Update metrics
    this.errorMetrics.criticalErrorsInLastMinute = recentCritical;
    this.errorMetrics.highErrorsInLastMinute = recentHigh;

    // Check thresholds and log alerts
    if (recentCritical >= this.config.alertThresholds.criticalErrorsPerMinute) {
      this.logger.error(
        `ALERT: Critical error threshold exceeded: ${recentCritical} errors in last minute`,
        undefined,
        {
          alertType: 'critical_errors_threshold',
          count: recentCritical,
          threshold: this.config.alertThresholds.criticalErrorsPerMinute,
        },
      );
    }

    if (recentHigh >= this.config.alertThresholds.highErrorsPerMinute) {
      this.logger.warn(
        `ALERT: High error threshold exceeded: ${recentHigh} errors in last minute`,
        {
          alertType: 'high_errors_threshold',
          count: recentHigh,
          threshold: this.config.alertThresholds.highErrorsPerMinute,
        },
      );
    }

    if (recentTotal >= this.config.alertThresholds.totalErrorsPerMinute) {
      this.logger.warn(
        `ALERT: Total error threshold exceeded: ${recentTotal} errors in last minute`,
        {
          alertType: 'total_errors_threshold',
          count: recentTotal,
          threshold: this.config.alertThresholds.totalErrorsPerMinute,
        },
      );
    }
  }

  /**
   * Clean up old error records
   */
  private cleanupOldErrors(): void {
    const oneHourAgo = Date.now() - 3600000; // 1 hour
    this.recentErrors = this.recentErrors.filter((e) => e.timestamp >= oneHourAgo);
  }

  /**
   * Send structured error response
   */
  private sendErrorResponse(error: BaseError, req: Request, res: Response): void {
    if (res.headersSent) {
      return; // Response already sent
    }

    const response: Record<string, unknown> = {
      error: error.category,
      message: error.message,
      errorId: error.errorId,
      timestamp: error.timestamp,
      path: req.originalUrl,
      method: req.method,
    };

    // Add additional error-specific data
    if (error.toJSON) {
      const errorData = error.toJSON();
      Object.assign(response, errorData);
    }

    // Add stack trace in development
    if (this.config.enableStackTrace && error.context.stackTrace) {
      response.stackTrace = error.context.stackTrace;
    }

    // Add retry information for retryable errors
    if (error.retryable) {
      response.retryable = true;
      response.retryAfter = this.calculateRetryAfter(error);
    }

    res.status(error.httpStatus).json(response);
  }

  /**
   * Send fallback error response when error handling fails
   */
  private sendFallbackErrorResponse(res: Response): void {
    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Calculate retry-after header value
   */
  private calculateRetryAfter(error: BaseError): number {
    switch (error.severity) {
      case ErrorSeverity.LOW:
        return 1; // 1 second
      case ErrorSeverity.MEDIUM:
        return 5; // 5 seconds
      case ErrorSeverity.HIGH:
        return 30; // 30 seconds
      case ErrorSeverity.CRITICAL:
        return 300; // 5 minutes
      default:
        return 10; // 10 seconds
    }
  }

  /**
   * Get current error metrics
   */
  public getMetrics(): ErrorMetrics {
    return { ...this.errorMetrics };
  }

  /**
   * Reset error metrics
   */
  public resetMetrics(): void {
    this.errorMetrics = {
      totalErrors: 0,
      errorsByCategory: new Map(),
      errorsBySeverity: new Map(),
      errorsByStatusCode: new Map(),
      criticalErrorsInLastMinute: 0,
      highErrorsInLastMinute: 0,
      averageResponseTime: 0,
    };
    this.recentErrors = [];
  }
}
