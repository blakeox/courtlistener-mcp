/**
 * Enhanced HTTP Server with Express and Health Endpoints
 * Production-ready server with comprehensive monitoring and health checks
 */

import express, { Application } from 'express';
import http from 'http';
import { Logger } from './infrastructure/logger.js';
import { MetricsCollector } from './infrastructure/metrics.js';
import { CacheManager } from './infrastructure/cache.js';
import { CourtListenerAPI } from './courtlistener.js';
import { HealthCheckManager } from './infrastructure/health-check.js';
import { HealthEndpoints } from './endpoints/health.js';
import { DocumentationService } from './endpoints/documentation.js';

export class EnhancedHttpServer {
  private app: Application;
  private server: http.Server;
  private healthChecker: HealthCheckManager;
  private healthEndpoints: HealthEndpoints;
  private documentationService: DocumentationService;

  constructor(
    private port: number,
    private logger: Logger,
    private metrics: MetricsCollector,
    private cache: CacheManager,
    private apiClient: CourtListenerAPI
  ) {
    this.app = express();
    this.server = http.createServer(this.app);
    
    // Initialize health checking
    this.healthChecker = new HealthCheckManager(
      this.logger,
      this.metrics,
      this.cache,
      this.apiClient
    );
    
    this.healthEndpoints = new HealthEndpoints(
      this.healthChecker,
      this.logger
    );

    // Initialize documentation service
    this.documentationService = new DocumentationService(this.logger);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Basic middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Special handling for documentation endpoints - allow unsafe-inline for CSS
    this.app.use('/api/docs', (req, res, next) => {
      res.removeHeader('X-Content-Type-Options');
      res.removeHeader('X-Frame-Options');
      res.header('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.redoc.ly; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data:; " +
        "connect-src 'self';"
      );
      next();
    });

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger.info('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          userAgent: req.get('User-Agent')
        });
        
        // Record metrics
        if (res.statusCode >= 400) {
          this.metrics.recordFailure(duration);
        } else {
          this.metrics.recordRequest(duration);
        }
      });
      
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoints
    this.app.get('/health', this.healthEndpoints.health.bind(this.healthEndpoints));
    this.app.get('/health/ready', this.healthEndpoints.readiness.bind(this.healthEndpoints));
    this.app.get('/health/live', this.healthEndpoints.liveness.bind(this.healthEndpoints));
    this.app.get('/metrics', this.healthEndpoints.metrics.bind(this.healthEndpoints));
    this.app.get('/status', this.healthEndpoints.status.bind(this.healthEndpoints));

    // API Documentation endpoints
    this.app.use('/api/docs', this.documentationService.getRouter());

    // Legacy endpoints for backward compatibility
    this.setupLegacyEndpoints();

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
          'GET /health',
          'GET /health/ready', 
          'GET /health/live',
          'GET /metrics',
          'GET /status',
          'GET /api/docs - API Documentation',
          'GET /api/docs/docs - Swagger UI',
          'GET /api/docs/openapi.json - OpenAPI Spec',
          'GET /cache',
          'GET /config'
        ]
      });
    });

    // Error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Express error handler', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
        requestId: req.get('X-Request-ID') || 'unknown'
      });
    });
  }

  private setupLegacyEndpoints(): void {
    // Legacy cache endpoint
    this.app.get('/cache', (req, res) => {
      try {
        const cacheStats = this.cache.getStats();
        res.json({
          status: 'success',
          timestamp: new Date().toISOString(),
          cache: cacheStats
        });
      } catch (error) {
        this.logger.error('Cache stats error', error as Error);
        res.status(500).json({
          error: 'Failed to retrieve cache statistics',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Legacy config endpoint
    this.app.get('/config', (req, res) => {
      try {
        const config = {
          server: {
            port: this.port,
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
          },
          features: {
            caching: true,
            metrics: true,
            healthChecks: true,
            rateLimit: false // Will be true when rate limiting is implemented
          }
        };
        
        res.json({
          status: 'success',
          timestamp: new Date().toISOString(),
          config
        });
      } catch (error) {
        this.logger.error('Config endpoint error', error as Error);
        res.status(500).json({
          error: 'Failed to retrieve configuration',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Simple ping endpoint
    this.app.get('/ping', (req, res) => {
      res.json({
        status: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.logger.info(`Enhanced HTTP server started`, {
          port: this.port,
          endpoints: [
            '/health - Comprehensive health check',
            '/health/ready - Kubernetes readiness probe',
            '/health/live - Kubernetes liveness probe',
            '/metrics - Prometheus metrics',
            '/status - Detailed status information',
            '/cache - Cache statistics',
            '/config - Server configuration',
            '/ping - Simple ping test'
          ]
        });
        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error('HTTP server error', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Stop health checking
      this.healthChecker.stop();
      
      // Close server
      this.server.close((error) => {
        if (error) {
          this.logger.error('Error stopping HTTP server', error);
          reject(error);
        } else {
          this.logger.info('HTTP server stopped gracefully');
          resolve();
        }
      });
    });
  }

  /**
   * Get server information
   */
  getServerInfo(): { port: number; isListening: boolean } {
    return {
      port: this.port,
      isListening: this.server.listening
    };
  }
}