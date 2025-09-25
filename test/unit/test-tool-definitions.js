#!/usr/bin/env node

/**
 * 🧪 Tool Definition Contract Tests
 * Ensures critical tool schemas stay aligned with handler expectations.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// Tool definitions are consumed at runtime from the compiled distribution.
const { getEnhancedToolDefinitions, getToolsByCategory, getToolExamples } = await import(
  '../../dist/tool-definitions.js'
);

describe('Tool definition schema integrity', () => {
  it('should require the docket field for get_docket_entries', () => {
    const toolDefinitions = getEnhancedToolDefinitions();

    const docketEntriesTool = toolDefinitions.find(tool => tool.name === 'get_docket_entries');

    assert.ok(docketEntriesTool, 'get_docket_entries tool should exist');

    const { inputSchema } = docketEntriesTool;
    assert.ok(inputSchema, 'Tool must expose an input schema');

    assert.ok(inputSchema.properties?.docket, 'Input schema should include a docket property');

    assert.strictEqual(
      inputSchema.properties.docket.description.includes('Docket ID'),
      true,
      'docket property should describe docket identifier input'
    );

    assert.deepStrictEqual(inputSchema.required, ['docket'], 'docket must be the only required field');

    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(inputSchema.properties, 'docket_id'),
      false,
      'Legacy docket_id property should be removed from schema'
    );
  });

  it('should group tools by category correctly', () => {
    const toolDefinitions = getEnhancedToolDefinitions();
    const byCategory = getToolsByCategory();

    // Every tool's category should exist as a key and include the tool
    for (const tool of toolDefinitions) {
      assert.ok(byCategory[tool.category], `Category ${tool.category} should exist`);
      const names = byCategory[tool.category].map(t => t.name);
      assert.ok(
        names.includes(tool.name),
        `Category ${tool.category} should include tool ${tool.name}`
      );
    }
  });

  it('should provide stringified example code for tools with examples', () => {
    const toolDefinitions = getEnhancedToolDefinitions();
    const examplesMap = getToolExamples();

    // At least one known tool should have examples with code as string
    const withExamples = toolDefinitions.filter(t => Array.isArray(t.examples) && t.examples.length > 0);
    assert.ok(withExamples.length > 0, 'There should be tools with examples');

    for (const tool of withExamples) {
      const examples = examplesMap[tool.name];
      assert.ok(Array.isArray(examples), `Examples for ${tool.name} should be an array`);
      for (const ex of examples) {
        assert.strictEqual(typeof ex.description, 'string', 'Example description should be a string');
        assert.strictEqual(typeof ex.code, 'string', 'Example code should be a stringified JSON');
      }
    }
  });
});
