#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Tool Definitions (TypeScript)
 * Tests tool definition schema integrity and consistency
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Tool definitions are consumed at runtime from the compiled distribution.
const {
  getEnhancedToolDefinitions,
  getToolsByCategory,
  getToolExamples,
} = await import('../../dist/tool-definitions.js');

interface ToolExample {
  description: string;
  code: string;
}

interface ToolDefinition extends Tool {
  category?: string;
  examples?: ToolExample[];
}

describe('Tool definition schema integrity (TypeScript)', () => {
  it('should require the docket field for get_docket_entries', () => {
    const toolDefinitions = getEnhancedToolDefinitions() as ToolDefinition[];

    const docketEntriesTool = toolDefinitions.find(
      (tool) => tool.name === 'get_docket_entries'
    );

    assert.ok(docketEntriesTool, 'get_docket_entries tool should exist');

    const { inputSchema } = docketEntriesTool;
    assert.ok(inputSchema, 'Tool must expose an input schema');
    assert.ok(
      inputSchema &&
        typeof inputSchema === 'object' &&
        'properties' in inputSchema &&
        inputSchema.properties
    );

    const properties = inputSchema.properties as Record<string, unknown>;
    assert.ok(
      'docket' in properties,
      'Input schema should include a docket property'
    );

    const docketProperty = properties.docket as { description?: string };
    if (docketProperty?.description) {
      assert.ok(
        docketProperty.description.includes('Docket') ||
          docketProperty.description.includes('docket'),
        'docket property should describe docket identifier input'
      );
    }

    if (inputSchema && typeof inputSchema === 'object' && 'required' in inputSchema) {
      const required = inputSchema.required as string[] | undefined;
      if (required) {
        assert.ok(
          required.includes('docket'),
          'docket must be a required field'
        );
      }
    }

    // Check that legacy docket_id is not present
    assert.ok(
      !('docket_id' in properties) || properties.docket_id === undefined,
      'Legacy docket_id property should be removed from schema'
    );
  });

  it('should group tools by category correctly', () => {
    const toolDefinitions = getEnhancedToolDefinitions() as ToolDefinition[];
    const byCategory = getToolsByCategory();

    // Every tool's category should exist as a key and include the tool
    for (const tool of toolDefinitions) {
      const category = tool.category || 'uncategorized';
      assert.ok(byCategory[category], `Category ${category} should exist`);
      const names = byCategory[category].map((t) => t.name);
      assert.ok(
        names.includes(tool.name),
        `Category ${category} should include tool ${tool.name}`
      );
    }
  });

  it('should provide stringified example code for tools with examples', () => {
    const toolDefinitions = getEnhancedToolDefinitions() as ToolDefinition[];
    const examplesMap = getToolExamples() as Record<string, ToolExample[]>;

    // At least one known tool should have examples with code as string
    const withExamples = toolDefinitions.filter(
      (t) => Array.isArray(t.examples) && t.examples.length > 0
    );
    assert.ok(withExamples.length > 0, 'There should be tools with examples');

    for (const tool of withExamples) {
      const examples = examplesMap[tool.name];
      assert.ok(Array.isArray(examples), `Examples for ${tool.name} should be an array`);
      for (const ex of examples) {
        assert.strictEqual(
          typeof ex.description,
          'string',
          'Example description should be a string'
        );
        assert.strictEqual(
          typeof ex.code,
          'string',
          'Example code should be a stringified JSON'
        );
      }
    }
  });

  it('should have consistent input schema types', () => {
    const toolDefinitions = getEnhancedToolDefinitions() as ToolDefinition[];

    for (const tool of toolDefinitions) {
      assert.ok(tool.inputSchema, `Tool ${tool.name} must have an inputSchema`);

      if (tool.inputSchema && typeof tool.inputSchema === 'object') {
        assert.ok(
          'type' in tool.inputSchema || 'properties' in tool.inputSchema,
          `Tool ${tool.name} inputSchema should have type or properties`
        );
      }
    }
  });

  it('should have valid tool names and descriptions', () => {
    const toolDefinitions = getEnhancedToolDefinitions() as ToolDefinition[];

    for (const tool of toolDefinitions) {
      assert.ok(typeof tool.name === 'string', `Tool should have a name`);
      assert.ok(tool.name.length > 0, `Tool name should not be empty`);
      assert.ok(typeof tool.description === 'string', `Tool ${tool.name} should have a description`);
      assert.ok(tool.description.length > 0, `Tool ${tool.name} description should not be empty`);
    }
  });
});

