/**
 * Health Check Manager
 */

import { Logger } from '../logger.js';
import { MetricsCollector } from '../metrics.js';
import { HealthCheck, HealthCheckContext, HealthCheckOptions, HealthCheckResult } from './types.js';

export class HealthCheckManager {
  private logger: Logger;
  private options: HealthCheckOptions;
  private lastResult?: HealthCheckResult;
  private checksPerformed = 0;

  constructor(logger: Logger, options: HealthCheckOptions = {}) {
    this.logger = logger.child('HealthCheckManager');
    this.options = {
      disabled: options.disabled || false,
      timeout: options.timeout || 5000,
    };
  }

  async runAllChecks(context: HealthCheckContext): Promise<HealthCheckResult> {
    if (this.options.disabled) {
      return {
        status: 'healthy',
        checks: {},
        timestamp: new Date().toISOString(),
      };
    }

    this.checksPerformed++;
    const checks: Record<string, HealthCheck> = {};

    try {
      const metricsHealth = this.checkMetrics(context.metrics);
      checks.metrics = metricsHealth;

      const resourceHealth = await this.checkResources(context.resourceMonitor);
      checks.resources = resourceHealth;

      const performanceHealth = this.checkPerformance(context.traceCollector);
      checks.performance = performanceHealth;

      const failedChecks = Object.values(checks).filter((check) => check.status === 'fail');
      const status =
        failedChecks.length === 0 ? 'healthy' : failedChecks.length <= 1 ? 'warning' : 'critical';

      this.lastResult = {
        status,
        checks,
        timestamp: new Date().toISOString(),
      };

      return this.lastResult;
    } catch (error) {
      this.logger.error('Health check failed', error as Error);

      this.lastResult = {
        status: 'critical',
        checks: {
          system: {
            status: 'fail',
            message: `Health check system error: ${(error as Error).message}`,
            timestamp: new Date().toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      };

      return this.lastResult;
    }
  }

  private checkMetrics(metrics: MetricsCollector): HealthCheck {
    const metricsData = metrics.getMetrics();
    const performanceSummary = metrics.getPerformanceSummary();

    return {
      status: performanceSummary.performanceGrade >= 'C' ? 'pass' : 'fail',
      message: `Performance grade: ${performanceSummary.performanceGrade}`,
      timestamp: new Date().toISOString(),
      data: {
        grade: performanceSummary.performanceGrade,
        successRate: performanceSummary.successRate,
        responseTime: metricsData.average_response_time,
      },
    };
  }

  private async checkResources(
    resourceMonitor: HealthCheckContext['resourceMonitor'],
  ): Promise<HealthCheck> {
    try {
      const usage = await resourceMonitor.getResourceUsage();
      const memoryOk = usage.memory.usagePercent < 0.9;
      const cpuOk = usage.cpu.usagePercent < 0.9;

      return {
        status: memoryOk && cpuOk ? 'pass' : 'fail',
        message: `Memory: ${(usage.memory.usagePercent * 100).toFixed(1)}%, CPU: ${(usage.cpu.usagePercent * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        data: usage,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Resource check failed: ${(error as Error).message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private checkPerformance(traceCollector: HealthCheckContext['traceCollector']): HealthCheck {
    const analysis = traceCollector.getAnalysis();
    const responseTimeOk = analysis.averageResponseTime < 3000;
    const errorRateOk = analysis.errorRate < 0.1;

    return {
      status: responseTimeOk && errorRateOk ? 'pass' : 'fail',
      message: `Avg response: ${analysis.averageResponseTime.toFixed(0)}ms, Error rate: ${(analysis.errorRate * 100).toFixed(1)}%`,
      timestamp: new Date().toISOString(),
      data: analysis,
    };
  }

  getLastResult(): HealthCheckResult | undefined {
    return this.lastResult;
  }

  getChecksPerformed(): number {
    return this.checksPerformed;
  }
}
