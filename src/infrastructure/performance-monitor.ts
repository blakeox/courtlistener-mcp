/**
 * Advanced Performance Monitoring System
 * Comprehensive monitoring, alerting, and performance tracking
 */

import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';

/**
 * Performance Monitoring Manager
 * Centralized monitoring system with alerting and health checks
 */
export class PerformanceMonitor {
  private logger: Logger;
  private metrics: MetricsCollector;
  private alerts: AlertManager;
  private healthChecks: HealthCheckManager;
  private resourceMonitor: ResourceMonitor;
  private traceCollector: TraceCollector;
  private intervalId?: NodeJS.Timeout;

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

    // Check for alerts
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

    // Check for resource alerts
    this.alerts.processResourceUsage(usage);

    return usage;
  }

  /**
   * Process and analyze collected traces
   */
  async processTraces(): Promise<TraceAnalysis> {
    const analysis = await this.traceCollector.analyzeTraces();

    // Check for performance alerts
    this.alerts.processTraceAnalysis(analysis);

    return analysis;
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport(): MonitoringReport {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics.getMetrics(),
      health: this.healthChecks.getLastResult(),
      resources: this.resourceMonitor.getLastUsage(),
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
    return {
      uptime: Math.floor((Date.now() - this.resourceMonitor.getStartTime()) / 1000),
      checksPerformed: this.healthChecks.getChecksPerformed(),
      alertsTriggered: this.alerts.getAlertsTriggered(),
      tracesCollected: this.traceCollector.getTracesCollected(),
      resourceUsage: this.resourceMonitor.getLastUsage(),
    };
  }
}

/**
 * Alert Management System
 */
export class AlertManager {
  private logger: Logger;
  private options: AlertOptions;
  private activeAlerts = new Map<string, Alert>();
  private alertHistory: Alert[] = [];
  private alertsTriggered = 0;

  constructor(logger: Logger, options: AlertOptions = {}) {
    this.logger = logger.child('AlertManager');
    this.options = {
      disabled: options.disabled || false,
      maxActiveAlerts: options.maxActiveAlerts || 100,
      alertHistory: options.alertHistory || 1000,
      thresholds: {
        responseTime: 5000,
        errorRate: 0.25,
        memoryUsage: 0.85,
        cpuUsage: 0.9,
        ...options.thresholds,
      },
    };
  }

  processHealthCheck(result: HealthCheckResult): void {
    if (this.options.disabled) return;

    // Check for failed health checks
    Object.entries(result.checks).forEach(([checkName, check]) => {
      if (check.status === 'fail') {
        this.triggerAlert({
          id: `health_${checkName}`,
          type: 'health_check',
          severity: result.status === 'critical' ? 'critical' : 'warning',
          message: check.message,
          timestamp: new Date().toISOString(),
          data: { checkName, ...check },
        });
      } else {
        // Clear alert if it exists
        this.clearAlert(`health_${checkName}`);
      }
    });
  }

