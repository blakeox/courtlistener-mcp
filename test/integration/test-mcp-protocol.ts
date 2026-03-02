#!/usr/bin/env node

/**
 * ✅ MCP Server Validation Test Suite (TypeScript)
 * - Uses HTTP MCP transport when SERVER_URL is provided
 * - Falls back to local stdio MCP transport otherwise
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

const SERVER_URL = process.env.SERVER_URL?.trim();
const MCP_REMOTE_BEARER_TOKEN = process.env.MCP_REMOTE_BEARER_TOKEN?.trim();

interface MCPResponse {
  jsonrpc?: string;
  id?: number;
  result?: {
    serverInfo?: { name?: string; version?: string };
    tools?: unknown[];
    resources?: unknown[];
    prompts?: unknown[];
    content?: unknown[];
  };
  error?: {
    code?: number;
    message?: string;
  };
}

interface TestCase {
  name: string;
  payload: {
    jsonrpc: string;
    id: number;
    method: string;
    params?: {
      protocolVersion?: string;
      capabilities?: Record<string, unknown>;
      clientInfo?: Record<string, string>;
      name?: string;
      arguments?: Record<string, unknown>;
    };
  };
  validate: (
    result: unknown,
    response?: { error?: { code?: number; message?: string } },
  ) => boolean;
}

function buildMcpRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2024-11-05',
  };
  if (MCP_REMOTE_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${MCP_REMOTE_BEARER_TOKEN}`;
  }
  return headers;
}

function getTests(): TestCase[] {
  return [
    {
      name: 'Initialize Protocol',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'Test Client', version: '1.0.0' },
        },
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'serverInfo' in result &&
          typeof (result as { serverInfo?: { name?: string } }).serverInfo?.name === 'string'
        );
      },
    },
    {
      name: 'List Available Tools',
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'tools' in result &&
          Array.isArray((result as { tools?: unknown[] }).tools) &&
          ((result as { tools?: unknown[] }).tools?.length || 0) >= 6
        );
      },
    },
    {
      name: 'List Resources',
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'resources' in result &&
          Array.isArray((result as { resources?: unknown[] }).resources)
        );
      },
    },
    {
      name: 'List Prompts',
      payload: {
        jsonrpc: '2.0',
        id: 4,
        method: 'prompts/list',
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'prompts' in result &&
          Array.isArray((result as { prompts?: unknown[] }).prompts)
        );
      },
    },
    {
      name: 'List Federal Courts',
      payload: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'list_courts',
          arguments: { jurisdiction: 'F' },
        },
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'content' in result &&
          Array.isArray((result as { content?: unknown[] }).content) &&
          ((result as { content?: unknown[] }).content?.length || 0) > 0
        );
      },
    },
    {
      name: 'Search Privacy Cases',
      payload: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'search_cases',
          arguments: {
            query: 'privacy rights',
            court: 'scotus',
            page_size: 3,
          },
        },
      },
      validate: (result) => {
        return (
          typeof result === 'object' &&
          result !== null &&
          'content' in result &&
          Array.isArray((result as { content?: unknown[] }).content) &&
          ((result as { content?: unknown[] }).content?.length || 0) > 0
        );
      },
    },
    {
      name: 'Invalid Method Test',
      payload: {
        jsonrpc: '2.0',
        id: 7,
        method: 'invalid/method',
      },
      validate: (_result, response) => {
        return (
          response !== undefined && response.error !== undefined && response.error.code === -32601
        );
      },
    },
  ];
}

async function sendHttpRequest(payload: object): Promise<{ ok: boolean; response: MCPResponse | null }> {
  if (!SERVER_URL) {
    throw new Error('SERVER_URL is required for HTTP transport');
  }

  const response = await fetch(SERVER_URL, {
    method: 'POST',
    headers: buildMcpRequestHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.log(`  ❌ HTTP Error: ${response.status} ${response.statusText}`);
    return { ok: false, response: null };
  }

  const jsonResponse = (await response.json()) as MCPResponse;
  return { ok: true, response: jsonResponse };
}

function createStdioClient(): {
  server: ChildProcess;
  send: (payload: { id: number; [key: string]: unknown }) => Promise<MCPResponse>;
  close: () => void;
} {
  const server = spawn('node', [join(projectRoot, 'dist/index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: projectRoot,
  });

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
        const parsed = JSON.parse(trimmed) as MCPResponse;
        if (typeof parsed.id === 'number') {
          const resolve = pending.get(parsed.id);
          if (resolve) {
            pending.delete(parsed.id);
            resolve(parsed);
          }
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  });

  server.stderr?.on('data', () => {
    // Server logs to stderr; keep output clean for test status lines.
  });

  const send = (payload: { id: number; [key: string]: unknown }): Promise<MCPResponse> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(payload.id);
        reject(new Error(`Timeout waiting for response to request id=${payload.id}`));
      }, 10000);

      pending.set(payload.id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      server.stdin?.write(JSON.stringify(payload) + '\n');
    });
  };

  const close = (): void => {
    server.kill('SIGTERM');
  };

  return { server, send, close };
}

async function testMCPServer(): Promise<boolean> {
  console.log('🧪 Testing Legal MCP Server');
  console.log('============================\n');
  console.log(SERVER_URL ? `Transport: HTTP (${SERVER_URL})\n` : 'Transport: Local stdio (dist/index.js)\n');

  const tests = getTests();
  let passed = 0;
  const total = tests.length;

  if (SERVER_URL) {
    for (const test of tests) {
      console.log(`🔍 Testing: ${test.name}`);
      try {
        const { ok, response } = await sendHttpRequest(test.payload);
        if (!ok || response === null) {
          continue;
        }

        if (test.validate(response.result, response)) {
          console.log('  ✅ PASSED');
          passed++;
          if (response.result?.tools && Array.isArray(response.result.tools)) {
            console.log(`     📋 Found ${response.result.tools.length} tools`);
          }
          if (response.result?.serverInfo) {
            console.log(
              `     🖥️ Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}`,
            );
          }
          if (response.error) {
            console.log(`     ⚠️ Expected error: ${response.error.message}`);
          }
        } else {
          console.log('  ❌ FAILED - Validation failed');
          console.log('     Response:', JSON.stringify(response, null, 2));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`  ❌ FAILED - ${errorMessage}`);
      }
    }
  } else {
    const client = createStdioClient();

    try {
      for (const test of tests) {
        console.log(`🔍 Testing: ${test.name}`);
        try {
          const response = await client.send(test.payload);
          if (test.validate(response.result, response)) {
            console.log('  ✅ PASSED');
            passed++;
            if (response.result?.tools && Array.isArray(response.result.tools)) {
              console.log(`     📋 Found ${response.result.tools.length} tools`);
            }
            if (response.result?.serverInfo) {
              console.log(
                `     🖥️ Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}`,
              );
            }
            if (response.error) {
              console.log(`     ⚠️ Expected error: ${response.error.message}`);
            }
          } else {
            console.log('  ❌ FAILED - Validation failed');
            console.log('     Response:', JSON.stringify(response, null, 2));
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`  ❌ FAILED - ${errorMessage}`);
        }
      }
    } finally {
      client.close();
    }
  }

  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All tests passed! MCP server is working correctly.');
    return true;
  }

  console.log('⚠️ Some tests failed. Please check the server implementation.');
  return false;
}

async function testSpecificFunction(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<boolean> {
  console.log(`\n🎯 Testing specific function: ${toolName}`);

  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  try {
    if (SERVER_URL) {
      const { ok, response } = await sendHttpRequest(payload);
      if (!ok || response === null) {
        return false;
      }
      if (response.error) {
        console.log(`❌ Error: ${response.error.message}`);
        return false;
      }
      console.log('✅ Success!');
      console.log('Response:', JSON.stringify(response.result, null, 2));
      return true;
    }

    const client = createStdioClient();
    try {
      const response = await client.send(payload);
      if (response.error) {
        console.log(`❌ Error: ${response.error.message}`);
        return false;
      }
      console.log('✅ Success!');
      console.log('Response:', JSON.stringify(response.result, null, 2));
      return true;
    } finally {
      client.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`❌ Failed: ${errorMessage}`);
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length > 0 && args[0] === 'test-tool') {
    const toolName = args[1] || 'list_courts';
    const toolArgs = args[2] ? (JSON.parse(args[2]) as Record<string, unknown>) : {};
    const ok = await testSpecificFunction(toolName, toolArgs);
    process.exit(ok ? 0 : 1);
  } else {
    const success = await testMCPServer();
    process.exit(success ? 0 : 1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error running tests:', error);
    process.exit(1);
  });
}
