#!/usr/bin/env node

/**
 * 🧪 Tool Definition Contract Tests
 * Ensures critical tool schemas stay aligned with handler expectations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Tool definitions are consumed at runtime from the compiled distribution.
const { getEnhancedToolDefinitions } = await import('../../dist/tool-definitions.js');

describe('Tool definition schema integrity', () => {
	it('should require the docket field for get_docket_entries', () => {
		const toolDefinitions = getEnhancedToolDefinitions();

		const docketEntriesTool = toolDefinitions.find(
			(tool) => tool.name === 'get_docket_entries'
		);

		assert.ok(docketEntriesTool, 'get_docket_entries tool should exist');

		const { inputSchema } = docketEntriesTool;
		assert.ok(inputSchema, 'Tool must expose an input schema');

		assert.ok(
			inputSchema.properties?.docket,
			'Input schema should include a docket property'
		);

		assert.strictEqual(
			inputSchema.properties.docket.description.includes('Docket ID'),
			true,
			'docket property should describe docket identifier input'
		);

		assert.deepStrictEqual(
			inputSchema.required,
			['docket'],
			'docket must be the only required field'
		);

		assert.strictEqual(
			Object.prototype.hasOwnProperty.call(inputSchema.properties, 'docket_id'),
			false,
			'Legacy docket_id property should be removed from schema'
		);
	});
});

