/**
 * Centralized Error Reporting System
 * Provides error aggregation, analysis, and external reporting capabilities
 */

import { randomUUID } from 'node:crypto';
import { Logger } from './logger.js';
import { MetricsCollector } from './metrics.js';
import { BaseError, ErrorSeverity, ErrorCategory } from '../common/errors.js';

export interface ErrorReport {
  id: string;
  timestamp: string;
  error: BaseError;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  affectedEndpoints: string[];
  userImpact: {
    totalUsers: number;
    affectedUsers: number;
    impactPercentage: number;
  };
  resolution: {
    status: 'unresolved' | 'investigating' | 'resolved' | 'ignored';
    assignee?: string;
    notes?: string;
    resolvedAt?: string;
  };
}

export interface ErrorTrend {
  category: ErrorCategory;
  severity: ErrorSeverity;
  count: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
  timeWindow: string;
}

export interface ErrorReportingConfig {
  enableAggregation: boolean;
  enableExternalReporting: boolean;
  aggregationWindowMs: number;
  reportingThreshold: {
    criticalErrors: number;
    highErrors: number;
    mediumErrors: number;
  };
  externalEndpoints: {
    webhook?: string;
    slack?: string;
  };
  retentionDays: number;
}

/**
 * Centralized error reporting and analysis system
 */
export class ErrorReportingService {
  private logger: Logger;
  private metrics: MetricsCollector | undefined;
  private config: ErrorReportingConfig;
  private errorReports: Map<string, ErrorReport> = new Map();
  private errorTrends: Map<string, ErrorTrend> = new Map();
  private reportingInterval?: NodeJS.Timeout;

  constructor(
    logger: Logger,
    config: Partial<ErrorReportingConfig> = {},
    metrics?: MetricsCollector,
  ) {
    this.logger = logger;
    this.metrics = metrics;

    this.config = {
      enableAggregation: true,
      enableExternalReporting: false,
      aggregationWindowMs: 300000, // 5 minutes
      reportingThreshold: {
        criticalErrors: 1,
        highErrors: 5,
        mediumErrors: 20,
      },
      externalEndpoints: {},
      retentionDays: 30,
      ...config,
    };

    if (this.config.enableAggregation) {
      this.startAggregation();
    }
  }

  /**
   * Report an error to the centralized system
   */
  public reportError(error: BaseError): void {
    try {
      const errorKey = this.generateErrorKey(error);
      const now = new Date().toISOString();

      // Update or create error report
      let report = this.errorReports.get(errorKey);

      if (report) {
        // Update existing report
        report.frequency++;
        report.lastSeen = now;

        // Update affected endpoints
        if (error.context.endpoint && !report.affectedEndpoints.includes(error.context.endpoint)) {
          report.affectedEndpoints.push(error.context.endpoint);
        }

        // Update user impact
        if (error.context.userId) {
          // In a real system, this would track unique users
          report.userImpact.totalUsers = Math.max(report.userImpact.totalUsers, 1);
          report.userImpact.affectedUsers++;
          report.userImpact.impactPercentage =
            (report.userImpact.affectedUsers / report.userImpact.totalUsers) * 100;
        }
      } else {
        // Create new report
        report = {
          id: this.generateReportId(),
          timestamp: now,
          error: error,
          frequency: 1,
          firstSeen: now,
          lastSeen: now,
          affectedEndpoints: error.context.endpoint ? [error.context.endpoint] : [],
          userImpact: {
            totalUsers: 1,
            affectedUsers: error.context.userId ? 1 : 0,
            impactPercentage: error.context.userId ? 100 : 0,
          },
          resolution: {
            status: 'unresolved',
          },
        };
      }

      this.errorReports.set(errorKey, report);

      // Check if we need to send immediate alerts
      this.checkAlertThresholds(report);

      // Update trends
      this.updateErrorTrends(error);

      this.logger.debug(`Error reported to centralized system`, {
        errorKey,
        frequency: report.frequency,
        severity: error.severity,
      });
    } catch (reportingError) {
      this.logger.error(
        'Failed to report error to centralized system',
        reportingError instanceof Error ? reportingError : new Error(String(reportingError)),
      );
    }
  }

  /**
   * Get error reports with filtering and pagination
   */
  public getErrorReports(filters?: {
    severity?: ErrorSeverity;
    category?: ErrorCategory;
    status?: string;
    limit?: number;
    offset?: number;
  }): ErrorReport[] {
    let reports = Array.from(this.errorReports.values());

    // Apply filters
    if (filters?.severity) {
      reports = reports.filter((r) => r.error.severity === filters.severity);
    }

    if (filters?.category) {
      reports = reports.filter((r) => r.error.category === filters.category);
    }

    if (filters?.status) {
      reports = reports.filter((r) => r.resolution.status === filters.status);
    }

    // Sort by severity and frequency
    reports.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverity = severityOrder[a.error.severity] || 0;
      const bSeverity = severityOrder[b.error.severity] || 0;

      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity; // Higher severity first
      }

