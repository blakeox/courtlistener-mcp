#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Tool Handler Registry (TypeScript)
 * Tests tool registration, execution, validation, and error handling
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../../src/server/tool-handler.js';

const { ToolHandlerRegistry, BaseToolHandler } = await import(
  '../../dist/server/tool-handler.js'
);

interface TestInput {
  invalid?: boolean;
  a?: number;
  [key: string]: unknown;
}

class DummyHandler extends BaseToolHandler<TestInput, Record<string, unknown>> {
  name = 'dummy_tool';
  description = 'A dummy tool';
  category = 'test';

  validate(input: unknown): { success: true; data: TestInput } | { success: false; error: Error } {
    if (input && typeof input === 'object' && 'invalid' in input && input.invalid) {
      return { success: false, error: new Error('invalid input') };
    }
    return { success: true, data: (input as TestInput) || {} };
  }

  async execute(
    input: TestInput,
    context: ToolContext
  ): Promise<CallToolResult> {
    return this.success({ ok: true, input, id: context.requestId });
  }

  getSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: { invalid: { type: 'boolean' } },
    };
  }
}

class NoopLogger {
  info(): void {}
  debug(): void {}
  warn(): void {}
  error(): void {}
  child(): NoopLogger {
    return this;
  }
  startTimer(): { end(): number; endWithError(): number } {
    return {
      end: (): number => 0,
      endWithError: (): number => 0,
    };
  }
  toolExecution(): void {}
  apiCall(): void {}
}

describe('ToolHandlerRegistry (TypeScript)', () => {
  it('registers and retrieves handlers; lists tools and categories', () => {
    const registry = new ToolHandlerRegistry();
    const handler = new DummyHandler();
    registry.register(handler);

    assert.strictEqual(registry.get('dummy_tool'), handler);
    assert.deepStrictEqual(registry.getToolNames(), ['dummy_tool']);
    assert.deepStrictEqual(registry.getCategories(), ['test']);
    const byCat = registry.getToolsByCategory('test');
    assert.strictEqual(byCat.length, 1);
    assert.strictEqual(byCat[0].name, 'dummy_tool');

    const defs = registry.getToolDefinitions();
    assert.strictEqual(defs.length, 1);
    assert.strictEqual(defs[0].name, 'dummy_tool');
    assert.strictEqual(defs[0].description, 'A dummy tool');
  });

  it('executes a registered tool successfully', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DummyHandler());

    const request = {
      method: 'tools/call' as const,
      params: { name: 'dummy_tool', arguments: { a: 1 } },
      id: '1',
      jsonrpc: '2.0' as const,
    };

    const result = await registry.execute(request, {
      logger: new NoopLogger(),
      requestId: 'req-1',
    });
    assert.ok(Array.isArray(result.content));
    const text = result.content[0].text;
    const payload = JSON.parse(text) as { ok: boolean; input: { a: number }; id: string };
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.input.a, 1);
  });

  it('throws on validation failure', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DummyHandler());

    const request = {
      method: 'tools/call' as const,
      params: { name: 'dummy_tool', arguments: { invalid: true } },
      id: '2',
      jsonrpc: '2.0' as const,
    };

    await assert.rejects(
      () =>
        registry.execute(request, {
          logger: new NoopLogger(),
          requestId: 'req-2',
        }),
      /invalid input/
    );
  });

  it('throws for unknown tool', async () => {
    const registry = new ToolHandlerRegistry();
    const request = {
      method: 'tools/call' as const,
      params: { name: 'no_such_tool', arguments: {} },
      id: '3',
      jsonrpc: '2.0' as const,
    };
    await assert.rejects(
      () =>
        registry.execute(request, {
          logger: new NoopLogger(),
          requestId: 'req-3',
        }),
      /Unknown tool/
    );
  });
});

