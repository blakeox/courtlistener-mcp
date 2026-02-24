/**
 * Metrics module barrel re-export
 */
export { PerformanceMonitor } from './performance-monitor.js';
export { AlertManager } from './alert-manager.js';
export { HealthCheckManager } from './health-check-manager.js';
export { ResourceMonitor } from './resource-monitor.js';
export { TraceCollector } from './trace-collector.js';
export type {
  Alert,
  AlertOptions,
  HealthCheck,
  HealthCheckContext,
  HealthCheckOptions,
  HealthCheckResult,
  MonitoringReport,
  PerformanceMonitorOptions,
  PerformanceMonitorStats,
  ResourceOptions,
  ResourceUsage,
  Trace,
  TraceAnalysis,
  TracingOptions,
} from './types.js';
