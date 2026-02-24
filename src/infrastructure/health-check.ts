/**
 * Comprehensive Health Check System
 * Production-ready health monitoring with dependency checks
 */

import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';
import { CacheManager } from './cache.js';
import { CourtListenerAPI } from '../courtlistener.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  dependencies: DependencyStatus[];
  metrics: HealthMetrics;
}

export interface DependencyStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: string;
}

export interface HealthMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
}

export class HealthCheckManager {
  private startTime: number;
  private checkInterval: NodeJS.Timeout | null = null;
  private dependencyStatuses: Map<string, DependencyStatus> = new Map();

  constructor(
    private logger: Logger,
    private metrics: MetricsCollector,
    private cache: CacheManager,
    private apiClient: CourtListenerAPI,
  ) {
    this.startTime = Date.now();
    this.startPeriodicChecks();
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Check all dependencies
    const dependencies = await this.checkAllDependencies();

    // Determine overall status
    const overallStatus = this.determineOverallStatus(dependencies);

    // Get current metrics
    const healthMetrics = await this.getHealthMetrics();

    return {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '0.1.0',
      dependencies,
      metrics: healthMetrics,
    };
  }

  /**
   * Check specific dependency health
   */
  async checkDependency(name: string): Promise<DependencyStatus> {
    const startTime = Date.now();
    let status: DependencyStatus;

    try {
      switch (name) {
        case 'courtlistener-api':
          await this.checkCourtListenerAPI();
          status = {
            name,
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString(),
          };
          break;

        case 'cache':
          await this.checkCache();
          status = {
            name,
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString(),
          };
          break;

        case 'memory':
          this.checkMemoryUsage();
          status = {
            name,
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastChecked: new Date().toISOString(),
          };
          break;

        default:
          throw new Error(`Unknown dependency: ${name}`);
      }
    } catch (error) {
      status = {
        name,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: (error as Error).message,
        lastChecked: new Date().toISOString(),
      };
    }

    this.dependencyStatuses.set(name, status);
    return status;
  }

  /**
   * Get readiness status (for Kubernetes readiness probes)
   */
  async getReadinessStatus(): Promise<{ ready: boolean; reason?: string }> {
    try {
      // Check critical dependencies only
      await this.checkCache();
      await this.checkCourtListenerAPI();

      return { ready: true };
    } catch (error) {
      return {
        ready: false,
        reason: `Dependency check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Get liveness status (for Kubernetes liveness probes)
   */
  getLivenessStatus(): { alive: boolean; reason?: string } {
    try {
      // Basic health checks
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Check if memory usage is critical (>90%)
      if (heapUsedPercent > 90) {
        return {
          alive: false,
          reason: `Critical memory usage: ${heapUsedPercent.toFixed(1)}%`,
        };
      }

      return { alive: true };
    } catch (error) {
      return {
        alive: false,
        reason: `Liveness check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicChecks(): void {
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAllDependencies();
      } catch (error) {
        this.logger.error('Periodic health check failed', error as Error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkAllDependencies(): Promise<DependencyStatus[]> {
    const dependencies = ['courtlistener-api', 'cache', 'memory'];
    const results = await Promise.allSettled(dependencies.map((dep) => this.checkDependency(dep)));

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          name: dependencies[index] ?? 'unknown',
          status: 'unhealthy' as const,
          error: result.reason?.message || 'Unknown error',
          lastChecked: new Date().toISOString(),
        };
      }
    });
  }

  private determineOverallStatus(
    dependencies: DependencyStatus[],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const unhealthyCount = dependencies.filter((dep) => dep.status === 'unhealthy').length;
    const degradedCount = dependencies.filter((dep) => dep.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  private async checkCourtListenerAPI(): Promise<void> {
    // Test with a lightweight endpoint - use courts list
    try {
      await this.apiClient.listCourts({ page_size: 1 });
    } catch (error) {
      // If it's just an auth error, the API is still reachable
      if ((error as Error).message.includes('401')) {
        return; // API is healthy, just requires auth
      }
      throw error;
    }
  }

  private async checkCache(): Promise<void> {
    const testKey = '_health_check_';
    const testValue = Date.now().toString();

    // Test cache write and read
    this.cache.set(testKey, {}, testValue, 10); // 10 second TTL
    const retrieved = this.cache.get<string>(testKey);

    if (retrieved !== testValue) {
      throw new Error('Cache read/write test failed');
    }
  }

  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapUsedPercent > 85) {
      throw new Error(`High memory usage: ${heapUsedPercent.toFixed(1)}%`);
    }
  }

  private async getHealthMetrics(): Promise<HealthMetrics> {
    const memoryUsage = process.memoryUsage();

    // Get CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

    const currentMetrics = this.metrics.getMetrics();

    return {
      memoryUsage,
      cpuUsage: cpuPercent,
      requestCount: currentMetrics.requests_total,
      errorRate:
        currentMetrics.requests_total > 0
          ? currentMetrics.requests_failed / currentMetrics.requests_total
          : 0,
      averageResponseTime: currentMetrics.average_response_time,
    };
  }
}
