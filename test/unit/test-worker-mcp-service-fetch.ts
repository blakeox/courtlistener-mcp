#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fetchMcpWorkerReadiness,
  fetchMcpWorkerService,
} from '../../src/server/worker-mcp-service-fetch.js';
import type { WorkerEdgeEnv } from '../../src/server/worker-runtime-contract.js';

describe('fetchMcpWorkerService', () => {
  it('uses MCP_SERVICE when bound', async () => {
    let capturedUrl = '';
    const env = {
      MCP_SERVICE: {
        fetch: async (request: Request) => {
          capturedUrl = request.url;
          return new Response('ok', { status: 200 });
        },
      },
    } as WorkerEdgeEnv;

    const response = await fetchMcpWorkerService(
      new Request('https://portal.example/mcp', { method: 'POST' }),
      env,
    );

    assert.equal(response.status, 200);
    assert.equal(capturedUrl, 'https://portal.example/mcp');
  });

  it('overwrites caller-controlled service headers with the configured internal token', async () => {
    let capturedToken = '';
    const env = {
      MCP_AUTH_TOKEN: 'internal-service-token',
      MCP_SERVICE: {
        fetch: async (request: Request) => {
          capturedToken = request.headers.get('x-mcp-service-token') ?? '';
          return new Response('ok', { status: 200 });
        },
      },
    } as WorkerEdgeEnv;

    await fetchMcpWorkerService(
      new Request('https://portal.example/mcp', {
        method: 'POST',
        headers: { 'x-mcp-service-token': 'attacker-controlled-value' },
      }),
      env,
    );

    assert.equal(capturedToken, 'internal-service-token');
  });

  it('fails closed when the service binding is missing', async () => {
    await assert.rejects(
      () => fetchMcpWorkerService(new Request('https://portal.example/mcp'), {} as WorkerEdgeEnv),
      /MCP_SERVICE binding is missing/,
    );
  });

  it('bounds a stalled MCP readiness binding probe', async () => {
    const env = {
      MCP_SERVICE: {
        fetch: async (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      },
    } as WorkerEdgeEnv;

    await assert.rejects(
      () => fetchMcpWorkerReadiness(new Request('https://portal.example/ready'), env, 5),
      /aborted|mcp_readiness_timeout/,
    );
  });
});
