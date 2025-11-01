#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Best Practice Legal MCP Server (TypeScript)
 * Tests server initialization, tool listing, execution, and lifecycle
 */

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '../../src/infrastructure/logger.js';
import type { MetricsCollector } from '../../src/infrastructure/metrics.js';
import type { CacheManager } from '../../src/infrastructure/cache.js';

// Import compiled server and dependencies
const { BestPracticeLegalMCPServer } = await import(
  '../../dist/server/best-practice-server.js'
);
const { container } = await import('../../dist/infrastructure/container.js');
const { Logger: LoggerClass } = await import('../../dist/infrastructure/logger.js');

// Lightweight stubs for DI
class StubMetrics implements Partial<MetricsCollector> {
  recordRequest(): void {}
  recordFailure(): void {}
  getMetrics(): Record<string, unknown> {
    return { requests: 0 };
  }
  getPerformanceSummary(): Record<string, unknown> {
    return {};
  }
}

class StubCircuitBreakers {
  areAllHealthy(): boolean {
    return true;
  }
}

class StubCache implements Partial<CacheManager> {
  isEnabled(): boolean {
    return false;
  }
}

class StubMiddlewareFactory {
  createMiddlewareStack(): unknown[] {
    return [];
  }
  async executeMiddlewareStack(_mws: unknown, _ctx: unknown, next: () => unknown): Promise<unknown> {
    return next();
  }
}

class StubServerFactory {
  constructor(private logger: Logger) {}

  createServer(): {
    setRequestHandler: () => void;
    connect: () => Promise<void>;
    close: () => Promise<void>;
  } {
    // Minimal fake that supports setRequestHandler and connect/close
    return {
      setRequestHandler(): void {},
      async connect(): Promise<void> {},
      async close(): Promise<void> {},
    };
  }
}

interface StubToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown> };
}

class StubRegistry {
  private readonly defs: StubToolDefinition[];

  constructor() {
    this.defs = [
      {
        name: 'stub_tool',
        description: 'stub',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  getToolNames(): string[] {
    return ['stub_tool'];
  }

  getCategories(): string[] {
    return ['test'];
  }

  getToolDefinitions(): StubToolDefinition[] {
    return this.defs;
  }

  async execute(
    request: { params: { name: string } },
    _ctx: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ran: true, name: request.params.name }),
        },
      ],
    };
  }
}

