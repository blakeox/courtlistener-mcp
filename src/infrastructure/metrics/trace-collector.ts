/**
 * Trace Collector
 */

import { Logger } from '../logger.js';
import { Trace, TraceAnalysis, TracingOptions } from './types.js';

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
    const retentionTime = this.options.retentionTime ?? 3600000;
    const cutoff = Date.now() - retentionTime;
    this.traces = this.traces.filter((t) => new Date(t.timestamp).getTime() > cutoff);

    // Limit number of traces
    const maxTraces = this.options.maxTraces ?? 1000;
    if (this.traces.length > maxTraces) {
      this.traces = this.traces.slice(-maxTraces);
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
      if (!op) return;
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
        error: trace.error ?? 'Unknown error',
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
