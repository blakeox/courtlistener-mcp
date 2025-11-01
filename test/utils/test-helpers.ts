/**
 * Test utilities and helpers for enterprise middleware testing
 * Provides common mocks, fixtures, and testing utilities
 */

import type { Logger } from '../../src/infrastructure/logger.js';

interface Logs {
  info: unknown[][];
  warn: unknown[][];
  error: unknown[][];
  debug: unknown[][];
}

export interface MockLogger extends Logger {
  getLogs(): Logs;
  clearLogs(): void;
}

// Mock logger that captures all log calls for testing
export function createMockLogger(): MockLogger {
  const logs: Logs = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };

  const mockLogger: MockLogger = {
    child(name: string): MockLogger {
      return {
        ...mockLogger,
        child: () => mockLogger,
      };
    },
    info(...args: unknown[]): void {
      logs.info.push(args);
    },
    warn(...args: unknown[]): void {
      logs.warn.push(args);
    },
    error(...args: unknown[]): void {
      logs.error.push(args);
    },
    debug(...args: unknown[]): void {
      logs.debug.push(args);
    },
    toolExecution(
      toolName: string,
      duration: number,
      success: boolean,
      metadata?: Record<string, unknown>
    ): void {
      logs.info.push([`Tool: ${toolName}`, { duration, success, ...metadata }]);
    },
    apiCall(
      method: string,
      endpoint: string,
      duration: number,
      status: number,
      metadata?: Record<string, unknown>
    ): void {
      logs.info.push([
        `API ${method} ${endpoint}`,
        { duration, status, ...metadata },
      ]);
    },
    startTimer(operation: string) {
      const start = Date.now();
      return {
        end(): number {
          return Date.now() - start;
        },
        endWithError(error: Error): number {
          const duration = Date.now() - start;
          logs.error.push([`Timer ${operation} ended with error:`, error]);
          return duration;
        },
      };
    },
    getLogs(): Logs {
      return logs;
    },
    clearLogs(): void {
      logs.info = [];
      logs.warn = [];
      logs.error = [];
      logs.debug = [];
    },
  };

  return mockLogger;
}

// Mock HTTP request object
export interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  ip: string;
  [key: string]: unknown;
}

export function createMockRequest(
  overrides: Partial<MockRequest> = {}
): MockRequest {
  return {
    method: 'POST',
    url: '/test',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'test-agent/1.0',
      'x-client-id': 'test-client',
    },
    body: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

// Mock HTTP response object
export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
  send(data: unknown): MockResponse;
  header(name: string, value: string): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  getHeader(name: string): string | undefined;
}

export function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    data: null,

    status(code: number): MockResponse {
      this.statusCode = code;
      return this;
    },

    json(data: unknown): MockResponse {
      this.data = data;
      this.headers['content-type'] = 'application/json';
      return this;
    },

    send(data: unknown): MockResponse {
      this.data = data;
      return this;
    },

    header(name: string, value: string): MockResponse {
      this.headers[name.toLowerCase()] = value;
      return this;
    },

    setHeader(name: string, value: string): MockResponse {
      this.headers[name.toLowerCase()] = value;
      return this;
    },

    getHeader(name: string): string | undefined {
      return this.headers[name.toLowerCase()];
    },
  };

  return response;
}

