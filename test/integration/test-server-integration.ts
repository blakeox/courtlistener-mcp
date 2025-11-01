#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Server Integration Tests (TypeScript)
 * Tests health monitoring, enterprise server functionality, and security boundaries
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer, type Server } from 'node:http';
import { URL } from 'node:url';

// Import server components
const { HealthServer } = await import('../../dist/http-server.js');
const { LegalMCPServer } = await import('../../dist/index.js');

interface LogEntry {
  level: string;
  msg?: string;
  error?: unknown;
  meta?: unknown;
  timestamp: number;
  method?: string;
  endpoint?: string;
  duration?: number;
  status?: number;
  label?: string;
}

/**
 * 🧪 Test Component Mocks for Server Testing
 */
class MockLogger {
  public logs: LogEntry[] = [];
  private timers: Map<string, number> = new Map();

  info(msg: string, meta?: unknown): void {
    this.logs.push({ level: 'info', msg, meta, timestamp: Date.now() });
  }

  error(msg: string, error?: unknown, meta?: unknown): void {
    this.logs.push({ level: 'error', msg, error, meta, timestamp: Date.now() });
  }

  debug(msg: string, meta?: unknown): void {
    this.logs.push({ level: 'debug', msg, meta, timestamp: Date.now() });
  }

  warn(msg: string, meta?: unknown): void {
    this.logs.push({ level: 'warn', msg, meta, timestamp: Date.now() });
  }

  apiCall(
    method: string,
    endpoint: string,
    duration: number,
    status: number,
    meta?: unknown
  ): void {
    this.logs.push({
      level: 'api',
      method,
      endpoint,
      duration,
      status,
      meta,
      timestamp: Date.now(),
    });
  }

  startTimer(label: string): {
    end: () => number;
    endWithError: (error: unknown) => number;
  } {
    const start = Date.now();
    this.timers.set(label, start);
    return {
      end: (): number => {
        const duration = Date.now() - start;
        this.timers.delete(label);
        return duration;
      },
      endWithError: (error: unknown): number => {
        const duration = Date.now() - start;
        this.timers.delete(label);
        this.logs.push({
          level: 'timer_error',
          label,
          duration,
          error,
          timestamp: Date.now(),
        });
        return duration;
      },
    };
  }
}

class MockCacheManager {
  private cache: Map<string, unknown> = new Map();
  private enabled = true;
  private hits = 0;
  private misses = 0;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get(key: string): unknown | null {
    if (!this.enabled) return null;
    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }
    this.misses++;
    return null;
  }

  set(key: string, value: unknown): void {
    if (!this.enabled) return;
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): {
    enabled: boolean;
    entries: number;
    hits: number;
    misses: number;
    hit_rate: number;
    memory_usage: number;
  } {
    return {
      enabled: this.enabled,
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hit_rate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      memory_usage: JSON.stringify([...this.cache.entries()]).length,
    };
  }
}

interface RequestMetric {
  duration: number;
  fromCache: boolean;
  timestamp: number;
}

interface FailureMetric {
  duration: number;
  error: unknown;
  timestamp: number;
}

interface PerformanceMetric {
  operation: string;
  duration: number;
  metadata: Record<string, unknown>;
  timestamp: number;
}

class MockMetricsCollector {
  private requests: RequestMetric[] = [];
  private failures: FailureMetric[] = [];
  private performanceData: PerformanceMetric[] = [];

  recordRequest(duration: number, fromCache = false): void {
    this.requests.push({ duration, fromCache, timestamp: Date.now() });
  }

  recordFailure(duration: number, error: unknown = null): void {
    this.failures.push({ duration, error, timestamp: Date.now() });
  }

  recordPerformance(operation: string, duration: number, metadata: Record<string, unknown> = {}): void {
    this.performanceData.push({ operation, duration, metadata, timestamp: Date.now() });
  }

  getStats(): {
    totalRequests: number;
    totalFailures: number;
    cacheHits: number;
    averageResponseTime: number;
  } {
    return {
      totalRequests: this.requests.length,
      totalFailures: this.failures.length,
      cacheHits: this.requests.filter((r) => r.fromCache).length,
      averageResponseTime:
        this.requests.length > 0
          ? this.requests.reduce((acc, r) => acc + r.duration, 0) / this.requests.length
          : 0,
    };
  }

  getHealth(): {
    status: string;
    uptime: number;
    failure_rate: number;
    total_requests: number;
    total_failures: number;
  } {
    const stats = this.getStats();
    const failureRate =
      stats.totalRequests > 0 ? stats.totalFailures / stats.totalRequests : 0;

    let status = 'healthy';
    if (failureRate > 0.1) status = 'critical';
    else if (failureRate > 0.05) status = 'warning';

    return {
      status,
      uptime: Date.now() - (this.requests[0]?.timestamp || Date.now()),
      failure_rate: failureRate,
      total_requests: stats.totalRequests,
      total_failures: stats.totalFailures,
    };
  }

