#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { ResponseBuilder } from '../../src/common/response-builder.js';
import {
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../../src/infrastructure/protocol-constants.js';
import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { ResourceHandlerRegistry } from '../../src/server/resource-handler.js';
import { GOVERNED_TOOL_NAMES } from '../../src/infrastructure/protocol-governance.js';
import { buildToolDefinitions, buildEnhancedMetadata } from '../../src/server/tool-builder.js';
import { ToolHandlerRegistry } from '../../src/server/tool-handler.js';
import { TOOL_OUTPUT_SCHEMAS } from '../../src/server/generated/tool-output-schemas.js';
import { MCP_ASYNC_CONTROL_TOOLS } from '../../src/server/async-tool-workflow.js';

describe('protocol capabilities', () => {
  it('omits listChanged until MCP_LIST_CHANGED_ENABLED=true', () => {
    const disabled = buildServerCapabilities(
      resolveProtocolFeatureFlags({ MCP_LIST_CHANGED_ENABLED: 'false' }),
    );
    assert.equal(disabled.tools?.listChanged, undefined);
    assert.equal(disabled.resources?.listChanged, undefined);
    assert.equal(disabled.prompts?.listChanged, undefined);

    const enabled = buildServerCapabilities(
      resolveProtocolFeatureFlags({ MCP_LIST_CHANGED_ENABLED: 'true' }),
    );
    assert.equal(enabled.tools?.listChanged, true);
    assert.equal(enabled.resources?.listChanged, true);
    assert.equal(enabled.prompts?.listChanged, true);
  });

  it('advertises logging by default and omits sampling until enabled', () => {
    const flags = resolveProtocolFeatureFlags({});
    const capabilities = buildServerCapabilities(flags);

    assert.ok(capabilities.logging);
    assert.equal(capabilities.sampling, undefined);
    assert.ok(capabilities.resources?.subscribe);
  });

  it('advertises sampling only when SAMPLING_ENABLED=true', () => {
    const capabilities = buildServerCapabilities(
      resolveProtocolFeatureFlags({ SAMPLING_ENABLED: 'true' }),
    );

    assert.ok(capabilities.sampling);
  });

  it('omits resource subscriptions when MCP_RESOURCE_SUBSCRIPTIONS=false', () => {
    const capabilities = buildServerCapabilities(
      resolveProtocolFeatureFlags({ MCP_RESOURCE_SUBSCRIPTIONS: 'false' }),
    );

    assert.equal(capabilities.resources?.subscribe, undefined);
  });
});

describe('resource templates', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('exposes URI templates for every registered resource handler', () => {
    const registry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const templates = registry.getAllResourceTemplates();

    assert.ok(templates.length >= 7);
    assert.ok(templates.every((template) => template.uriTemplate.includes('courtlistener://')));
    assert.ok(templates.every((template) => template.name.length > 0));
  });
});

describe('ResponseBuilder best-practice formatting', () => {
  it('uses summary markdown in text content and structured payload separately', () => {
    const result = ResponseBuilder.success({
      summary: 'Found 2 matching opinions.',
      results: [{ id: 1 }, { id: 2 }],
    });

    assert.equal(result.content[0]?.type, 'text');
    assert.equal((result.content[0] as { text: string }).text, 'Found 2 matching opinions.');
    assert.deepEqual(result.structuredContent, {
      success: true,
      data: {
        summary: 'Found 2 matching opinions.',
        results: [{ id: 1 }, { id: 2 }],
      },
    });
  });

  it('includes structuredContent on error responses', () => {
    const result = ResponseBuilder.error('Case not found', { caseId: '123' });

    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /Case not found/);
    assert.deepEqual(result.structuredContent, {
      success: false,
      error: 'Case not found',
      details: { caseId: '123' },
    });
  });
});

describe('tool output schemas', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('generates outputSchema for every governed tool and async control tool', () => {
    for (const toolName of GOVERNED_TOOL_NAMES) {
      const schema = TOOL_OUTPUT_SCHEMAS[toolName];
      assert.ok(schema, `missing output schema for governed tool: ${toolName}`);
      assert.equal(schema.type, 'object');
      assert.ok(schema.properties.success);
      assert.ok(schema.properties.data);
    }

    for (const toolName of Object.values(MCP_ASYNC_CONTROL_TOOLS)) {
      const schema = TOOL_OUTPUT_SCHEMAS[toolName];
      assert.ok(schema, `missing output schema for async control tool: ${toolName}`);
      assert.equal(schema.type, 'object');
    }
  });

  it('attaches outputSchema on every tool returned by buildToolDefinitions', () => {
    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const tools = buildToolDefinitions(toolRegistry, buildEnhancedMetadata());

    assert.ok(tools.length >= GOVERNED_TOOL_NAMES.length);
    for (const tool of tools) {
      assert.ok(
        tool.outputSchema,
        `buildToolDefinitions must attach outputSchema for ${tool.name}`,
      );
      assert.equal(tool.outputSchema.type, 'object');
    }
  });
});
