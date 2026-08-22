#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { getLocalMcpServerRuntime } from '../helpers/local-mcp-runtime.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const localServerRuntime = getLocalMcpServerRuntime(projectRoot);

const SERVER_URL = process.env.SERVER_URL?.trim();
const MCP_REMOTE_BEARER_TOKEN = process.env.MCP_REMOTE_BEARER_TOKEN?.trim();
const MCP_PROTOCOL_VERSION = '2026-07-28';

interface McpSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    tools?: Array<{ name?: string }>;
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: {
      data?: SearchPayload;
    };
  };
  error?: {
    code?: number;
    message?: string;
  };
}

interface SearchPayload {
  summary?: string;
  results?: unknown[];
  search_parameters?: Record<string, unknown>;
}

function modernParams(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientCapabilities': { tools: {} },
      'io.modelcontextprotocol/clientInfo': {
        name: 'tariff-rulings-test',
        version: '1.0.0',
      },
    },
  };
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
  };

  if (MCP_REMOTE_BEARER_TOKEN) {
    headers.authorization = `Bearer ${MCP_REMOTE_BEARER_TOKEN}`;
  }

  return headers;
}

async function sendRemoteRequest(payload: Record<string, unknown>): Promise<McpSuccessResponse> {
  if (!SERVER_URL) {
    throw new Error('SERVER_URL is required for remote MCP tests.');
  }
  if (!MCP_REMOTE_BEARER_TOKEN) {
    throw new Error('MCP_REMOTE_BEARER_TOKEN is required for remote MCP tests.');
  }

  const response = await fetch(SERVER_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  assert.equal(response.ok, true, `Expected MCP HTTP 200, got ${response.status}`);
  const parsed = (await response.json()) as McpSuccessResponse;
  assert.equal(response.headers.get('mcp-session-id'), null);
  return parsed;
}

function createStdioClient(): {
  send: (payload: { id: number; [key: string]: unknown }) => Promise<McpSuccessResponse>;
  close: () => void;
} {
  const server: ChildProcess = spawn(localServerRuntime.command, localServerRuntime.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: projectRoot,
  });

  let buffer = '';
  const pending = new Map<number, (response: McpSuccessResponse) => void>();

  server.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as McpSuccessResponse;
        if (typeof parsed.id === 'number') {
          const resolve = pending.get(parsed.id);
          if (resolve) {
            pending.delete(parsed.id);
            resolve(parsed);
          }
        }
      } catch {
        // ignore non-JSON log lines
      }
    }
  });

  const send = (payload: { id: number; [key: string]: unknown }): Promise<McpSuccessResponse> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(payload.id);
        reject(new Error(`Timeout waiting for MCP response id=${payload.id}`));
      }, 15_000);

      pending.set(payload.id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      server.stdin?.write(JSON.stringify(payload) + '\n');
    });

  return {
    send,
    close: () => server.kill('SIGTERM'),
  };
}

async function createMcpClient() {
  const discoverPayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'server/discover',
    params: modernParams(),
  };

  if (SERVER_URL) {
    return {
      transport: 'remote' as const,
      send: sendRemoteRequest,
      close: () => {},
    };
  }

  const client = createStdioClient();
  const response = await client.send(discoverPayload);
  assert.ok(response.result, 'server/discover should return a result');
  return {
    transport: 'stdio' as const,
    send: client.send,
    close: client.close,
  };
}

function parseStructuredPayload(response: McpSuccessResponse): SearchPayload {
  assert.ok(!response.error, `Unexpected MCP error: ${response.error?.message ?? 'unknown'}`);
  const payload = response.result?.structuredContent?.data;
  assert.ok(payload, 'Expected structured MCP v2 tool output');
  return payload;
}

describe('MCP tariff rulings workflow', () => {
  it('lists the search tools needed for tariff ruling discovery', async () => {
    const client = await createMcpClient();

    try {
      const response = await client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: modernParams(),
      });

      assert.ok(!response.error, `Unexpected MCP error: ${response.error?.message ?? 'unknown'}`);
      const toolNames = (response.result?.tools ?? []).map((tool) => tool.name);
      assert.ok(toolNames.includes('search_cases'));
      assert.ok(toolNames.includes('search_opinions'));
    } finally {
      client.close();
    }
  });

  it('returns structured results for a tariff-focused opinions search', async () => {
    const client = await createMcpClient();

    try {
      const response = await client.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: modernParams({
          name: 'search_opinions',
          arguments: {
            query: 'tariff',
            date_filed_after: '2024-01-01',
            page_size: 5,
            __mcp_async: { mode: 'sync' },
          },
        }),
      });

      const payload = parseStructuredPayload(response);
      assert.match(payload.summary ?? '', /Found \d+ opinions/i);
      assert.ok(Array.isArray(payload.results), 'Expected results array');
      assert.ok(
        (payload.results?.length ?? 0) > 0,
        'Expected at least one tariff-related opinion result',
      );
      assert.equal(payload.search_parameters?.query, 'tariff');
    } finally {
      client.close();
    }
  });
});