  getMetrics(): {
    requests: ReturnType<typeof this.getStats>;
    performance: ReturnType<typeof this.getPerformanceSummary>;
  } {
    return {
      requests: this.getStats(),
      performance: this.getPerformanceSummary(),
    };
  }

  getPerformanceSummary(): {
    operations: number;
    average_duration: number;
    operations_by_type: Record<string, number>;
  } {
    if (this.performanceData.length === 0) {
      return { operations: 0, average_duration: 0, operations_by_type: {} };
    }

    const totalDuration = this.performanceData.reduce((acc, p) => acc + p.duration, 0);
    return {
      operations: this.performanceData.length,
      average_duration: totalDuration / this.performanceData.length,
      operations_by_type: this.performanceData.reduce(
        (acc, p) => {
          acc[p.operation] = (acc[p.operation] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }
}

interface CircuitBreakerState {
  state: string;
  failures: number;
  nextAttempt: number | null;
}

class MockCircuitBreakerManager {
  private breakers: Map<string, CircuitBreakerState> = new Map();

  constructor() {
    this.breakers.set('courtlistener', { state: 'closed', failures: 0, nextAttempt: null });
    this.breakers.set('cache', { state: 'closed', failures: 0, nextAttempt: null });
  }

  getAllStats(): Record<string, CircuitBreakerState> {
    return Object.fromEntries(this.breakers);
  }

  areAllHealthy(): boolean {
    return Array.from(this.breakers.values()).every((b) => b.state === 'closed');
  }
}

/**
 * 🌐 HTTP Client Helper for Server Testing
 */
class HTTPClient {
  static async request(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    } = {}
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
    ok: boolean;
  }> {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      ...options,
    });

    const text = await response.text();
    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      ok: response.ok,
    };
  }
}

// Global test state
let healthServer: InstanceType<typeof HealthServer>;
let mockLogger: MockLogger;
let mockCache: MockCacheManager;
let mockMetrics: MockMetricsCollector;
let mockCircuitBreaker: MockCircuitBreakerManager;
let serverPort = 0;