// Test data fixtures
export const testFixtures = {
  // Safe test data
  safeData: {
    simple: { name: 'John Doe', age: 30 },
    nested: {
      user: {
        profile: {
          name: 'Jane Smith',
          preferences: ['email', 'sms'],
        },
      },
    },
    array: [
      { id: 1, title: 'Test Case 1' },
      { id: 2, title: 'Test Case 2' },
    ],
  },

  // Malicious test data
  maliciousData: {
    xss: '<script>alert("xss")</script>',
    sqlInjection: "'; DROP TABLE users; --",
    templateInjection: '${process.env}',
    javascriptExecution: 'eval("malicious code")',
    htmlInjection: '<iframe src="javascript:alert()"></iframe>',
    protocolHandler: 'javascript:alert("xss")',
    eventHandler: '<div onclick="alert()">Click me</div>',
  },

  // Large data for performance testing
  largeData: {
    longString: 'a'.repeat(50000),
    largeArray: Array(10000)
      .fill(null)
      .map((_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `Description for item ${i}`.repeat(10),
      })),
    deepObject(depth = 20): Record<string, unknown> {
      let obj: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < depth; i++) {
        obj = { [`level${i}`]: obj };
      }
      return obj;
    },
  },

  // Configuration fixtures
  configs: {
    security: {
      minimal: {
        enabled: true,
        maxStringLength: 1000,
        maxArrayLength: 100,
        maxObjectDepth: 5,
      },
      strict: {
        enabled: true,
        maxStringLength: 100,
        maxArrayLength: 10,
        maxObjectDepth: 3,
      },
      permissive: {
        enabled: true,
        maxStringLength: 100000,
        maxArrayLength: 10000,
        maxObjectDepth: 20,
      },
    },

    rateLimit: {
      strict: {
        perClientEnabled: true,
        requestsPerMinute: 10,
        burstSize: 2,
        penaltyMultiplier: 2,
      },
      permissive: {
        perClientEnabled: true,
        requestsPerMinute: 1000,
        burstSize: 100,
        penaltyMultiplier: 1.1,
      },
    },
  },
} as const;

// Test scenarios for integration testing
export const testScenarios = {
  minimal: {
    authentication: { enabled: false },
    sanitization: { enabled: true, maxStringLength: 1000 },
    rateLimit: { enabled: false },
    audit: { enabled: false },
    compression: { enabled: false },
  },

  standard: {
    authentication: { enabled: true, requireApiKey: true },
    sanitization: { enabled: true, maxStringLength: 10000 },
    rateLimit: { enabled: true, requestsPerMinute: 100 },
    audit: { enabled: true, includeBody: false },
    compression: { enabled: true, threshold: 1024 },
  },

  enterprise: {
    authentication: { enabled: true, requireApiKey: true },
    sanitization: { enabled: true, maxStringLength: 50000 },
    rateLimit: { enabled: true, requestsPerMinute: 1000 },
    audit: { enabled: true, includeBody: true },
    compression: { enabled: true, threshold: 512 },
    circuitBreaker: { enabled: true, failureThreshold: 5 },
  },

  // Additional scenarios from existing tests
  production: {
    enabled: true,
    features: ['auth', 'sanitization', 'compression', 'audit'] as const,
  },

  development: {
    enabled: false,
    features: [] as const,
  },
} as const;

// Assertion helpers
export const assertions = {
  // Check if middleware properly blocked malicious input
  expectBlocked(result: { blocked: boolean; reason?: string }, reason?: string): void {
    if (!result.blocked) {
      throw new Error('Expected input to be blocked, but it was allowed');
    }
    if (reason && !result.reason?.includes(reason)) {
      throw new Error(
        `Expected block reason to contain "${reason}", got: ${result.reason}`
      );
    }
  },

  // Check if middleware allowed safe input
  expectAllowed(result: { blocked: boolean; reason?: string }): void {
    if (result.blocked) {
      throw new Error(
        `Expected input to be allowed, but it was blocked: ${result.reason}`
      );
    }
  },

  // Check rate limit response
  expectRateLimited(result: {
    allowed: boolean;
    retryAfter: number;
  }): void {
    if (result.allowed) {
      throw new Error('Expected request to be rate limited, but it was allowed');
    }
    if (result.retryAfter <= 0) {
      throw new Error(
        'Expected positive retryAfter value for rate limited request'
      );
    }
  },

  // Check compression effectiveness
  expectCompressed(original: unknown, compressed: string | unknown): void {
    const originalSize = JSON.stringify(original).length;
    const compressedSize =
      typeof compressed === 'string'
        ? compressed.length
        : JSON.stringify(compressed).length;

    if (compressedSize >= originalSize) {
      throw new Error(
        `Expected compression, but size increased: ${originalSize} -> ${compressedSize}`
      );
    }
  },
};

