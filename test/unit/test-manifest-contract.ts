#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { bootstrapServices } from '../../src/infrastructure/bootstrap.js';
import { container } from '../../src/infrastructure/container.js';
import { CacheManager } from '../../src/infrastructure/cache.js';
import {
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../../src/infrastructure/protocol-constants.js';
import { GOVERNED_TOOL_NAMES } from '../../src/infrastructure/protocol-governance.js';
import { MCP_SERVER_INSTRUCTIONS } from '../../src/infrastructure/mcp-server-instructions.js';
import { MCP_ASYNC_CONTROL_TOOLS } from '../../src/server/async-tool-workflow.js';
import { buildEnhancedMetadata, buildToolDefinitions } from '../../src/server/tool-builder.js';
import { ToolHandlerRegistry } from '../../src/server/tool-handler.js';

const EXPECTED_OUTPUT_SCHEMA_TOOL_COUNT =
  GOVERNED_TOOL_NAMES.length + Object.keys(MCP_ASYNC_CONTROL_TOOLS).length;

describe('manifest contract', () => {
  before(() => {
    bootstrapServices();
  });

  after(() => {
    const cache = container.get<CacheManager>('cache');
    cache.destroy();
    container.clearAll();
  });

  it('builds tool definitions with outputSchema for every governed and async control tool', () => {
    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const tools = buildToolDefinitions(toolRegistry, buildEnhancedMetadata());
    const withOutputSchema = tools.filter((tool) => tool.outputSchema);

    assert.equal(
      withOutputSchema.length,
      EXPECTED_OUTPUT_SCHEMA_TOOL_COUNT,
      `expected outputSchema on ${EXPECTED_OUTPUT_SCHEMA_TOOL_COUNT} tools`,
    );

    for (const toolName of GOVERNED_TOOL_NAMES) {
      const tool = tools.find((entry) => entry.name === toolName);
      assert.ok(tool?.outputSchema, `${toolName} must expose outputSchema`);
    }

    for (const toolName of Object.values(MCP_ASYNC_CONTROL_TOOLS)) {
      const tool = tools.find((entry) => entry.name === toolName);
      assert.ok(tool?.outputSchema, `${toolName} must expose outputSchema`);
    }
  });

  it('matches committed manifest.json protocol metadata when manifest is regenerated', () => {
    const manifestPath = path.resolve(process.cwd(), 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      server?: { instructions?: string };
      protocol?: { capabilities?: ReturnType<typeof buildServerCapabilities> };
      capabilities?: {
        tools?: { tools?: Array<{ outputSchema?: unknown }> };
      };
    };

    if (!manifest.protocol) {
      assert.fail(
        'manifest.json is missing protocol metadata; run pnpm run generate:manifest and commit the result',
      );
    }

    assert.equal(manifest.server?.instructions, MCP_SERVER_INSTRUCTIONS);
    assert.deepEqual(
      JSON.parse(JSON.stringify(manifest.protocol.capabilities)),
      JSON.parse(JSON.stringify(buildServerCapabilities(resolveProtocolFeatureFlags()))),
    );

    const manifestToolsWithSchema =
      manifest.capabilities?.tools?.tools?.filter((tool) => tool.outputSchema).length ?? 0;
    assert.equal(
      manifestToolsWithSchema,
      EXPECTED_OUTPUT_SCHEMA_TOOL_COUNT,
      'manifest tool outputSchema count must match governed tool contract',
    );

    const readme = fs.readFileSync(path.resolve(process.cwd(), 'README.md'), 'utf8');
    assert.match(
      readme,
      new RegExp(`- ${manifestToolsWithSchema} governed tools,`),
      'README governed-tool summary must match the committed manifest',
    );
    assert.match(
      readme,
      new RegExp(`## Tool Catalog \\(${manifestToolsWithSchema}\\)`),
      'README tool catalog heading must match the committed manifest',
    );
  });
});
