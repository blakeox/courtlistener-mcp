#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

const SERVER_URL = process.env.SERVER_URL?.trim();
const MCP_REMOTE_BEARER_TOKEN = process.env.MCP_REMOTE_BEARER_TOKEN?.trim();
const MCP_PROTOCOL_VERSION = '2024-11-05';

interface McpSuccessResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    tools?: Array<{ name?: string }>;
    content?: Array<{ type?: string; text?: string }>;
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

function buildHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  if (MCP_REMOTE_BEARER_TOKEN) {
    headers.authorization = `Bearer ${MCP_REMOTE_BEARER_TOKEN}`;
  }

  return headers;
}

async function sendRemoteRequest(
  payload: Record<string, unknown>,
  sessionId?: string,
): Promise<{ response: McpSuccessResponse; sessionId: string | null }> {
  if (!SERVER_URL) {
    throw new Error('SERVER_URL is required for remote MCP tests.');
  }
  if (!MCP_REMOTE_BEARER_TOKEN) {
    throw new Error('MCP_REMOTE_BEARER_TOKEN is required for remote MCP tests.');
  }

  const response = await fetch(SERVER_URL, {
    method: 'POST',
    headers: buildHeaders(sessionId),
    body: JSON.stringify(payload),
  });

  assert.equal(response.ok, true, `Expected MCP HTTP 200, got ${response.status}`);
  const parsed = (await response.json()) as McpSuccessResponse;
  return {
    response: parsed,
    sessionId: response.headers.get('mcp-session-id'),
  };
}

function createStdioClient(): {
  send: (payload: { id: number; [key: string]: unknown }) => Promise<McpSuccessResponse>;
  close: () => void;
} {
  const server: ChildProcess = spawn('node', [join(projectRoot, 'dist/index.js')], {
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

async function initializeMcpSession() {
  const initializePayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: 'tariff-rulings-test', version: '1.0.0' },
    },
  };

  if (SERVER_URL) {
    const { response, sessionId } = await sendRemoteRequest(initializePayload);
    assert.ok(response.result, 'initialize should return a result');
    assert.ok(sessionId, 'remote initialize should return mcp-session-id');
    return {
      transport: 'remote' as const,
      sessionId,
      send: async (payload: { id: number; [key: string]: unknown }) => {
        const result = await sendRemoteRequest(payload, sessionId);
        return result.response;
      },
      close: () => {},
    };
  }

  const client = createStdioClient();
  const response = await client.send(initializePayload);
  assert.ok(response.result, 'initialize should return a result');
  return {
    transport: 'stdio' as const,
    sessionId: null,
    send: client.send,
    close: client.close,
  };
}

function parseToolText(response: McpSuccessResponse): SearchPayload {
  assert.ok(!response.error, `Unexpected MCP error: ${response.error?.message ?? 'unknown'}`);
  const content = response.result?.content;
  assert.ok(Array.isArray(content) && content.length > 0, 'Expected non-empty MCP content array');

  const textItem = content.find((item) => typeof item.text === 'string' && item.text.trim().startsWith('{'));
  assert.ok(textItem?.text, 'Expected JSON text content in tool response');

  return JSON.parse(textItem.text) as SearchPayload;
}

describe('MCP tariff rulings workflow', () => {
  it('lists the search tools needed for tariff ruling discovery', async () => {
    const client = await initializeMcpSession();

    try {
      const response = await client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
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
    const client = await initializeMcpSession();

    try {
      const response = await client.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'search_opinions',
          arguments: {
            query: 'tariff',
            date_filed_after: '2024-01-01',
            page_size: 5,
          },
        },
      });

      const payload = parseToolText(response);
      assert.match(payload.summary ?? '', /Found \d+ opinions/i);
      assert.ok(Array.isArray(payload.results), 'Expected results array');
      assert.ok((payload.results?.length ?? 0) > 0, 'Expected at least one tariff-related opinion result');
      assert.equal(payload.search_parameters?.query, 'tariff');
    } finally {
      client.close();
    }
  });
});