  processResourceUsage(usage: ResourceUsage): void {
    if (this.options.disabled) return;

    // Memory usage alert
    if (usage.memory.usagePercent > this.options.thresholds!.memoryUsage!) {
      this.triggerAlert({
        id: 'resource_memory',
        type: 'resource',
        severity: usage.memory.usagePercent > 0.95 ? 'critical' : 'warning',
        message: `High memory usage: ${(usage.memory.usagePercent * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        data: { memoryUsage: usage.memory },
      });
    } else {
      this.clearAlert('resource_memory');
    }

    // CPU usage alert
    if (usage.cpu.usagePercent > this.options.thresholds!.cpuUsage!) {
      this.triggerAlert({
        id: 'resource_cpu',
        type: 'resource',
        severity: usage.cpu.usagePercent > 0.95 ? 'critical' : 'warning',
        message: `High CPU usage: ${(usage.cpu.usagePercent * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        data: { cpuUsage: usage.cpu },
      });
    } else {
      this.clearAlert('resource_cpu');
    }
  }

  processTraceAnalysis(analysis: TraceAnalysis): void {
    if (this.options.disabled) return;

    // Response time alert
    if (analysis.averageResponseTime > this.options.thresholds!.responseTime!) {
      this.triggerAlert({
        id: 'performance_response_time',
        type: 'performance',
        severity:
          analysis.averageResponseTime > this.options.thresholds!.responseTime! * 2
            ? 'critical'
            : 'warning',
        message: `High response time: ${analysis.averageResponseTime.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
        data: { responseTime: analysis.averageResponseTime },
      });
    } else {
      this.clearAlert('performance_response_time');
    }

    // Error rate alert
    if (analysis.errorRate > this.options.thresholds!.errorRate!) {
      this.triggerAlert({
        id: 'performance_error_rate',
        type: 'performance',
        severity:
          analysis.errorRate > this.options.thresholds!.errorRate! * 2 ? 'critical' : 'warning',
        message: `High error rate: ${(analysis.errorRate * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        data: { errorRate: analysis.errorRate },
      });
    } else {
      this.clearAlert('performance_error_rate');
    }
  }

  private triggerAlert(alert: Alert): void {
    if (this.activeAlerts.has(alert.id)) {
      // Update existing alert
      const existing = this.activeAlerts.get(alert.id)!;
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = alert.timestamp;
    } else {
      // New alert
      alert.count = 1;
      alert.lastSeen = alert.timestamp;
      this.activeAlerts.set(alert.id, alert);
      this.alertsTriggered++;

      this.logger.warn('Alert triggered', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      });
    }

    // Add to history
    this.alertHistory.push({ ...alert });

    // Trim history
    if (this.alertHistory.length > this.options.alertHistory!) {
      this.alertHistory = this.alertHistory.slice(-this.options.alertHistory!);
    }
  }

  private clearAlert(alertId: string): void {
    if (this.activeAlerts.has(alertId)) {
      const alert = this.activeAlerts.get(alertId)!;
      this.activeAlerts.delete(alertId);

      this.logger.info('Alert cleared', {
        alertId,
        type: alert.type,
        duration: Date.now() - new Date(alert.timestamp).getTime(),
      });
    }
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertsTriggered(): number {
    return this.alertsTriggered;
  }

  getAlertHistory(): Alert[] {
    return [...this.alertHistory];
  }
}

/**
 * Health Check Manager
 */
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
      // Metrics health check
      const metricsHealth = this.checkMetrics(context.metrics);
      checks.metrics = metricsHealth;

      // Resource health check
      const resourceHealth = await this.checkResources(context.resourceMonitor);
      checks.resources = resourceHealth;

      // Performance health check
      const performanceHealth = this.checkPerformance(context.traceCollector);
      checks.performance = performanceHealth;

      // Determine overall status
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

  private async checkResources(resourceMonitor: ResourceMonitor): Promise<HealthCheck> {
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

  private checkPerformance(traceCollector: TraceCollector): HealthCheck {
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

/**
 * Resource Monitor
 */
export class ResourceMonitor {
  private logger: Logger;
  private options: ResourceOptions;
  private startTime: number;
  private lastUsage?: ResourceUsage;

  constructor(logger: Logger, options: ResourceOptions = {}) {
    this.logger = logger.child('ResourceMonitor');
    this.options = {
      disabled: options.disabled || false,
      sampleInterval: options.sampleInterval || 5000,
    };
    this.startTime = Date.now();
  }

  async getResourceUsage(): Promise<ResourceUsage> {
    if (this.options.disabled) {
      return {
        timestamp: new Date().toISOString(),
        memory: { used: 0, total: 0, usagePercent: 0 },
        cpu: { usagePercent: 0 },
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      };
    }

    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      const usedMemory = totalMemory - freeMemory;

      // Simple CPU usage estimation (this is basic - for production use a proper CPU monitoring library)
      const cpuUsage = process.cpuUsage();
      const cpuPercent = 0; // Placeholder - would need historical data for accurate calculation

      this.lastUsage = {
        timestamp: new Date().toISOString(),
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          usagePercent: memoryUsage.heapUsed / memoryUsage.heapTotal,
        },
        cpu: {
          usagePercent: cpuPercent,
        },
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      };

      return this.lastUsage;
    } catch (error) {
      this.logger.error('Failed to get resource usage', error as Error);
      throw error;
    }
  }

  getLastUsage(): ResourceUsage | undefined {
    return this.lastUsage;
  }

  getStartTime(): number {
    return this.startTime;
  }
}

/**
 * Trace Collector
 */
export class TraceCollector {
  private logger: Logger;
  private options: TracingOptions;
  private traces: Trace[] = [];
  private tracesCollected = 0;

  constructor(logger: Logger, options: TracingOptions = {}) {
    this.logger = logger.child('TraceCollector');
    this.options = {
      disabled: options.disabled || false,
      maxTraces: options.maxTraces || 1000,
      retentionTime: options.retentionTime || 3600000, // 1 hour
    };
  }

  collectTrace(trace: Trace): void {
    if (this.options.disabled) return;

    this.traces.push(trace);
    this.tracesCollected++;

    // Trim old traces
    const cutoff = Date.now() - this.options.retentionTime!;
    this.traces = this.traces.filter((t) => new Date(t.timestamp).getTime() > cutoff);

    // Limit number of traces
    if (this.traces.length > this.options.maxTraces!) {
      this.traces = this.traces.slice(-this.options.maxTraces!);
    }
  }

  analyzeTraces(): TraceAnalysis {
    if (this.traces.length === 0) {
      return {
        totalTraces: 0,
        averageResponseTime: 0,
        errorRate: 0,
        operationBreakdown: {},
        slowestOperations: [],
        recentErrors: [],
      };
    }

    const totalTraces = this.traces.length;
    const averageResponseTime =
      this.traces.reduce((sum, trace) => sum + trace.duration, 0) / totalTraces;
    const errors = this.traces.filter((trace) => trace.error);
    const errorRate = errors.length / totalTraces;

    // Operation breakdown
    const operationBreakdown: Record<string, { count: number; avgDuration: number }> = {};
    this.traces.forEach((trace) => {
      if (!operationBreakdown[trace.operation]) {
        operationBreakdown[trace.operation] = { count: 0, avgDuration: 0 };
      }
      const op = operationBreakdown[trace.operation];
      op.count++;
      op.avgDuration = (op.avgDuration * (op.count - 1) + trace.duration) / op.count;
    });

    // Slowest operations
    const slowestOperations = this.traces
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map((trace) => ({
        operation: trace.operation,
        duration: trace.duration,
        timestamp: trace.timestamp,
      }));

    // Recent errors
    const recentErrors = errors
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
      .map((trace) => ({
        operation: trace.operation,
        error: trace.error!,
        timestamp: trace.timestamp,
      }));

    return {
      totalTraces,
      averageResponseTime,
      errorRate,
      operationBreakdown,
      slowestOperations,
      recentErrors,
    };
  }

  getAnalysis(): TraceAnalysis {
    return this.analyzeTraces();
  }

  getTracesCollected(): number {
    return this.tracesCollected;
  }
}

// Type definitions
export interface PerformanceMonitorOptions {
  monitoringInterval?: number;
  alerts?: AlertOptions;
  healthChecks?: HealthCheckOptions;
  resources?: ResourceOptions;
  tracing?: TracingOptions;
}

export interface AlertOptions {
  disabled?: boolean;
  maxActiveAlerts?: number;
  alertHistory?: number;
  thresholds?: {
    responseTime?: number;
    errorRate?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

export interface HealthCheckOptions {
  disabled?: boolean;
  timeout?: number;
}

export interface ResourceOptions {
  disabled?: boolean;
  sampleInterval?: number;
}

export interface TracingOptions {
  disabled?: boolean;
  maxTraces?: number;
  retentionTime?: number;
}

export interface Alert {
  id: string;
  type: 'health_check' | 'resource' | 'performance';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  data?: unknown;
  count?: number;
  lastSeen?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'critical';
  checks: Record<string, HealthCheck>;
  timestamp: string;
}

export interface HealthCheck {
  status: 'pass' | 'fail';
  message: string;
  timestamp: string;
  data?: unknown;
}

export interface HealthCheckContext {
  metrics: MetricsCollector;
  resourceMonitor: ResourceMonitor;
  traceCollector: TraceCollector;
}

export interface ResourceUsage {
  timestamp: string;
  memory: {
    used: number;
    total: number;
    usagePercent: number;
  };
  cpu: {
    usagePercent: number;
  };
  uptime: number;
}

export interface Trace {
  id: string;
  operation: string;
  timestamp: string;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceAnalysis {
  totalTraces: number;
  averageResponseTime: number;
  errorRate: number;
  operationBreakdown: Record<string, { count: number; avgDuration: number }>;
  slowestOperations: Array<{ operation: string; duration: number; timestamp: string }>;
  recentErrors: Array<{ operation: string; error: string; timestamp: string }>;
}

export interface MonitoringReport {
  timestamp: string;
  metrics: unknown;
  health?: HealthCheckResult;
  resources?: ResourceUsage;
  traces: TraceAnalysis;
  alerts: Alert[];
  performance: unknown;
}

export interface PerformanceMonitorStats {
  uptime: number;
  checksPerformed: number;
  alertsTriggered: number;
  tracesCollected: number;
  resourceUsage?: ResourceUsage;
}
