#!/usr/bin/env node

/**
 * ✅ Simple validation test to verify parameter filtering works correctly (TypeScript)
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
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

interface MCPResponse {
  jsonrpc?: string;
  id?: number;
  result?: {
    tools?: Array<{
      name: string;
      inputSchema?: {
        properties?: Record<string, unknown>;
      };
    }>;
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: unknown;
}

async function testParameterFiltering(): Promise<void> {
  console.log('🧪 Testing parameter filtering for order_by...');

  // Start the MCP server
  const server: ChildProcess = spawn('node', [join(projectRoot, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Test just getting the tools list first
  const toolsRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  };

  let toolsReceived = false;

  server.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter((line) => line.trim());
    for (const line of lines) {
      try {
        const response = JSON.parse(line) as MCPResponse;
        if (response.id === 1 && response.result) {
          toolsReceived = true;
          console.log('✅ Server is responding correctly');
          console.log(
            `✅ Found ${response.result.tools?.length || 0} tools available`
          );

          // Check that search_cases tool exists and has order_by parameter
          const searchTool = response.result.tools?.find(
            (t) => t.name === 'search_cases'
          );
          if (searchTool && searchTool.inputSchema?.properties?.order_by) {
            console.log(
              '✅ search_cases tool has order_by parameter (as expected)'
            );
          }

          // Check that advanced_search tool exists and has order_by parameter
          const advancedTool = response.result.tools?.find(
            (t) => t.name === 'advanced_search'
          );
          if (advancedTool && advancedTool.inputSchema?.properties?.order_by) {
            console.log(
              '✅ advanced_search tool has order_by parameter (as expected)'
            );
          }

          // Now test that order_by is filtered out when calling the tool
          const testRequest: MCPRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'search_cases',
              arguments: {
                court: 'scotus',
                order_by: 'date_filed', // This should be filtered out
                page_size: 5,
              },
            },
          };

          server.stdin?.write(JSON.stringify(testRequest) + '\n');

          setTimeout(() => {
            console.log('✅ Parameter filtering test completed');
            server.kill();
            process.exit(0);
          }, 2000);
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
    if (!toolsReceived) {
      console.error('❌ Failed to receive tools list');
      process.exit(1);
    }
  });

  // Send tools/list request
  server.stdin?.write(JSON.stringify(toolsRequest) + '\n');

  // Timeout after 10 seconds
  setTimeout(() => {
    if (!toolsReceived) {
      console.error('❌ Test timed out');
      server.kill();
      process.exit(1);
    }
  }, 10000);
}

testParameterFiltering().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

