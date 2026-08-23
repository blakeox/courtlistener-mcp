#!/usr/bin/env node

/**
 * ✅ Quick validation that search tool schemas keep their intended order_by contract.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocalMcpServerRuntime } from '../helpers/local-mcp-runtime.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const localServerRuntime = getLocalMcpServerRuntime(projectRoot);

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
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

function createStdioClient(server: ChildProcess) {
  let buffer = '';
  const pending = new Map<number, (response: MCPResponse) => void>();

  server.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const response = JSON.parse(trimmed) as MCPResponse;
        if (typeof response.id === 'number') {
          const resolve = pending.get(response.id);
          if (resolve) {
            pending.delete(response.id);
            resolve(response);
          }
        }
      } catch {
        // Ignore non-JSON log lines.
      }
    }
  });

  return {
    send(request: MCPRequest): Promise<MCPResponse> {
      const params = request.params ?? {};
      const modernRequest: MCPRequest = {
        ...request,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      };
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(modernRequest.id);
          reject(new Error(`Timeout waiting for response to request id=${modernRequest.id}`));
        }, 20000);

        pending.set(modernRequest.id, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });

        server.stdin?.write(JSON.stringify(modernRequest) + '\n');
      });
    },
  };
}

async function testParameterFiltering(): Promise<void> {
  console.log('🧪 Testing search tool schema order_by contracts...');

  const server: ChildProcess = spawn(localServerRuntime.command, localServerRuntime.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: projectRoot,
  });
  const client = createStdioClient(server);

  server.stderr?.on('data', () => {
    // Server logs to stderr; ignore them unless the request flow fails.
  });

  const discoveryRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'server/discover',
  };
  const toolsRequest: MCPRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  };

  try {
    const discoveryResponse = await client.send(discoveryRequest);
    if (!discoveryResponse.result) {
      throw new Error('Server discovery did not return a result payload.');
    }

    const toolsResponse = await client.send(toolsRequest);
    const tools = toolsResponse.result?.tools;
    if (!tools || tools.length === 0) {
      throw new Error('tools/list did not return any tools.');
    }

    console.log('✅ Server is responding correctly');
    console.log(`✅ Found ${tools.length} tools available`);

    const searchTool = tools.find((tool) => tool.name === 'search_cases');
    if (!searchTool) {
      throw new Error('search_cases tool is missing from tools/list.');
    }
    if (searchTool.inputSchema?.properties?.order_by) {
      throw new Error('search_cases unexpectedly exposes order_by in the public schema.');
    }
    console.log('✅ search_cases hides order_by from the public schema');

    const advancedTool = tools.find((tool) => tool.name === 'advanced_search');
    if (!advancedTool) {
      throw new Error('advanced_search tool is missing from tools/list.');
    }
    if (!advancedTool.inputSchema?.properties?.order_by) {
      throw new Error('advanced_search is missing order_by from the public schema.');
    }
    console.log('✅ advanced_search still exposes order_by in the public schema');

    console.log('✅ Quick validation completed');
    server.kill();
    process.exit(0);
  } catch (error) {
    console.error(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    server.kill();
    process.exit(1);
  }
}

testParameterFiltering().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