// Performance measurement utilities
export const performance = {
  // Measure execution time of a function
  async measureTime<T>(fn: () => Promise<T> | T): Promise<{
    result: T;
    duration: number;
  }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  // Measure memory usage during function execution
  async measureMemory<T>(fn: () => Promise<T> | T): Promise<{
    result: T;
    memoryDelta: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  }> {
    const startMemory = process.memoryUsage();
    const result = await fn();
    const endMemory = process.memoryUsage();

    return {
      result,
      memoryDelta: {
        rss: endMemory.rss - startMemory.rss,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        external: endMemory.external - startMemory.external,
      },
    };
  },

  // Run function multiple times and collect statistics
  async benchmark<T>(
    fn: () => Promise<T> | T,
    iterations = 100
  ): Promise<{
    iterations: number;
    errors: number;
    min: number;
    max: number;
    median: number;
    average: number;
    p95: number;
    p99: number;
  }> {
    const times: number[] = [];
    let errors = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const { duration } = await performance.measureTime(fn);
        times.push(duration);
      } catch (error) {
        errors++;
      }
    }

    times.sort((a, b) => a - b);

    return {
      iterations,
      errors,
      min: times[0] ?? 0,
      max: times[times.length - 1] ?? 0,
      median: times[Math.floor(times.length / 2)] ?? 0,
      average: times.reduce((sum, time) => sum + time, 0) / times.length || 0,
      p95: times[Math.floor(times.length * 0.95)] ?? 0,
      p99: times[Math.floor(times.length * 0.99)] ?? 0,
    };
  },
};

// Environment setup utilities
export const environment = {
  // Set up environment variables for testing
  setupEnv(scenario: {
    features?: Record<string, boolean>;
    [key: string]: unknown;
  }): Record<string, string> {
    const envVars: Record<string, string> = {};

    if (scenario.features) {
      Object.entries(scenario.features).forEach(([feature, enabled]) => {
        switch (feature) {
          case 'authentication':
            envVars.SECURITY_AUTHENTICATION_ENABLED = String(enabled);
            if (enabled) {
              envVars.SECURITY_AUTHENTICATION_API_KEY = 'test-api-key-123';
            }
            break;
          case 'sanitization':
            envVars.SECURITY_SANITIZATION_ENABLED = String(enabled);
            break;
          case 'compression':
            envVars.COMPRESSION_ENABLED = String(enabled);
            break;
          case 'rateLimit':
            envVars.RATE_LIMITING_PER_CLIENT_ENABLED = String(enabled);
            break;
          case 'audit':
            envVars.AUDIT_ENABLED = String(enabled);
            break;
          case 'circuitBreaker':
            envVars.CIRCUIT_BREAKER_ENABLED = String(enabled);
            break;
          case 'gracefulShutdown':
            envVars.GRACEFUL_SHUTDOWN_ENABLED = String(enabled);
            break;
        }
      });
    }

    // Apply environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value;
    });

    return envVars;
  },

  // Clean up environment variables
  cleanupEnv(envVars: Record<string, string>): void {
    Object.keys(envVars).forEach((key) => {
      delete process.env[key];
    });
  },
};

// Test data validation
export const validation = {
  // Validate that enterprise middleware configurations are properly loaded
  validateConfig(
    config: Record<string, { enabled?: boolean }>,
    expectedFeatures: Record<string, boolean>
  ): void {
    const issues: string[] = [];

    Object.entries(expectedFeatures).forEach(([feature, expected]) => {
      const actual = config[feature]?.enabled;
      if (actual !== expected) {
        issues.push(`${feature}: expected ${expected}, got ${actual}`);
      }
    });

    if (issues.length > 0) {
      throw new Error(
        `Configuration validation failed:\n${issues.join('\n')}`
      );
    }
  },

  // Validate middleware chain execution order
  validateMiddlewareOrder(
    executionLog: Array<{ middleware: string }>,
    expectedOrder: string[]
  ): void {
    const actualOrder = executionLog.map((entry) => entry.middleware);

    if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) {
      throw new Error(
        `Middleware execution order mismatch:\n` +
        `Expected: ${expectedOrder.join(' -> ')}\n` +
        `Actual: ${actualOrder.join(' -> ')}`
      );
    }
  },
};

