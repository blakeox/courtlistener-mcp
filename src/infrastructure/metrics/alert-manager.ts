/**
 * Alert Management System
 */

import { Logger } from '../logger.js';
import { Alert, AlertOptions, HealthCheckResult, ResourceUsage, TraceAnalysis } from './types.js';

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
        this.clearAlert(`health_${checkName}`);
      }
    });
  }

  processResourceUsage(usage: ResourceUsage): void {
    if (this.options.disabled) return;

    const memoryThreshold = this.options.thresholds?.memoryUsage ?? 0.9;
    if (usage.memory.usagePercent > memoryThreshold) {
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

    const cpuThreshold = this.options.thresholds?.cpuUsage ?? 0.9;
    if (usage.cpu.usagePercent > cpuThreshold) {
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

    const responseTimeThreshold = this.options.thresholds?.responseTime ?? 5000;
    if (analysis.averageResponseTime > responseTimeThreshold) {
      this.triggerAlert({
        id: 'performance_response_time',
        type: 'performance',
        severity: analysis.averageResponseTime > responseTimeThreshold * 2 ? 'critical' : 'warning',
        message: `High response time: ${analysis.averageResponseTime.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
        data: { responseTime: analysis.averageResponseTime },
      });
    } else {
      this.clearAlert('performance_response_time');
    }

    const errorRateThreshold = this.options.thresholds?.errorRate ?? 0.05;
    if (analysis.errorRate > errorRateThreshold) {
      this.triggerAlert({
        id: 'performance_error_rate',
        type: 'performance',
        severity: analysis.errorRate > errorRateThreshold * 2 ? 'critical' : 'warning',
        message: `High error rate: ${(analysis.errorRate * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        data: { errorRate: analysis.errorRate },
      });
    } else {
      this.clearAlert('performance_error_rate');
    }
  }

  private triggerAlert(alert: Alert): void {
    const existing = this.activeAlerts.get(alert.id);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = alert.timestamp;
    } else {
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

    this.alertHistory.push({ ...alert });

    const maxHistory = this.options.alertHistory ?? 100;
    if (this.alertHistory.length > maxHistory) {
      this.alertHistory = this.alertHistory.slice(-maxHistory);
    }
  }

  private clearAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
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
