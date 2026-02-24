/**
 * Performance Monitoring Manager
 * Centralized monitoring system with alerting and health checks
 */

import { Logger } from '../logger.js';
import { MetricsCollector } from '../metrics.js';
import { AlertManager } from './alert-manager.js';
import { HealthCheckManager } from './health-check-manager.js';
import { ResourceMonitor } from './resource-monitor.js';
import { TraceCollector } from './trace-collector.js';
import {
  HealthCheckResult,
  MonitoringReport,
  PerformanceMonitorOptions,
  PerformanceMonitorStats,
  ResourceUsage,
  TraceAnalysis,
} from './types.js';

export class PerformanceMonitor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private alerts: AlertManager;
  private healthChecks: HealthCheckManager;
  private resourceMonitor: ResourceMonitor;
  private traceCollector: TraceCollector;
  private intervalId: NodeJS.Timeout | undefined;

  constructor(logger: Logger, metrics: MetricsCollector, options: PerformanceMonitorOptions = {}) {
    this.logger = logger.child('PerformanceMonitor');
    this.metrics = metrics;

    this.alerts = new AlertManager(this.logger, options.alerts);
    this.healthChecks = new HealthCheckManager(this.logger, options.healthChecks);
    this.resourceMonitor = new ResourceMonitor(this.logger, options.resources);
    this.traceCollector = new TraceCollector(this.logger, options.tracing);

    // Start monitoring
    this.startMonitoring(options.monitoringInterval || 30000);

    this.logger.info('Performance monitoring started', {
      monitoringInterval: options.monitoringInterval || 30000,
      alertsEnabled: !options.alerts?.disabled,
      healthChecksEnabled: !options.healthChecks?.disabled,
      resourceMonitoringEnabled: !options.resources?.disabled,
      tracingEnabled: !options.tracing?.disabled,
    });
  }

  /**
   * Start monitoring with regular health checks
   */
  private startMonitoring(interval: number): void {
    this.intervalId = setInterval(async () => {
      try {
        await this.performHealthCheck();
        await this.checkResourceUsage();
        await this.processTraces();
      } catch (error) {
        this.logger.error('Error during monitoring cycle', error as Error);
      }
    }, interval);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const result = await this.healthChecks.runAllChecks({
      metrics: this.metrics,
      resourceMonitor: this.resourceMonitor,
      traceCollector: this.traceCollector,
    });

    this.alerts.processHealthCheck(result);

    this.logger.debug('Health check completed', {
      status: result.status,
      checksRun: Object.keys(result.checks).length,
      failedChecks: Object.values(result.checks).filter((c) => c.status === 'fail').length,
    });

    return result;
  }

  /**
   * Check resource usage and alert if necessary
   */
  async checkResourceUsage(): Promise<ResourceUsage> {
    const usage = await this.resourceMonitor.getResourceUsage();

    this.alerts.processResourceUsage(usage);

    return usage;
  }

  /**
   * Process and analyze collected traces
   */
  async processTraces(): Promise<TraceAnalysis> {
    const analysis = await this.traceCollector.analyzeTraces();

    this.alerts.processTraceAnalysis(analysis);

    return analysis;
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport(): MonitoringReport {
    const healthResult = this.healthChecks.getLastResult();
    const resourcesResult = this.resourceMonitor.getLastUsage();
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics.getMetrics(),
      ...(healthResult !== undefined && { health: healthResult }),
      ...(resourcesResult !== undefined && { resources: resourcesResult }),
      traces: this.traceCollector.getAnalysis(),
      alerts: this.alerts.getActiveAlerts(),
      performance: this.metrics.getPerformanceSummary(),
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.logger.info('Performance monitoring stopped');
  }

  /**
   * Get monitoring statistics
   */
  getStats(): PerformanceMonitorStats {
    const lastUsage = this.resourceMonitor.getLastUsage();
    return {
      uptime: Math.floor((Date.now() - this.resourceMonitor.getStartTime()) / 1000),
      checksPerformed: this.healthChecks.getChecksPerformed(),
      alertsTriggered: this.alerts.getAlertsTriggered(),
      tracesCollected: this.traceCollector.getTracesCollected(),
      ...(lastUsage !== undefined && { resourceUsage: lastUsage }),
    };
  }
}
