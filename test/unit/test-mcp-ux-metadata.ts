#!/usr/bin/env node

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import { BestPracticeLegalMCPServer } from '../../src/server/best-practice-server.js';
import { PromptHandlerRegistry } from '../../src/server/prompt-handler.js';
import { ResourceHandlerRegistry } from '../../src/server/resource-handler.js';
import { MCP_ASYNC_CONTROL_TOOLS } from '../../src/server/async-tool-workflow.js';

type ToolUxMeta = {
  title?: string;
  category?: string;
  complexity?: string;
  async?: boolean;
  costHint?: string;
  rateLimitWeight?: number;
};

describe('MCP protocol UX metadata', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('returns complete tool UX metadata without breaking legacy fields', async () => {
    const server = new BestPracticeLegalMCPServer();
    try {
      const result = await server.listTools();
      const tools = result.tools as Tool[];

      assert.ok(tools.length > 0);
      for (const tool of tools) {
        assert.equal(typeof tool.name, 'string');
        assert.equal(typeof tool.description, 'string');
        assert.equal(typeof tool.title, 'string');

        const uxMeta = ((tool._meta as Record<string, unknown> | undefined)?.['courtlistener/ux'] ??
          null) as ToolUxMeta | null;
        assert.ok(uxMeta, `Tool ${tool.name} should include courtlistener/ux metadata`);
        assert.equal(typeof uxMeta?.title, 'string');
        assert.equal(typeof uxMeta?.category, 'string');
        assert.equal(typeof uxMeta?.complexity, 'string');
        assert.equal(typeof uxMeta?.async, 'boolean');
        assert.equal(typeof uxMeta?.costHint, 'string');
        assert.equal(typeof uxMeta?.rateLimitWeight, 'number');

        if (Object.values(MCP_ASYNC_CONTROL_TOOLS).includes(tool.name)) {
          assert.equal(uxMeta?.async, false, `${tool.name} should be marked sync-only control`);
        } else {
          assert.equal(uxMeta?.async, true, `${tool.name} should support optional async execution`);
        }
      }
    } finally {
      await server.stop();
    }
  });

  it('adds prompt discoverability tags and examples', () => {
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const prompts = promptRegistry.getAllPrompts();
    assert.ok(prompts.length > 0);

    for (const prompt of prompts) {
      assert.equal(typeof prompt.title, 'string');
      const discoverability = (
        (prompt._meta as Record<string, unknown> | undefined)?.['courtlistener/discoverability'] ?? null
      ) as { tags?: unknown[]; examples?: unknown[] } | null;
      assert.ok(discoverability, `${prompt.name} should include discoverability metadata`);
      assert.ok(Array.isArray(discoverability?.tags));
      assert.ok((discoverability?.tags?.length ?? 0) > 0);
      assert.ok(Array.isArray(discoverability?.examples));
      assert.ok((discoverability?.examples?.length ?? 0) > 0);
    }
  });

  it('adds resource discoverability tags and examples', () => {
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const resources = resourceRegistry.getAllResources();
    assert.ok(resources.length > 0);

    for (const resource of resources) {
      assert.equal(typeof resource.title, 'string');
      const discoverability = (
        (resource._meta as Record<string, unknown> | undefined)?.['courtlistener/discoverability'] ?? null
      ) as { tags?: unknown[]; examples?: unknown[] } | null;
      assert.ok(discoverability, `${resource.uri} should include discoverability metadata`);
      assert.ok(Array.isArray(discoverability?.tags));
      assert.ok((discoverability?.tags?.length ?? 0) > 0);
      assert.ok(Array.isArray(discoverability?.examples));
      assert.ok((discoverability?.examples?.length ?? 0) > 0);
    }
  });
});
