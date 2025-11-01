/**
 * Metrics and monitoring system for Legal MCP Server
 * Provides performance tracking and health monitoring
 */

import { Metrics } from '../types.js';
import { Logger } from './logger.js';

export class MetricsCollector {
  private metrics: Metrics;
  private startTime: number;
  private logger: Logger;
  private responseTimes: number[] = [];
  private readonly maxResponseTimesSamples = 100;

  constructor(logger: Logger) {
    this.logger = logger;
    this.startTime = Date.now();
    this.metrics = {
      requests_total: 0,
      requests_successful: 0,
      requests_failed: 0,
      cache_hits: 0,
      cache_misses: 0,
      average_response_time: 0,
      last_request_time: '',
      uptime_seconds: 0,
    };
  }

  /**
   * Record a successful request
   */
  recordRequest(responseTime: number, fromCache = false): void {
    this.metrics.requests_total++;
    this.metrics.requests_successful++;
    this.metrics.last_request_time = new Date().toISOString();

    if (fromCache) {
      this.metrics.cache_hits++;
    } else {
      this.metrics.cache_misses++;
    }

    this.updateResponseTime(responseTime);

    this.logger.debug('Request recorded', {
      responseTime,
      fromCache,
      totalRequests: this.metrics.requests_total,
    });
  }

  /**
   * Record a failed request
   */
  recordFailure(responseTime: number): void {
    this.metrics.requests_total++;
    this.metrics.requests_failed++;
    this.metrics.last_request_time = new Date().toISOString();

    this.updateResponseTime(responseTime);

    this.logger.debug('Failed request recorded', {
      responseTime,
      totalRequests: this.metrics.requests_total,
      failureRate: this.getFailureRate(),
    });
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.metrics.cache_hits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cache_misses++;
  }

  /**
   * Update response time average
   */
  private updateResponseTime(responseTime: number): void {
    this.responseTimes.push(responseTime);

    // Keep only recent samples
    if (this.responseTimes.length > this.maxResponseTimesSamples) {
      this.responseTimes = this.responseTimes.slice(-this.maxResponseTimesSamples);
    }

    // Calculate average
    this.metrics.average_response_time =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Metrics {
    return {
      ...this.metrics,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Get detailed health information
   */
  getHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    checks: Record<string, { status: 'pass' | 'fail'; message: string; value?: any }>;
    metrics: Metrics;
  } {
    const metrics = this.getMetrics();
    const failureRate = this.getFailureRate();
    const cacheHitRate = this.getCacheHitRate();

    const checks: Record<string, { status: 'pass' | 'fail'; message: string; value?: any }> = {
      uptime: {
        status: metrics.uptime_seconds > 0 ? 'pass' : 'fail',
        message: `Server has been running for ${metrics.uptime_seconds} seconds`,
        value: metrics.uptime_seconds,
      },
      failure_rate: {
        status: failureRate < 0.25 ? 'pass' : 'fail',
        message: `Request failure rate is ${(failureRate * 100).toFixed(1)}%`,
        value: failureRate,
      },
      response_time: {
        status: metrics.average_response_time < 3000 ? 'pass' : 'fail',
        message: `Average response time is ${metrics.average_response_time.toFixed(0)}ms`,
        value: metrics.average_response_time,
      },
      cache_performance: {
        status: 'pass', // Cache is optional, so always pass
        message: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}%`,
        value: cacheHitRate,
      },
    };

    const failedChecks = Object.values(checks).filter((check) => check.status === 'fail');
    const status =
      failedChecks.length === 0 ? 'healthy' : failedChecks.length <= 1 ? 'warning' : 'critical';

    return { status, checks, metrics };
  }

  /**
   * Get failure rate
   */
  private getFailureRate(): number {
    if (this.metrics.requests_total === 0) return 0;
    return this.metrics.requests_failed / this.metrics.requests_total;
  }

  /**
   * Get cache hit rate
   */
  private getCacheHitRate(): number {
    const totalCacheRequests = this.metrics.cache_hits + this.metrics.cache_misses;
    if (totalCacheRequests === 0) return 0;
    return this.metrics.cache_hits / totalCacheRequests;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    requestRate: number; // requests per minute
    successRate: number;
    cacheEffectiveness: number;
    performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  } {
    const metrics = this.getMetrics();
    const uptimeMinutes = metrics.uptime_seconds / 60;

    const requestRate = uptimeMinutes > 0 ? metrics.requests_total / uptimeMinutes : 0;
    const successRate =
      this.metrics.requests_total > 0
        ? this.metrics.requests_successful / this.metrics.requests_total
        : 1;
    const cacheEffectiveness = this.getCacheHitRate();

    // Calculate performance grade
    let score = 0;
    score += successRate * 40; // 40% weight on success rate
    score += Math.min(cacheEffectiveness * 2, 1) * 20; // 20% weight on cache effectiveness
    score += Math.min(1000 / (metrics.average_response_time || 1000), 1) * 40; // 40% weight on response time

    const performanceGrade =
      score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    return {
      requestRate,
      successRate,
      cacheEffectiveness,
      performanceGrade,
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.metrics = {
      requests_total: 0,
      requests_successful: 0,
      requests_failed: 0,
      cache_hits: 0,
      cache_misses: 0,
      average_response_time: 0,
      last_request_time: '',
      uptime_seconds: 0,
    };
    this.responseTimes = [];
    this.startTime = Date.now();

    this.logger.info('Metrics reset');
  }
}
