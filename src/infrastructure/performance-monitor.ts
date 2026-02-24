/**
 * Advanced Performance Monitoring System
 * Backward-compat re-export — implementation moved to metrics/ subfolder.
 */
export {
  PerformanceMonitor,
  AlertManager,
  HealthCheckManager,
  ResourceMonitor,
  TraceCollector,
} from './metrics/index.js';

export type {
  PerformanceMonitorOptions,
  AlertOptions,
  HealthCheckOptions,
  ResourceOptions,
  TracingOptions,
  Alert,
  HealthCheckResult,
  HealthCheck,
  HealthCheckContext,
  ResourceUsage,
  Trace,
  TraceAnalysis,
  MonitoringReport,
  PerformanceMonitorStats,
} from './metrics/index.js';
