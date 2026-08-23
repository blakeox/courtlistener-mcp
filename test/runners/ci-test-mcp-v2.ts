#!/usr/bin/env node

/**
 * CI MCP v2 contract runner.
 *
 * This deliberately speaks the modern server/discover contract directly.
 * Keeping the release gate independent of a client CLI prevents an outdated
 * client handshake from becoming a server compatibility requirement.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocalMcpServerRuntime } from '../helpers/local-mcp-runtime.ts';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = getLocalMcpServerRuntime(projectRoot);
const protocolVersion = '2026-07-28';

interface RpcResponse {
  result?: { tools?: Array<{ name?: string }> };
  error?: { message?: string };
}

function modernParams(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': protocolVersion,
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': {
        name: 'courtlistener-mcp-ci',
        version: '2.0.0',
      },
    },
  };
}

async function runLocalV2Contract(): Promise<void> {
  const server = spawn(runtime.command, runtime.args, {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'ignore'],
  });

  let buffer = '';
  const pending = new Map<number, (response: RpcResponse) => void>();

  server.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const response = JSON.parse(line) as RpcResponse & { id?: number };
        if (typeof response.id === 'number') {
          pending.get(response.id)?.(response);
          pending.delete(response.id);
        }
      } catch {
        // Ignore non-JSON diagnostic output.
      }
    }
  });

  const send = (id: number, method: string, params: Record<string, unknown>) =>
    new Promise<RpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for MCP v2 response id=${id}`));
      }, 20_000);
      pending.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
      server.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  try {
    const discovery = await send(1, 'server/discover', modernParams());
    if (!discovery.result || discovery.error) {
      throw new Error(`server/discover failed: ${discovery.error?.message ?? 'no result'}`);
    }

    const tools = await send(2, 'tools/list', modernParams());
    const names = new Set((tools.result?.tools ?? []).map((tool) => tool.name));
    for (const required of ['search_cases', 'search_opinions', 'list_courts']) {
      if (!names.has(required)) throw new Error(`tools/list missing ${required}`);
    }

    const invalidCall = await send(
      3,
      'tools/call',
      modernParams({ name: '__missing_tool__', arguments: {} }),
    );
    if (!invalidCall.result && !invalidCall.error) {
      throw new Error('tools/call invalid-tool contract returned no error result');
    }

    console.log(`MCP v2 stdio contract passed (${names.size} tools discovered).`);
  } finally {
    server.kill('SIGTERM');
  }
}

runLocalV2Contract().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
