/**
 * Enhanced Express HTTP Server with Advanced Error Handling
 * Integrates error boundaries, recovery, and reporting with Express application
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ExpressErrorHandler } from './express-error-integration.js';
import { DocumentationService } from '../endpoints/documentation.js';
import {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from './error-types.js';

export interface EnhancedServerConfig {
  port: number;
  enableErrorReporting: boolean;
  enableDocumentation: boolean;
  enableHealthChecks: boolean;
  enableMetrics: boolean;
  corsOptions?: cors.CorsOptions;
  helmetOptions?: Record<string, unknown>;
  errorHandling: {
    enableStackTrace: boolean;
    enableDetailedErrors: boolean;
    alertThresholds: {
      criticalErrorsPerMinute: number;
      highErrorsPerMinute: number;
      totalErrorsPerMinute: number;
    };
  };
}

/**
 * Enhanced Express server with comprehensive error handling
 */
export class EnhancedExpressServer {
  private app: Application;
  private server?: ReturnType<Application['listen']>;
  private logger: Logger;
  private metrics: MetricsCollector;
  private circuitBreaker: CircuitBreaker;
  private errorHandler!: ExpressErrorHandler; // Will be initialized in initializeErrorHandling
  private config: EnhancedServerConfig;

  constructor(
    logger: Logger,
    metrics: MetricsCollector,
    circuitBreaker: CircuitBreaker,
    config: Partial<EnhancedServerConfig> = {},
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.circuitBreaker = circuitBreaker;

    this.config = {
      port: 3001,
      enableErrorReporting: true,
      enableDocumentation: true,
      enableHealthChecks: true,
      enableMetrics: true,
      errorHandling: {
        enableStackTrace: process.env.NODE_ENV === 'development',
        enableDetailedErrors: process.env.NODE_ENV === 'development',
        alertThresholds: {
          criticalErrorsPerMinute: 5,
          highErrorsPerMinute: 10,
          totalErrorsPerMinute: 50,
        },
      },
      ...config,
    };

    this.app = express();
    this.initializeMiddleware();
    this.initializeErrorHandling();
    this.initializeRoutes();
  }

  /**
   * Initialize base middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet(this.config.helmetOptions));

    // CORS middleware
    this.app.use(
      cors(
        this.config.corsOptions || {
          origin: process.env.NODE_ENV === 'development' ? '*' : false,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id'],
        },
      ),
    );

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.apiCall(req.method, req.originalUrl, duration, res.statusCode, {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          requestId: req.headers['x-request-id'],
        });

        if (this.config.enableMetrics) {
          this.metrics.recordRequest(duration, false);
        }
      });

      next();
    });
  }

  /**
   * Initialize error handling system
   */
  private initializeErrorHandling(): void {
    this.errorHandler = new ExpressErrorHandler(
      this.app,
      this.logger,
      {
        boundary: this.config.errorHandling,
        recovery: {
          enableRetry: false, // Don't retry HTTP requests by default
          enableFallback: true,
          enableCircuitBreaker: true,
        },
        reporting: {
          enableAggregation: this.config.enableErrorReporting,
          enableExternalReporting: false, // Would be configured in production
          reportingThreshold: {
            criticalErrors: this.config.errorHandling.alertThresholds.criticalErrorsPerMinute,
            highErrors: this.config.errorHandling.alertThresholds.highErrorsPerMinute,
            mediumErrors: this.config.errorHandling.alertThresholds.totalErrorsPerMinute,
          },
        },
        timeout: {
          enabled: true,
          timeoutMs: 30000,
        },
        requestId: {
          enabled: true,
          header: 'x-request-id',
          generate: true,
        },
      },
      this.metrics,
      this.circuitBreaker,
    );

    // Add error reporting endpoints
    if (this.config.enableErrorReporting) {
      this.errorHandler.addErrorReportingEndpoints();
    }
  }

