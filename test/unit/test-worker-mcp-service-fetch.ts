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

  it('falls back to MCP_DEV_UPSTREAM_URL when MCP_SERVICE is missing', async () => {
    const env = {
      MCP_DEV_UPSTREAM_URL: 'http://127.0.0.1:3999',
    } as WorkerEdgeEnv;

    await assert.rejects(
      () =>
        fetchMcpWorkerService(new Request('https://portal.example/mcp', { method: 'GET' }), env),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        return true;
      },
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
