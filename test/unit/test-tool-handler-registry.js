#!/usr/bin/env node

import { describe, it } from 'node:test';
import assert from 'node:assert';

const { ToolHandlerRegistry, BaseToolHandler } = await import('../../dist/server/tool-handler.js');

class DummyHandler extends BaseToolHandler {
  name = 'dummy_tool';
  description = 'A dummy tool';
  category = 'test';
  validate(input) {
    if (input && input.invalid) {
      return { success: false, error: new Error('invalid input') };
    }
    return { success: true, data: input || {} };
  }
  async execute(input, context) {
    return this.success({ ok: true, input, id: context.requestId });
  }
  getSchema() {
    return { type: 'object', properties: { invalid: { type: 'boolean' } } };
  }
}

class NoopLogger {
  info() {}
  debug() {}
  warn() {}
  error() {}
}

describe('ToolHandlerRegistry', () => {
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
      method: 'tools/call',
      params: { name: 'dummy_tool', arguments: { a: 1 } },
      id: '1',
      jsonrpc: '2.0'
    };

    const result = await registry.execute(request, { logger: new NoopLogger(), requestId: 'req-1' });
    assert.ok(Array.isArray(result.content));
    const text = result.content[0].text;
    const payload = JSON.parse(text);
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.input.a, 1);
  });

  it('throws on validation failure', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DummyHandler());

    const request = {
      method: 'tools/call',
      params: { name: 'dummy_tool', arguments: { invalid: true } },
      id: '2',
      jsonrpc: '2.0'
    };

    await assert.rejects(() => registry.execute(request, { logger: new NoopLogger(), requestId: 'req-2' }), /invalid input/);
  });

  it('throws for unknown tool', async () => {
    const registry = new ToolHandlerRegistry();
    const request = { method: 'tools/call', params: { name: 'no_such_tool', arguments: {} }, id: '3', jsonrpc: '2.0' };
    await assert.rejects(() => registry.execute(request, { logger: new NoopLogger(), requestId: 'req-3' }), /Unknown tool/);
  });
});
