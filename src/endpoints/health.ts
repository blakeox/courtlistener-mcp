/**
 * Health Check HTTP Endpoints
 * Production-ready health monitoring endpoints for containerized deployment
 */

import { Request, Response } from 'express';
import {
  HealthCheckManager,
  HealthStatus,
  DependencyStatus,
} from '../infrastructure/health-check.js';
import { Logger } from '../infrastructure/logger.js';

export class HealthEndpoints {
  constructor(
    private healthChecker: HealthCheckManager,
    private logger: Logger,
  ) {}

  /**
   * Comprehensive health check endpoint
   * GET /health
   */
  async health(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.healthChecker.getHealthStatus();

      const statusCode = {
        healthy: 200,
        degraded: 200, // Still functional but with warnings
        unhealthy: 503,
      }[healthStatus.status];

      res.status(statusCode).json({
        status: healthStatus.status,
        timestamp: healthStatus.timestamp,
        uptime: healthStatus.uptime,
        version: healthStatus.version,
        service: 'courtlistener-mcp',
        dependencies: healthStatus.dependencies,
        metrics: healthStatus.metrics,
      });
    } catch (error) {
      this.logger.error('Health check failed', error as Error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
        service: 'courtlistener-mcp',
      });
    }
  }

  /**
   * Kubernetes readiness probe endpoint
   * GET /health/ready
   */
  async readiness(req: Request, res: Response): Promise<void> {
    try {
      const readiness = await this.healthChecker.getReadinessStatus();

      if (readiness.ready) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          service: 'courtlistener-mcp',
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          reason: readiness.reason,
          service: 'courtlistener-mcp',
        });
      }
    } catch (error) {
      this.logger.error('Readiness check failed', error as Error);
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: (error as Error).message,
        service: 'courtlistener-mcp',
      });
    }
  }

  /**
   * Kubernetes liveness probe endpoint
   * GET /health/live
   */
  async liveness(req: Request, res: Response): Promise<void> {
    try {
      const liveness = this.healthChecker.getLivenessStatus();

      if (liveness.alive) {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
          service: 'courtlistener-mcp',
        });
      } else {
        res.status(503).json({
          status: 'not_alive',
          timestamp: new Date().toISOString(),
          reason: liveness.reason,
          service: 'courtlistener-mcp',
        });
      }
    } catch (error) {
      this.logger.error('Liveness check failed', error as Error);
      res.status(503).json({
        status: 'not_alive',
        timestamp: new Date().toISOString(),
        reason: (error as Error).message,
        service: 'courtlistener-mcp',
      });
    }
  }

  /**
   * Metrics endpoint (Prometheus compatible)
   * GET /metrics
   */
  async metrics(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.healthChecker.getHealthStatus();

      // Prometheus text format
      const prometheusMetrics = this.formatPrometheusMetrics(healthStatus);

      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.status(200).send(prometheusMetrics);
    } catch (error) {
      this.logger.error('Metrics endpoint failed', error as Error);
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Status endpoint with detailed information
   * GET /status
   */
  async status(req: Request, res: Response): Promise<void> {
    try {
      const healthStatus = await this.healthChecker.getHealthStatus();

      res.status(200).json({
        application: {
          name: 'CourtListener MCP Server',
          version: healthStatus.version,
          description: 'Legal research and case law search API integration',
          status: healthStatus.status,
          uptime: healthStatus.uptime,
          timestamp: healthStatus.timestamp,
        },
        system: {
          memory: healthStatus.metrics.memoryUsage,
          cpu: healthStatus.metrics.cpuUsage,
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        dependencies: healthStatus.dependencies.map((dep) => ({
          name: dep.name,
          status: dep.status,
          responseTime: dep.responseTime,
          lastChecked: dep.lastChecked,
          ...(dep.error && { error: dep.error }),
        })),
        metrics: {
          totalRequests: healthStatus.metrics.requestCount,
          errorRate: (healthStatus.metrics.errorRate * 100).toFixed(2) + '%',
          averageResponseTime: Math.round(healthStatus.metrics.averageResponseTime) + 'ms',
        },
      });
    } catch (error) {
      this.logger.error('Status endpoint failed', error as Error);
      res.status(500).json({
        error: 'Failed to retrieve status information',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Format metrics in Prometheus text format
   */
  private formatPrometheusMetrics(healthStatus: HealthStatus): string {
    const metrics = healthStatus.metrics;
    const timestamp = Date.now();

    return `
# HELP courtlistener_mcp_requests_total Total number of HTTP requests
# TYPE courtlistener_mcp_requests_total counter
courtlistener_mcp_requests_total ${metrics.requestCount} ${timestamp}

# HELP courtlistener_mcp_error_rate Current error rate
# TYPE courtlistener_mcp_error_rate gauge  
courtlistener_mcp_error_rate ${metrics.errorRate} ${timestamp}

# HELP courtlistener_mcp_response_time_avg Average response time in milliseconds
# TYPE courtlistener_mcp_response_time_avg gauge
courtlistener_mcp_response_time_avg ${metrics.averageResponseTime} ${timestamp}

# HELP courtlistener_mcp_uptime_seconds Server uptime in seconds
# TYPE courtlistener_mcp_uptime_seconds counter
courtlistener_mcp_uptime_seconds ${healthStatus.uptime} ${timestamp}

# HELP courtlistener_mcp_memory_usage_bytes Memory usage in bytes
# TYPE courtlistener_mcp_memory_usage_bytes gauge
courtlistener_mcp_memory_usage_bytes{type="rss"} ${metrics.memoryUsage.rss} ${timestamp}
courtlistener_mcp_memory_usage_bytes{type="heapUsed"} ${metrics.memoryUsage.heapUsed} ${timestamp}
courtlistener_mcp_memory_usage_bytes{type="heapTotal"} ${metrics.memoryUsage.heapTotal} ${timestamp}

# HELP courtlistener_mcp_dependency_status Dependency health status (1=healthy, 0=unhealthy)
# TYPE courtlistener_mcp_dependency_status gauge
${healthStatus.dependencies
  .map(
    (dep: DependencyStatus) =>
      `courtlistener_mcp_dependency_status{dependency="${dep.name}"} ${dep.status === 'healthy' ? 1 : 0} ${timestamp}`,
  )
  .join('\n')}
`.trim();
  }
}