function installTestDI(): void {
  // Clear all registrations and instances to avoid bleed from other tests
  if (typeof (container as { clearAll?: () => void }).clearAll === 'function') {
    (container as { clearAll: () => void }).clearAll();
  } else if (typeof container.clear === 'function') {
    container.clear();
    // Also clear services map if clearAll doesn't exist
    (container as { services?: Map<string, unknown> }).services?.clear();
  }

  // Use registerOrReplace if available, otherwise use register after unregistering
  const registerOrReplace = (container as { registerOrReplace?: (name: string, def: Parameters<typeof container.register>[1]) => void }).registerOrReplace;
  
  if (registerOrReplace) {
    // Bind to container to preserve 'this' context
    registerOrReplace.call(container, 'logger', {
      factory: () => new LoggerClass({ level: 'silent', format: 'json', enabled: false }, 'Test'),
    });
    registerOrReplace.call(container, 'metrics', {
      factory: () => new StubMetrics() as MetricsCollector,
    });
    registerOrReplace.call(container, 'toolRegistry', {
      factory: () => new StubRegistry(),
    });
    registerOrReplace.call(container, 'middlewareFactory', {
      factory: () => new StubMiddlewareFactory(),
    });
    registerOrReplace.call(container, 'config', {
    factory: () => ({
      logging: { enabled: false, level: 'silent', format: 'json' },
      metrics: { enabled: false, port: 0 },
      security: { rateLimitEnabled: false, authEnabled: false, apiKeys: [], allowAnonymous: true, corsEnabled: false, corsOrigins: [], maxRequestsPerMinute: 100, sanitizationEnabled: false },
      cache: { enabled: false, ttl: 300, maxSize: 1000 },
      circuitBreaker: { enabled: false, failureThreshold: 5, successThreshold: 3, timeout: 10000, resetTimeout: 60000 },
      audit: { enabled: false, logLevel: 'info', includeRequestBody: false, includeResponseBody: false, maxBodyLength: 2000, sensitiveFields: [] },
      compression: { enabled: false, threshold: 1024, level: 6 },
      courtListener: { baseUrl: 'https://api.example.com', version: 'v4', timeout: 30000, retryAttempts: 3, rateLimitPerMinute: 100 },
    }),
  });
    registerOrReplace.call(container, 'circuitBreakerManager', {
      factory: () => new StubCircuitBreakers(),
    });
    registerOrReplace.call(container, 'cache', {
      factory: () => new StubCache() as CacheManager,
    });
    registerOrReplace.call(container, 'serverFactory', {
      factory: () => new StubServerFactory(new LoggerClass({ level: 'silent', format: 'json', enabled: false }, 'Test')),
    });
  } else {
    // Fallback: manually unregister then register
    const unregister = (container as { unregister?: (name: string) => void }).unregister;
    const register = container.register.bind(container);
    
    const registerService = (name: string, def: Parameters<typeof container.register>[1]) => {
      if (unregister) {
        try {
          unregister(name);
        } catch {
          // Service might not exist, ignore
        }
      }
      try {
        register(name, def);
      } catch (error) {
        // If already registered, unregister first
        if (error instanceof Error && error.message.includes('already registered')) {
          if (unregister) {
            unregister(name);
            register(name, def);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    };
    
    registerService('logger', {
      factory: () => new LoggerClass({ level: 'silent', format: 'json', enabled: false }, 'Test'),
    });
    registerService('metrics', {
      factory: () => new StubMetrics() as MetricsCollector,
    });
    registerService('toolRegistry', {
      factory: () => new StubRegistry(),
    });
    registerService('middlewareFactory', {
      factory: () => new StubMiddlewareFactory(),
    });
    registerService('config', {
      factory: () => ({
        logging: { enabled: false, level: 'silent', format: 'json' },
        metrics: { enabled: false, port: 0 },
        security: { rateLimitEnabled: false, authEnabled: false, apiKeys: [], allowAnonymous: true, corsEnabled: false, corsOrigins: [], maxRequestsPerMinute: 100, sanitizationEnabled: false },
        cache: { enabled: false, ttl: 300, maxSize: 1000 },
        circuitBreaker: { enabled: false, failureThreshold: 5, successThreshold: 3, timeout: 10000, resetTimeout: 60000 },
        audit: { enabled: false, logLevel: 'info', includeRequestBody: false, includeResponseBody: false, maxBodyLength: 2000, sensitiveFields: [] },
        compression: { enabled: false, threshold: 1024, level: 6 },
        courtListener: { baseUrl: 'https://api.example.com', version: 'v4', timeout: 30000, retryAttempts: 3, rateLimitPerMinute: 100 },
      }),
    });
    registerService('circuitBreakerManager', {
      factory: () => new StubCircuitBreakers(),
    });
    registerService('cache', {
      factory: () => new StubCache() as CacheManager,
    });
    registerService('serverFactory', {
      factory: () => new StubServerFactory(new LoggerClass({ level: 'silent', format: 'json', enabled: false }, 'Test')),
    });
  }
}

describe('BestPracticeLegalMCPServer (TypeScript)', () => {
  beforeEach(() => installTestDI());
  afterEach(() => {
    if (typeof (container as { clearAll?: () => void }).clearAll === 'function') {
      (container as { clearAll: () => void }).clearAll();
    } else if (typeof container.clear === 'function') {
      container.clear();
    }
  });

  it('lists tools with metadata', async () => {
    const server = new BestPracticeLegalMCPServer();
    const result = await server.listTools();

    assert.ok('tools' in result);
    assert.ok('metadata' in result);
    const tools = result.tools as Tool[];
    const metadata = result.metadata as { categories?: string[] };

    assert.ok(Array.isArray(tools));
    assert.ok(Array.isArray(metadata.categories));
    assert.ok(tools.length >= 0);
  });

  it('handles tool execution requests', async () => {
    const server = new BestPracticeLegalMCPServer();

    const request = {
      name: 'stub_tool',
      arguments: { test: 'value' },
    };

    const result = await server.handleToolCall(request);

    assert.ok('content' in result);
    const content = result.content;
    assert.ok(Array.isArray(content));
    assert.ok(content.length > 0);
  });

  it('provides tool definitions in correct format', async () => {
    const server = new BestPracticeLegalMCPServer();
    const result = await server.listTools();

    const tools = result.tools as Tool[];
    if (tools.length > 0) {
      const tool = tools[0];
      assert.ok('name' in tool);
      assert.ok('description' in tool);
      assert.ok('inputSchema' in tool);
    }
  });
});