      return b.frequency - a.frequency; // Higher frequency first
    });

    // Apply pagination
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 100;
    return reports.slice(offset, offset + limit);
  }

  /**
   * Get error trends and analytics
   */
  public getErrorTrends(timeWindow = '1h'): ErrorTrend[] {
    return Array.from(this.errorTrends.values())
      .filter((trend) => trend.timeWindow === timeWindow)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Update error resolution status
   */
  public updateErrorResolution(
    errorKey: string,
    status: 'unresolved' | 'investigating' | 'resolved' | 'ignored',
    assignee?: string,
    notes?: string,
  ): boolean {
    const report = this.errorReports.get(errorKey);
    if (!report) {
      return false;
    }

    report.resolution.status = status;
    if (assignee !== undefined) report.resolution.assignee = assignee;
    if (notes !== undefined) report.resolution.notes = notes;

    if (status === 'resolved') {
      report.resolution.resolvedAt = new Date().toISOString();
    }

    this.logger.info(`Error resolution updated`, {
      errorKey,
      status,
      assignee,
    });

    return true;
  }

  /**
   * Export error reports
   */
  public exportReports(format: 'json' | 'csv' = 'json'): string {
    const reports = this.getErrorReports();

    if (format === 'csv') {
      const headers = [
        'ID',
        'Timestamp',
        'Error Message',
        'Category',
        'Severity',
        'Frequency',
        'First Seen',
        'Last Seen',
        'Affected Endpoints',
        'Status',
        'Assignee',
      ];

      const rows = reports.map((report) => [
        report.id,
        report.timestamp,
        report.error.message,
        report.error.category,
        report.error.severity,
        report.frequency.toString(),
        report.firstSeen,
        report.lastSeen,
        report.affectedEndpoints.join(';'),
        report.resolution.status,
        report.resolution.assignee || '',
      ]);

      return [headers, ...rows].map((row) => row.join(',')).join('\n');
    }

    return JSON.stringify(reports, null, 2);
  }

  /**
   * Generate unique error key for aggregation
   */
  private generateErrorKey(error: BaseError): string {
    // Group similar errors together
    const components = [
      error.category,
      error.severity,
      this.normalizeErrorMessage(error.message),
      error.context.endpoint || 'unknown',
    ];

    return components.join('::');
  }

  /**
   * Normalize error message for grouping
   */
  private normalizeErrorMessage(message: string): string {
    // Remove dynamic parts like timestamps, IDs, etc.
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
      .replace(/\b\d+\b/g, 'NUMBER')
      .replace(/\b[A-Za-z0-9+/]{20,}\b/g, 'TOKEN')
      .toLowerCase()
      .trim();
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `error_${Date.now()}_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
  }

  /**
   * Check if alert thresholds are exceeded
   */
  private checkAlertThresholds(report: ErrorReport): void {
    const threshold = this.getThresholdForSeverity(report.error.severity);

    if (report.frequency >= threshold) {
      this.sendAlert(report);
    }
  }

  /**
   * Get alert threshold for severity level
   */
  private getThresholdForSeverity(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return this.config.reportingThreshold.criticalErrors;
      case ErrorSeverity.HIGH:
        return this.config.reportingThreshold.highErrors;
      case ErrorSeverity.MEDIUM:
        return this.config.reportingThreshold.mediumErrors;
      case ErrorSeverity.LOW:
        return 50; // Higher threshold for low severity
      default:
        return 10;
    }
  }

  /**
   * Send alert for error report
   */
  private sendAlert(report: ErrorReport): void {
    if (!this.config.enableExternalReporting) {
      return;
    }

    const alertData = {
      id: report.id,
      message: `Error threshold exceeded: ${report.error.message}`,
      severity: report.error.severity,
      frequency: report.frequency,
      endpoints: report.affectedEndpoints,
      userImpact: report.userImpact,
    };

    try {
      // Send to configured endpoints
      if (this.config.externalEndpoints.webhook) {
        this.logger.debug('Webhook alert would be sent', {
          webhook: this.config.externalEndpoints.webhook,
          alertData,
        });
      }

      if (this.config.externalEndpoints.slack) {
        this.logger.debug('Slack alert would be sent', {
          slackWebhook: this.config.externalEndpoints.slack,
          alertData,
        });
      }

      this.logger.info(`Alert sent for error report`, {
        reportId: report.id,
        severity: report.error.severity,
        frequency: report.frequency,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send error alert',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Update error trends
   */
  private updateErrorTrends(error: BaseError): void {
    const trendKey = `${error.category}_${error.severity}_1h`;

    let trend = this.errorTrends.get(trendKey);
    if (!trend) {
      trend = {
        category: error.category,
        severity: error.severity,
        count: 0,
        trend: 'stable',
        changePercentage: 0,
        timeWindow: '1h',
      };
    }

    trend.count++;
    this.errorTrends.set(trendKey, trend);
  }

  /**
   * Start aggregation process
   */
  private startAggregation(): void {
    this.reportingInterval = setInterval(() => {
      this.performAggregation();
    }, this.config.aggregationWindowMs);
  }

  /**
   * Perform periodic aggregation and cleanup
   */
  private performAggregation(): void {
    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    let removedCount = 0;

    // Clean up old reports
    for (const [key, report] of this.errorReports.entries()) {
      if (new Date(report.timestamp) < cutoffDate) {
        this.errorReports.delete(key);
        removedCount++;
      }
    }

    // Calculate trends
    this.calculateTrends();

    this.logger.debug('Error aggregation completed', {
      totalReports: this.errorReports.size,
      removedReports: removedCount,
      trends: this.errorTrends.size,
    });
  }

  /**
   * Calculate error trends
   */
  private calculateTrends(): void {
    // Implementation would analyze historical data to determine trends
    // For now, we'll just update the trend status based on recent activity
    for (const trend of this.errorTrends.values()) {
      // Simple trend calculation - in production, this would be more sophisticated
      if (trend.count > 10) {
        trend.trend = 'increasing';
        trend.changePercentage = 25;
      } else if (trend.count < 3) {
        trend.trend = 'decreasing';
        trend.changePercentage = -15;
      } else {
        trend.trend = 'stable';
        trend.changePercentage = 0;
      }
    }
  }

  /**
   * Cleanup resources
   */
  public shutdown(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
    }
  }
}
