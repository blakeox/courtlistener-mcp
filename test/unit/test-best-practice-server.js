#!/usr/bin/env node

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Import compiled server and dependencies
const { BestPracticeLegalMCPServer } = await import('../../dist/server/best-practice-server.js');
const { container } = await import('../../dist/infrastructure/container.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

// Lightweight stubs for DI
class StubMetrics {
  recordRequest() {}
  recordFailure() {}
  getMetrics() { return { requests: 0 }; }
  getPerformanceSummary() { return {}; }
}
class StubCircuitBreakers { areAllHealthy() { return true; } }
class StubCache {}
class StubMiddlewareFactory {
  createMiddlewareStack() { return []; }
  async executeMiddlewareStack(_mws, _ctx, next) { return next(); }
}
class StubServerFactory {
  constructor(logger) { this.logger = logger; }
  createServer() {
    // Minimal fake that supports setRequestHandler and connect/close
    return {
      setRequestHandler() {},
      async connect() {},
      async close() {}
    };
  }
}
class StubRegistry {
  constructor() {
    this.defs = [{ name: 'stub_tool', description: 'stub', inputSchema: { type: 'object', properties: {} } }];
  }
  getToolNames() { return ['stub_tool']; }
  getCategories() { return ['test']; }
  getToolDefinitions() { return this.defs; }
  async execute(request, ctx) {
    return { content: [{ type: 'text', text: JSON.stringify({ ran: true, name: request.params.name }) }] };
  }
}

function installTestDI() {
  // Clear instances to avoid bleed from other tests
  container.clear();
  container.register('logger', { factory: () => new Logger({ level: 'silent' }) });
  container.register('metrics', { factory: () => new StubMetrics() });
  container.register('toolRegistry', { factory: () => new StubRegistry() });
  container.register('middlewareFactory', { factory: () => new StubMiddlewareFactory() });
  container.register('config', { factory: () => ({
    logging: { enabled: false },
    metrics: { enabled: false, port: 0 },
    security: { rateLimitEnabled: false, authEnabled: false },
    cache: { enabled: false },
    circuitBreaker: { enabled: false }
  }) });
  container.register('circuitBreakerManager', { factory: () => new StubCircuitBreakers() });
  container.register('cache', { factory: () => new StubCache() });
  container.register('serverFactory', { factory: () => new StubServerFactory(new Logger({ level: 'silent' })) });
}

describe('BestPracticeLegalMCPServer (minimal paths)', () => {
  beforeEach(() => installTestDI());
  afterEach(() => container.clear());

  it('lists tools with metadata', async () => {
    const server = new BestPracticeLegalMCPServer();
    const { tools, metadata } = await server.listTools();
    assert.ok(Array.isArray(tools));
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'stub_tool');
    assert.ok(Array.isArray(metadata.categories));
  });

  it('handles a direct tool call', async () => {
    const server = new BestPracticeLegalMCPServer();
    const res = await server.handleToolCall({ name: 'stub_tool', arguments: {} });
    const payload = JSON.parse(res.content[0].text);
    assert.strictEqual(payload.ran, true);
    assert.strictEqual(payload.name, 'stub_tool');
  });
});
