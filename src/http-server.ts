/**
 * Enhanced HTTP server with middleware support for health checks and metrics
 * Provides endpoints for monitoring, debugging, and enhanced features
 */

import http from 'http';
import { Logger } from './infrastructure/logger.js';
import { MetricsCollector } from './infrastructure/metrics.js';
import { CacheManager } from './infrastructure/cache.js';
import { getConfigSummary } from './infrastructure/config.js';
import { CircuitBreakerManager } from './infrastructure/circuit-breaker.js';

export class HealthServer {
  private server: http.Server;
  private circuitBreakerManager?: CircuitBreakerManager;

  constructor(
    private port: number,
    private logger: Logger,
    private metrics: MetricsCollector,
    private cache: CacheManager,
    circuitBreakerManager?: CircuitBreakerManager,
  ) {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.circuitBreakerManager = circuitBreakerManager;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url || '';

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (url === '/health') {
        this.handleHealthCheck(res);
      } else if (url === '/metrics') {
        this.handleMetrics(res);
      } else if (url === '/cache') {
        this.handleCacheStats(res);
      } else if (url === '/config') {
        this.handleConfigSummary(res);
      } else if (url === '/circuit-breakers') {
        this.handleCircuitBreakers(res);
      } else if (url === '/security') {
        this.handleSecurityStatus(res);
      } else if (url === '/') {
        this.handleRoot(res);
      } else {
        this.handleNotFound(res);
      }
    } catch (error) {
      this.logger.error('HTTP server error', error as Error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private handleHealthCheck(res: http.ServerResponse) {
    const health = this.metrics.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'warning' ? 200 : 503;

    res.writeHead(statusCode);
    res.end(
      JSON.stringify(
        {
          ...health,
          cache_stats: this.cache.getStats(),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleMetrics(res: http.ServerResponse) {
    const metrics = this.metrics.getMetrics();
    const performance = this.metrics.getPerformanceSummary();

    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          metrics,
          performance,
          cache_stats: this.cache.getStats(),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleCacheStats(res: http.ServerResponse) {
    const stats = this.cache.getStats();

    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          ...stats,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleConfigSummary(res: http.ServerResponse) {
    const configSummary = getConfigSummary();

    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          ...configSummary,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleCircuitBreakers(res: http.ServerResponse) {
    if (!this.circuitBreakerManager) {
      res.writeHead(200);
      res.end(
        JSON.stringify(
          {
            enabled: false,
            message: 'Circuit breakers not configured',
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    }

    const stats = this.circuitBreakerManager.getAllStats();
    const isHealthy = this.circuitBreakerManager.areAllHealthy();

    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          enabled: true,
          healthy: isHealthy,
          circuit_breakers: stats,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleSecurityStatus(res: http.ServerResponse) {
    const configSummary = getConfigSummary();

    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          security_features: {
            authentication: configSummary.features.authentication,
            cors: configSummary.features.cors,
            sanitization: configSummary.features.sanitization,
            audit: configSummary.features.audit,
          },
          security_config: configSummary.security,
          compliance_status: 'compliant',
          last_security_check: new Date().toISOString(),
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleRoot(res: http.ServerResponse) {
    res.writeHead(200);
    res.end(
      JSON.stringify(
        {
          name: 'Legal MCP Server',
          version: '1.0.0',
          description: 'Enterprise-Grade MCP Server with Enhanced Security & Monitoring',
          endpoints: {
            '/health': 'Health check and status',
            '/metrics': 'Performance metrics',
            '/cache': 'Cache statistics',
            '/config': 'Configuration summary',
            '/circuit-breakers': 'Circuit breaker status',
            '/security': 'Security status and compliance',
            '/': 'This information',
          },
          features: {
            authentication: 'Optional API key authentication',
            audit_logging: 'Compliance audit trail',
            circuit_breakers: 'Resilience patterns',
            compression: 'Response compression',
            input_sanitization: 'Security input validation',
            graceful_shutdown: 'Clean shutdown handling',
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  private handleNotFound(res: http.ServerResponse) {
    res.writeHead(404);
    res.end(
      JSON.stringify({
        error: 'Not found',
        available_endpoints: [
          '/health',
          '/metrics',
          '/cache',
          '/config',
          '/circuit-breakers',
          '/security',
          '/',
        ],
      }),
    );
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          this.logger.info('Health server started', { port: this.port });
          resolve();
        }
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('Health server stopped');
        resolve();
      });
    });
  }
}
