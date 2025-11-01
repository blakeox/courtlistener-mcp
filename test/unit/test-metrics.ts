#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Metrics Collector (TypeScript)
 * Tests metric recording, calculations, and performance tracking
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../../src/infrastructure/logger.js';

class MockLogger implements Logger {
  public readonly logs: Array<{
    level: string;
    msg: string;
    meta?: unknown;
  }> = [];

  info(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', msg, meta });
  }

  error(msg: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logs.push({
      level: 'error',
      msg,
      meta: { ...meta, error: error?.message },
    });
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', msg, meta });
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', msg, meta });
  }

  toolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({
      level: success ? 'info' : 'error',
      msg: `Tool: ${toolName}`,
      meta: { duration, success, ...metadata },
    });
  }

  apiCall(
    method: string,
    endpoint: string,
    duration: number,
    status: number,
    metadata?: Record<string, unknown>
  ): void {
    this.logs.push({
      level: 'info',
      msg: `API ${method} ${endpoint}`,
      meta: { duration, status, ...metadata },
    });
  }

  child(component: string): Logger {
    return this;
  }

  startTimer(operation: string) {
    return {
      end(): number {
        return 0;
      },
      endWithError(): number {
        return 0;
      },
    };
  }
}

// Import the actual MetricsCollector
const { MetricsCollector } = await import(
  '../../dist/infrastructure/metrics.js'
);

describe('Metrics Collector (TypeScript)', () => {
  let metrics: MetricsCollector;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
    metrics = new MetricsCollector(mockLogger);
  });

  describe('Initialization', () => {
    it('should initialize with zero metrics', () => {
      const initialMetrics = metrics.getMetrics();

      assert.strictEqual(initialMetrics.requests_total, 0);
      assert.strictEqual(initialMetrics.requests_successful, 0);
      assert.strictEqual(initialMetrics.requests_failed, 0);
      assert.strictEqual(initialMetrics.cache_hits, 0);
      assert.strictEqual(initialMetrics.cache_misses, 0);
      assert.strictEqual(initialMetrics.average_response_time, 0);
      assert.strictEqual(typeof initialMetrics.uptime_seconds, 'number');
    });

    it('should start uptime tracking', () => {
      const initialMetrics = metrics.getMetrics();
      assert.ok(initialMetrics.uptime_seconds >= 0);
    });
  });

  describe('Request Recording', () => {
    it('should record successful requests', () => {
      metrics.recordRequest(100, false);
      metrics.recordRequest(200, false);

      const metricsData = metrics.getMetrics();

      assert.strictEqual(metricsData.requests_total, 2);
      assert.strictEqual(metricsData.requests_successful, 2);
      assert.strictEqual(metricsData.requests_failed, 0);
      assert.ok(metricsData.average_response_time > 0);
    });

    it('should record failed requests', () => {
      metrics.recordFailure(150);
      metrics.recordFailure(250);

      const metricsData = metrics.getMetrics();

      // recordFailure increments both requests_total and requests_failed
      assert.strictEqual(metricsData.requests_total, 2);
      assert.strictEqual(metricsData.requests_successful, 0);
      assert.strictEqual(metricsData.requests_failed, 2);
    });

    it('should calculate average response time', () => {
      metrics.recordRequest(100, false);
      metrics.recordRequest(200, false);
      metrics.recordRequest(300, false);

      const metricsData = metrics.getMetrics();
      const expectedAverage = (100 + 200 + 300) / 3;

      assert.ok(
        Math.abs(metricsData.average_response_time - expectedAverage) < 1,
        `Expected average ~${expectedAverage}, got ${metricsData.average_response_time}`
      );
    });
  });

  describe('Cache Metrics', () => {
    it('should record cache hits', () => {
      metrics.recordRequest(50, true); // Cached
      metrics.recordRequest(100, false); // Not cached

      const metricsData = metrics.getMetrics();

      assert.strictEqual(metricsData.cache_hits, 1);
      assert.strictEqual(metricsData.cache_misses, 1);
    });

    it('should record cache misses', () => {
      metrics.recordRequest(100, false);
      metrics.recordRequest(200, false);

      const metricsData = metrics.getMetrics();

      assert.strictEqual(metricsData.cache_hits, 0);
      assert.strictEqual(metricsData.cache_misses, 2);
    });
  });

  describe('Performance Summary', () => {
    it('should provide performance summary', () => {
      metrics.recordRequest(100, false);
      metrics.recordRequest(200, false);
      metrics.recordFailure(150);

      const summary = metrics.getPerformanceSummary();

      assert.ok(typeof summary === 'object');
      assert.ok(typeof summary.requestRate === 'number');
      assert.ok(typeof summary.successRate === 'number');
      assert.ok(typeof summary.cacheEffectiveness === 'number');
      assert.ok(['A', 'B', 'C', 'D', 'F'].includes(summary.performanceGrade));
    });

    it('should calculate success rate correctly', () => {
      metrics.recordRequest(100, false); // Success
      metrics.recordRequest(200, false); // Success
      metrics.recordFailure(150); // Failure

      const summary = metrics.getPerformanceSummary();

      // 2 successes out of 3 total (2 successful requests + 1 failure)
      const expectedRate = 2 / 3;
      assert.ok(
        Math.abs(summary.successRate - expectedRate) < 0.01,
        `Expected success rate ~${expectedRate}, got ${summary.successRate}`
      );
    });
  });

  describe('Metrics Reset', () => {
    it('should reset all metrics to initial state', () => {
      // Record some data
      metrics.recordRequest(100, false);
      metrics.recordFailure(200);
      metrics.recordCacheHit();

      // Reset metrics
      metrics.reset();

      const resetMetrics = metrics.getMetrics();
      assert.strictEqual(resetMetrics.requests_total, 0);
      assert.strictEqual(resetMetrics.requests_successful, 0);
      assert.strictEqual(resetMetrics.requests_failed, 0);
      assert.strictEqual(resetMetrics.cache_hits, 0);
      assert.strictEqual(resetMetrics.cache_misses, 0);
      assert.strictEqual(resetMetrics.average_response_time, 0);
    });
  });
});