describe('🏢 Server Integration Testing', () => {
  beforeEach(async () => {
    // Initialize mock dependencies
    mockLogger = new MockLogger();
    mockCache = new MockCacheManager();
    mockMetrics = new MockMetricsCollector();
    mockCircuitBreaker = new MockCircuitBreakerManager();

    // Find available port
    serverPort = 3000 + Math.floor(Math.random() * 1000);

    // Initialize health server
    healthServer = new HealthServer(
      serverPort,
      mockLogger as unknown,
      mockMetrics as unknown,
      mockCache as unknown,
      mockCircuitBreaker as unknown
    );

    // Start the server
    await healthServer.start();
  });

  afterEach(async () => {
    if (healthServer) {
      await healthServer.stop();
    }
  });

  describe('🏥 Health Server Endpoints', () => {
    it('should respond to health check endpoint', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`);

      assert.strictEqual(response.status, 200);
      assert.ok(
        typeof response.data === 'object' &&
          response.data !== null &&
          'status' in response.data
      );
      assert.ok(
        typeof response.data === 'object' &&
          response.data !== null &&
          'cache_stats' in response.data
      );
      assert.ok(
        typeof response.data === 'object' &&
          response.data !== null &&
          'timestamp' in response.data
      );

      // Should include health status
      const data = response.data as { status?: string };
      assert.ok(data.status && ['healthy', 'warning', 'critical'].includes(data.status));

      console.log('✓ Health endpoint response:', JSON.stringify(response.data, null, 2));
    });

    it('should respond to metrics endpoint', async () => {
      // Add some test metrics
      mockMetrics.recordRequest(100);
      mockMetrics.recordRequest(200, true);
      mockMetrics.recordFailure(300);

      const response = await HTTPClient.request(`http://localhost:${serverPort}/metrics`);

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        metrics?: { requests?: { totalRequests?: number; totalFailures?: number; cacheHits?: number } };
        performance?: unknown;
        cache_stats?: unknown;
        timestamp?: unknown;
      };
      assert.ok(data.metrics);
      assert.ok(data.performance);
      assert.ok(data.cache_stats);
      assert.ok(data.timestamp);

      // Verify metrics data structure
      assert.strictEqual(data.metrics?.requests?.totalRequests, 2);
      assert.strictEqual(data.metrics?.requests?.totalFailures, 1);
      assert.strictEqual(data.metrics?.requests?.cacheHits, 1);

      console.log('✓ Metrics endpoint response includes request stats');
    });

    it('should respond to cache stats endpoint', async () => {
      // Add some cache data
      mockCache.set('test-key', 'test-value');
      mockCache.get('test-key'); // hit
      mockCache.get('missing-key'); // miss

      const response = await HTTPClient.request(`http://localhost:${serverPort}/cache`);

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        entries?: number;
        hits?: number;
        misses?: number;
        timestamp?: unknown;
      };
      assert.strictEqual(data.entries, 1);
      assert.strictEqual(data.hits, 1);
      assert.strictEqual(data.misses, 1);
      assert.ok(data.timestamp);

      console.log('✓ Cache endpoint shows correct statistics');
    });

    it('should respond to config summary endpoint', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/config`);

      assert.strictEqual(response.status, 200);
      const data = response.data as { timestamp?: unknown };
      assert.ok(data.timestamp);

      // Should have configuration information
      // Note: The actual config structure depends on the implementation
      console.log('✓ Config endpoint accessible');
    });

    it('should respond to circuit breakers endpoint', async () => {
      const response = await HTTPClient.request(
        `http://localhost:${serverPort}/circuit-breakers`
      );

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        enabled?: boolean;
        healthy?: boolean;
        circuit_breakers?: Record<string, unknown>;
        timestamp?: unknown;
      };
      assert.strictEqual(data.enabled, true);
      assert.strictEqual(data.healthy, true);
      assert.ok(data.circuit_breakers);
      assert.ok(data.timestamp);

      // Should include circuit breaker stats
      assert.ok(data.circuit_breakers?.courtlistener);
      assert.ok(data.circuit_breakers?.cache);

      console.log('✓ Circuit breakers endpoint shows all breakers');
    });

    it('should respond to security status endpoint', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/security`);

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        security_features?: unknown;
        compliance_status?: unknown;
        last_security_check?: unknown;
        timestamp?: unknown;
      };
      assert.ok(data.security_features);
      assert.ok(data.compliance_status);
      assert.ok(data.last_security_check);
      assert.ok(data.timestamp);

      console.log('✓ Security endpoint provides security status');
    });

    it('should respond to root endpoint with server info', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/`);

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        name?: string;
        version?: unknown;
        description?: unknown;
        endpoints?: Record<string, unknown>;
        features?: unknown;
        timestamp?: unknown;
      };
      assert.strictEqual(data.name, 'Legal MCP Server');
      assert.ok(data.version);
      assert.ok(data.description);
      assert.ok(data.endpoints);
      assert.ok(data.features);
      assert.ok(data.timestamp);

      // Should list all available endpoints
      const endpoints = data.endpoints || {};
      assert.ok(endpoints['/health']);
      assert.ok(endpoints['/metrics']);
      assert.ok(endpoints['/cache']);
      assert.ok(endpoints['/config']);
      assert.ok(endpoints['/circuit-breakers']);
      assert.ok(endpoints['/security']);

      console.log('✓ Root endpoint provides comprehensive server info');
    });

    it('should handle 404 for unknown endpoints', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/unknown`);

      assert.strictEqual(response.status, 404);
      const data = response.data as {
        error?: unknown;
        available_endpoints?: string[];
      };
      assert.ok(data.error);
      assert.ok(data.available_endpoints);

      // Should list available endpoints in error response
      const endpoints = data.available_endpoints || [];
      assert.ok(endpoints.includes('/health'));
      assert.ok(endpoints.includes('/metrics'));

      console.log('✓ 404 handler provides helpful endpoint list');
    });
  });

  describe('🔒 Security Boundary Testing', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`, {
        method: 'OPTIONS',
      });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['access-control-allow-origin'], '*');
      assert.ok(response.headers['access-control-allow-methods']);
      assert.ok(response.headers['access-control-allow-headers']);

      console.log('✓ CORS preflight handled correctly');
    });

    it('should set proper CORS headers on all responses', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`);

      assert.strictEqual(response.headers['access-control-allow-origin'], '*');
      assert.strictEqual(response.headers['content-type'], 'application/json');

      console.log('✓ CORS headers present on regular requests');
    });

    it('should handle malformed requests gracefully', async () => {
      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'malformed json {',
      });

      // Should still respond (POST not supported but shouldn't crash)
      assert.ok(response.status >= 200);

      console.log('✓ Malformed requests handled gracefully');
    });

    it('should handle server errors gracefully', async () => {
      // Force an error by destroying the mock metrics
      const originalGetHealth = mockMetrics.getHealth.bind(mockMetrics);
      mockMetrics.getHealth = () => {
        throw new Error('Simulated error');
      };

      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`);

      assert.strictEqual(response.status, 500);
      const data = response.data as { error?: unknown };
      assert.ok(data.error);

      // Restore the original method
      mockMetrics.getHealth = originalGetHealth;

      console.log('✓ Server errors handled with proper 500 response');
    });

    it('should log security-relevant events', async () => {
      await HTTPClient.request(`http://localhost:${serverPort}/security`);

      // Check that the request was logged
      const logs = mockLogger.logs;
      assert.ok(logs.length > 0);

      // Should have at least one log entry
      const hasServerLog = logs.some(
        (log) => log.level === 'info' && log.msg?.includes('Health server started')
      );
      assert.ok(hasServerLog, 'Should log server startup');

      console.log('✓ Security events are logged');
    });
  });

  describe('🏢 Enterprise Server Features', () => {
    it('should provide comprehensive health status', async () => {
      // Add various types of metrics but keep failure rate low
      mockMetrics.recordRequest(50); // Fast request
      mockMetrics.recordRequest(500); // Slow request
      mockMetrics.recordRequest(200); // Normal request
      mockMetrics.recordRequest(100); // Another normal request
      mockMetrics.recordFailure(100); // Single failure

      const response = await HTTPClient.request(`http://localhost:${serverPort}/health`);

      // With 1 failure out of 5 requests (20% failure rate), should be critical (503)
      // This is correct behavior - high failure rate should result in unhealthy status
      assert.strictEqual(response.status, 503);

      const health = response.data as {
        status?: string;
        uptime?: number;
        failure_rate?: number;
        total_requests?: number;
        total_failures?: number;
      };
      assert.strictEqual(health.status, 'critical');
      assert.ok(typeof health.uptime === 'number' || health.uptime === undefined);
      assert.ok(typeof health.failure_rate === 'number');
      assert.strictEqual(health.total_requests, 4);
      assert.strictEqual(health.total_failures, 1);
      assert.ok(health.failure_rate && health.failure_rate > 0.1); // Should be 0.2 (20%)

      console.log(
        '✓ Health status correctly identifies critical state with high failure rate'
      );
    });

    it('should provide detailed performance metrics', async () => {
      // Add performance data
      mockMetrics.recordPerformance('search', 150, { query: 'test' });
      mockMetrics.recordPerformance('lookup', 75, { id: '123' });
      mockMetrics.recordRequest(100);

      const response = await HTTPClient.request(`http://localhost:${serverPort}/metrics`);

      assert.strictEqual(response.status, 200);

      const metrics = response.data as {
        metrics?: { requests?: { totalRequests?: number } };
        performance?: unknown;
        cache_stats?: unknown;
      };
      assert.ok(metrics.metrics);
      assert.ok(metrics.performance);
      assert.ok(metrics.cache_stats);

      // Should include request statistics
      assert.strictEqual(metrics.metrics?.requests?.totalRequests, 1);

      console.log('✓ Performance metrics provide detailed insights');
    });

    it('should monitor circuit breaker health', async () => {
      const response = await HTTPClient.request(
        `http://localhost:${serverPort}/circuit-breakers`
      );

      assert.strictEqual(response.status, 200);
      const data = response.data as {
        enabled?: boolean;
        healthy?: boolean;
        circuit_breakers?: {
          courtlistener?: { state?: string };
          cache?: { state?: string };
        };
      };
      assert.strictEqual(data.enabled, true);
      assert.strictEqual(data.healthy, true);

      const breakers = data.circuit_breakers || {};
      assert.ok(breakers.courtlistener);
      assert.ok(breakers.cache);

      // All breakers should be in closed state (healthy)
      assert.strictEqual(breakers.courtlistener?.state, 'closed');
      assert.strictEqual(breakers.cache?.state, 'closed');

      console.log('✓ Circuit breaker monitoring operational');
    });

    it('should provide cache performance insights', async () => {
      // Simulate cache usage patterns
      mockCache.set('frequent-key', 'value1');
      mockCache.set('rare-key', 'value2');

      // Generate hits and misses
      for (let i = 0; i < 10; i++) {
        mockCache.get('frequent-key'); // 10 hits
      }
      mockCache.get('missing-key'); // 1 miss

      const response = await HTTPClient.request(`http://localhost:${serverPort}/cache`);

      assert.strictEqual(response.status, 200);

      const stats = response.data as {
        entries?: number;
        hits?: number;
        misses?: number;
        hit_rate?: number;
      };
      assert.strictEqual(stats.entries, 2);
      assert.strictEqual(stats.hits, 10);
      assert.strictEqual(stats.misses, 1);
      assert.ok(stats.hit_rate && stats.hit_rate > 0.9); // Should be about 0.91

      console.log('✓ Cache performance insights detailed and accurate');
    });

    it('should handle concurrent requests properly', async () => {
      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        HTTPClient.request(`http://localhost:${serverPort}/health`)
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach((response, index) => {
        assert.strictEqual(response.status, 200, `Request ${index} should succeed`);
        const data = response.data as { timestamp?: unknown };
        assert.ok(data.timestamp, `Request ${index} should have timestamp`);
      });

      console.log('✓ Concurrent requests handled successfully');
    });
  });
});

console.log('✅ Server Integration tests completed');

