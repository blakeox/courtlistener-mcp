#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  CloudflareAsyncQueueWorkflow,
  processAsyncQueueMessage,
  type AsyncJobMessage,
} from '../../src/server/worker-async-queue-runtime.js';

class SilentLogger {
  info(): void {}
  debug(): void {}
  warn(): void {}
  error(): void {}
  child(): SilentLogger {
    return this;
  }
  startTimer(): { end(): number; endWithError(): number } {
    return { end: () => 0, endWithError: () => 0 };
  }
  toolExecution(): void {}
  apiCall(): void {}
}

class MemoryKvNamespace {
  private readonly store = new Map<string, string>();

  async get(
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream',
  ): Promise<unknown | null> {
    const value = this.store.get(key);
    if (value === undefined) {
      return null;
    }
    if (type === 'json') {
      return JSON.parse(value) as unknown;
    }
    return value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

function parsePayload(result: CallToolResult): Record<string, unknown> {
  assert.ok(result.content.length > 0);
  const first = result.content[0];
  assert.strictEqual(first.type, 'text');
  return JSON.parse(first.text) as Record<string, unknown>;
}

async function createQueuedJob(kv: MemoryKvNamespace, jobId: string): Promise<void> {
  const now = Date.now();
  const request: CallToolRequest = {
    method: 'tools/call',
    params: {
      name: 'delayed_flaky',
      arguments: {},
    },
  };

  await kv.put(
    `job:${jobId}`,
    JSON.stringify({
      id: jobId,
      toolName: request.params.name,
      request,
      requestId: 'request-1',
      status: 'queued',
      createdAtMs: now,
      updatedAtMs: now,
      expiresAtMs: now + 60_000,
      attempts: {
        current: 0,
        max: 3,
      },
      retryDelayMs: 1,
      cancellationRequested: false,
      queuedAtMs: now,
    }),
  );
}

describe('CloudflareAsyncQueueWorkflow.handleControlToolCall', () => {
  it('rejects unsupported control tools without mutating the job', async () => {
    const kv = new MemoryKvNamespace();
    const jobId = 'job-unsupported-control';
    await createQueuedJob(kv, jobId);

    const workflow = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => undefined,
        } as unknown as Queue<AsyncJobMessage>,
      },
      { logger: new SilentLogger() as never },
    );

    const result = await workflow.handleControlToolCall({
      method: 'tools/call',
      params: {
        name: 'mcp_async_future_control',
        arguments: { jobId },
      },
    });

    const payload = parsePayload(result);
    assert.equal(result.isError, true);
    assert.equal(payload.success, false);
    assert.match(String(payload.error), /Unsupported control tool/);

    const stored = (await kv.get(`job:${jobId}`, 'json')) as Record<string, unknown>;
    assert.equal(stored.status, 'queued');
    assert.equal(stored.cancellationRequested, false);
  });

  it('cancels queued jobs for mcp_async_cancel_job', async () => {
    const kv = new MemoryKvNamespace();
    const jobId = 'job-cancel-queued';
    await createQueuedJob(kv, jobId);

    const workflow = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => undefined,
        } as unknown as Queue<AsyncJobMessage>,
      },
      { logger: new SilentLogger() as never },
    );

    const result = await workflow.handleControlToolCall({
      method: 'tools/call',
      params: {
        name: 'mcp_async_cancel_job',
        arguments: { jobId },
      },
    });

    const payload = parsePayload(result);
    assert.equal(payload.success, true);
    const job = payload.job as Record<string, unknown>;
    assert.equal(job.status, 'failed');
    assert.equal((job.error as Record<string, unknown>).code, 'cancelled');
  });
});

describe('processAsyncQueueMessage', () => {
  it('preserves cancellationRequested when cancellation is persisted during execution', async () => {
    const kv = new MemoryKvNamespace();
    const message: AsyncJobMessage = { jobId: 'job-running-cancelled' };
    const now = Date.now();
    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: 'delayed_flaky',
        arguments: {},
      },
    };

    await kv.put(
      `job:${message.jobId}`,
      JSON.stringify({
        id: message.jobId,
        toolName: request.params.name,
        request,
        requestId: 'request-1',
        status: 'queued',
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: now + 60_000,
        attempts: {
          current: 0,
          max: 3,
        },
        retryDelayMs: 1,
        cancellationRequested: false,
        queuedAtMs: now,
      }),
    );

    let sawRunningState = false;
    const execute = async (): Promise<CallToolResult> => {
      const runningJob = (await kv.get(`job:${message.jobId}`, 'json')) as Record<string, unknown>;
      assert.equal(runningJob.status, 'running');
      sawRunningState = true;
      await kv.put(
        `job:${message.jobId}`,
        JSON.stringify({
          ...runningJob,
          cancellationRequested: true,
        }),
      );
      return {
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      };
    };

    await processAsyncQueueMessage({
      env: {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => undefined,
        } as unknown as Queue<AsyncJobMessage>,
      },
      logger: new SilentLogger() as never,
      message,
      execute,
    });

    const terminalJob = (await kv.get(`job:${message.jobId}`, 'json')) as Record<string, unknown>;
    const error = terminalJob.error as Record<string, unknown>;

    assert.equal(sawRunningState, true);
    assert.equal(terminalJob.status, 'failed');
    assert.equal(terminalJob.cancellationRequested, true);
    assert.equal(error.code, 'cancelled');
    assert.equal(error.deadLetter, false);
  });
});
