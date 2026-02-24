/**
 * Shared type definitions for the performance monitoring system
 */

import { MetricsCollector } from '../metrics.js';

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
  resourceMonitor: {
    getResourceUsage(): Promise<ResourceUsage>;
    getLastUsage(): ResourceUsage | undefined;
    getStartTime(): number;
  };
  traceCollector: {
    getAnalysis(): TraceAnalysis;
    getTracesCollected(): number;
    analyzeTraces(): TraceAnalysis;
  };
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
