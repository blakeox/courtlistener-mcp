#!/usr/bin/env node

/**
 * ✅ Debug Search Script (TypeScript)
 * Quick script to debug search functionality
 */

import { LegalMCPServer } from './dist/index.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

async function debugSearch(): Promise<void> {
  const server = new LegalMCPServer();

  const request: CallToolRequest = {
    method: 'tools/call',
    params: {
      name: 'search_cases',
      arguments: { citation: '410 U.S. 113', page_size: 1 },
    },
    id: 1,
    jsonrpc: '2.0',
  };

  const result = await server.handleToolCall(request.params);

  console.log('Search result structure:');
  console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
}

debugSearch().catch(console.error);

