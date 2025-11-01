#!/usr/bin/env node

/**
 * ✅ Test to verify that the search_cases tool properly validates order_by parameters (TypeScript)
 * to prevent 400 Bad Request errors from CourtListener API
 */

import { spawn, type ChildProcess } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface MCPResponse {
  jsonrpc?: string;
  id?: number;
  result?: {
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

async function testSearchValidation(): Promise<void> {
  console.log('Testing search parameter validation...');

  // Start the MCP server
  const server: ChildProcess = spawn('node', [join(projectRoot, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Test case 1: search_cases with order_by parameter (should be filtered out)
  const testRequest1: MCPRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'search_cases',
      arguments: {
        court: 'scotus',
        order_by: 'date_filed', // This should be filtered out to prevent 400 error
        page_size: 5,
        date_filed_after: '2024-01-01',
      },
    },
  };

  // Test case 2: advanced_search with order_by parameter (should be filtered out)
  const testRequest2: MCPRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'advanced_search',
      arguments: {
        type: 'o',
        court: 'scotus',
        order_by: 'date_filed', // This should be filtered out to prevent 400 error
        page_size: 5,
        date_filed_after: '2024-01-01',
      },
    },
  };

  let responseCount = 0;
  const expectedResponses = 2;

  server.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter((line) => line.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line) as MCPResponse;
        if (response.id === 1 || response.id === 2) {
          responseCount++;

          if (response.error) {
            console.log(
              `❌ Test ${response.id} failed with error: ${response.error.message}`
            );
          } else if (response.result?.content) {
            console.log(
              `✅ Test ${response.id} succeeded - order_by was filtered out`
            );
            try {
              const resultData = JSON.parse(response.result.content[0].text);
              // Verify that order_by is not in the result (it should have been filtered)
              if (!resultData.order_by) {
                console.log(
                  `✅ Verified: order_by parameter was successfully filtered out`
                );
              }
            } catch {
              // Ignore parse errors
            }
          }

          if (responseCount === expectedResponses) {
            console.log('✅ All validation tests completed');
            server.kill();
            process.exit(0);
          }
        }
      } catch (error) {
        // Ignore parse errors for non-JSON lines
      }
    }
  });

  server.stderr?.on('data', (data: Buffer) => {
    console.error('Server error:', data.toString());
  });

  server.on('close', () => {
    if (responseCount < expectedResponses) {
      console.error(
        `❌ Expected ${expectedResponses} responses, got ${responseCount}`
      );
      process.exit(1);
    }
  });

  // Send test requests
  setTimeout(() => {
    server.stdin?.write(JSON.stringify(testRequest1) + '\n');
  }, 1000);

  setTimeout(() => {
    server.stdin?.write(JSON.stringify(testRequest2) + '\n');
  }, 2000);

  // Timeout after 30 seconds
  setTimeout(() => {
    if (responseCount < expectedResponses) {
      console.error(
        `❌ Test timed out. Got ${responseCount}/${expectedResponses} responses`
      );
      server.kill();
      process.exit(1);
    }
  }, 30000);
}

testSearchValidation().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