  /**
   * Initialize application routes
   */
  private initializeRoutes(): void {
    // Root endpoint
    this.app.get(
      '/',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          res.json({
            name: 'Legal MCP Server - Enhanced Edition',
            version: '2.0.0',
            status: 'running',
            features: {
              errorHandling: true,
              circuitBreaker: true,
              metrics: this.config.enableMetrics,
              documentation: this.config.enableDocumentation,
              healthChecks: this.config.enableHealthChecks,
            },
            endpoints: {
              docs: '/docs',
              health: '/health',
              metrics: '/metrics',
              admin: '/admin',
              api: '/api',
            },
            timestamp: new Date().toISOString(),
          });
        },
        'GET',
        '/',
      ),
    );

    // Health check endpoints
    if (this.config.enableHealthChecks) {
      this.app.get(
        '/health',
        this.errorHandler.wrapHandlerWithRecovery(
          async (req: Request, res: Response) => {
            const healthStatus = {
              status: 'healthy',
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              version: '2.0.0',
              service: 'courtlistener-mcp-enhanced',
              dependencies: {
                express: 'healthy',
                errorHandling: 'active',
                circuitBreaker: 'active',
              },
              metrics: this.config.enableMetrics ? this.metrics.getMetrics() : null,
            };

            res.json(healthStatus);
          },
          'GET',
          '/health',
        ),
      );

      this.app.get(
        '/metrics',
        this.errorHandler.wrapHandlerWithRecovery(
          async (req: Request, res: Response) => {
            if (!this.config.enableMetrics) {
              return res.status(404).json({ error: 'Metrics not enabled' });
            }

            const metrics = this.metrics.getMetrics();
            res.json(metrics);
          },
          'GET',
          '/metrics',
        ),
      );
    }

    // API documentation endpoints
    if (this.config.enableDocumentation) {
      const docService = new DocumentationService(this.logger);
      this.app.use('/docs', docService.getRouter());
    }

    // Demo API endpoints to showcase error handling
    this.initializeDemoEndpoints();

    // Admin endpoints (metrics, error reports, etc.)
    if (this.config.enableMetrics || this.config.enableErrorReporting) {
      this.initializeAdminEndpoints();
    }
  }

  /**
   * Initialize demo endpoints to showcase error handling
   */
  private initializeDemoEndpoints(): void {
    const router = express.Router();

    // Success endpoint
    router.get(
      '/success',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          res.json({
            message: 'This endpoint always succeeds',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
          });
        },
        'GET',
        '/api/success',
      ),
    );

    // Validation error demo
    router.post(
      '/validate',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          const { name, email, age } = req.body;
          const errors = [];

          if (!name || name.length < 2) {
            errors.push({
              field: 'name',
              message: 'Name must be at least 2 characters',
              value: name,
            });
          }

          if (!email || !email.includes('@')) {
            errors.push({ field: 'email', message: 'Valid email is required', value: email });
          }

          if (age && (age < 0 || age > 150)) {
            errors.push({ field: 'age', message: 'Age must be between 0 and 150', value: age });
          }

          if (errors.length > 0) {
            throw new ValidationError('Validation failed', errors);
          }

          res.json({ message: 'Validation passed', data: { name, email, age } });
        },
        'POST',
        '/api/validate',
      ),
    );

    // Authentication error demo
    router.get(
      '/protected',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          const token = req.headers.authorization;

          if (!token || !token.startsWith('Bearer ')) {
            throw new AuthenticationError('Bearer token required');
          }

          res.json({
            message: 'Access granted to protected resource',
            user: 'demo-user',
            timestamp: new Date().toISOString(),
          });
        },
        'GET',
        '/api/protected',
      ),
    );

    // Not found error demo
    router.get(
      '/missing/:id',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          const { id } = req.params;

          // Simulate looking for a resource
          if (id !== '42') {
            throw new NotFoundError(`Resource with ID ${id} not found`);
          }

          res.json({
            id,
            name: 'The Answer',
            description: 'The answer to life, the universe, and everything',
          });
        },
        'GET',
        '/api/missing/:id',
      ),
    );

    // Rate limit error demo
    router.get(
      '/rate-limited',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          // Simulate rate limiting (normally would check actual rate limits)
          const random = Math.random();
          if (random < 0.3) {
            // 30% chance of rate limit
            throw new RateLimitError(10, 60000, 60); // 10 requests per minute, retry after 60 seconds
          }

          res.json({
            message: 'Rate limit check passed',
            remainingRequests: Math.floor(random * 10),
            resetTime: new Date(Date.now() + 60000).toISOString(),
          });
        },
        'GET',
        '/api/rate-limited',
      ),
    );

    // Circuit breaker demo
    router.get(
      '/circuit-breaker',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          // This would normally call an external service through the circuit breaker
          const result = await this.circuitBreaker.execute(async () => {
            // Simulate external API call
            const success = Math.random() > 0.3; // 70% success rate
            if (!success) {
              throw new Error('External service temporarily unavailable');
            }
            return { data: 'External service response', timestamp: new Date().toISOString() };
          });

          res.json({
            message: 'Circuit breaker call succeeded',
            result,
            circuitState: 'CLOSED', // Would get actual state from circuit breaker
          });
        },
        'GET',
        '/api/circuit-breaker',
      ),
    );

    // Internal server error demo
    router.get(
      '/error',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          // Simulate an unexpected error
          throw new Error('Simulated internal server error');
        },
        'GET',
        '/api/error',
      ),
    );

    this.app.use('/api', router);
  }

  /**
   * Initialize admin endpoints for monitoring
   */
  private initializeAdminEndpoints(): void {
    const router = express.Router();

    // Metrics endpoint
    if (this.config.enableMetrics) {
      router.get(
        '/metrics',
        this.errorHandler.wrapHandlerWithRecovery(
          async (req: Request, res: Response) => {
            const metrics = this.metrics.getMetrics();
            const errorMetrics = this.errorHandler.getErrorMetrics();

            res.json({
              server: metrics,
              errors: errorMetrics,
              timestamp: new Date().toISOString(),
            });
          },
          'GET',
          '/admin/metrics',
        ),
      );
    }

    // System status endpoint
    router.get(
      '/status',
      this.errorHandler.wrapHandlerWithRecovery(
        async (req: Request, res: Response) => {
          const services = this.errorHandler.getServices();

          res.json({
            status: 'operational',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            errorHandling: {
              boundary: 'active',
              recovery: 'active',
              reporting: 'active',
            },
            circuitBreaker: {
              state: 'CLOSED', // Would get actual state
              failureCount: 0,
              lastFailureTime: null,
            },
            timestamp: new Date().toISOString(),
          });
        },
        'GET',
        '/admin/status',
      ),
    );

    this.app.use('/admin', router);
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, (err?: Error) => {
        if (err) {
          this.logger.error('Failed to start enhanced Express server', err);
          reject(err);
        } else {
          this.logger.info('Enhanced Express server started', {
            port: this.config.port,
            features: {
              errorHandling: true,
              documentation: this.config.enableDocumentation,
              healthChecks: this.config.enableHealthChecks,
              metrics: this.config.enableMetrics,
              errorReporting: this.config.enableErrorReporting,
            },
          });
          resolve();
        }
      });
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.errorHandler.shutdown();
          this.logger.info('Enhanced Express server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the Express application instance
   */
  public getApp(): Application {
    return this.app;
  }

  /**
   * Get error handling services
   */
  public getErrorHandler(): ExpressErrorHandler {
    return this.errorHandler;
  }
}
