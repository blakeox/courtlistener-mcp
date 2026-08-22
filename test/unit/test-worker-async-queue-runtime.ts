#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/server';

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

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const prefix = options?.prefix ?? '';
    return {
      keys: [...this.store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name })),
    };
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

  it('defaults the Cloudflare queue path off until explicitly enabled', () => {
    const kv = new MemoryKvNamespace();
    const queue = { send: async () => undefined } as unknown as Queue<AsyncJobMessage>;
    const disabled = new CloudflareAsyncQueueWorkflow(
      { ASYNC_JOBS_KV: kv as unknown as KVNamespace, ASYNC_TOOL_QUEUE: queue },
      { logger: new SilentLogger() as never },
    );
    const enabled = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: queue,
        MCP_ASYNC_QUEUE_ENABLED: 'true',
      },
      { logger: new SilentLogger() as never },
    );

    assert.equal(disabled.isEnabled(), false);
    assert.equal(enabled.isEnabled(), true);
  });

  it('fails closed when async execution is enabled without production bindings', () => {
    const workflow = new CloudflareAsyncQueueWorkflow(
      { MCP_ASYNC_QUEUE_ENABLED: 'true' },
      { logger: new SilentLogger() as never },
    );

    assert.throws(() => workflow.isEnabled(), /ASYNC_JOBS_KV binding is missing/);
  });

  it('records a terminal enqueue failure after queue.send fails', async () => {
    const kv = new MemoryKvNamespace();
    const workflow = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => {
            throw new Error('queue unavailable');
          },
        } as unknown as Queue<AsyncJobMessage>,
        MCP_ASYNC_QUEUE_ENABLED: 'true',
      },
      {
        logger: new SilentLogger() as never,
        isReadOnlyTool: () => true,
      },
    );

    const result = await workflow.enqueueToolCall({
      request: {
        method: 'tools/call',
        params: { name: 'get_case_details', arguments: {} },
      },
      requestId: 'request-enqueue-failure',
      directive: { mode: 'async' },
    });

    const payload = parsePayload(result);
    assert.equal(result.isError, true);
    assert.equal(payload.success, false);
    const jobs = await workflow.listPublicJobSnapshots();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.status, 'failed');
    assert.equal(jobs[0]?.error?.deadLetter, false);
  });

  it('rejects tools outside the read-only queue allowlist', async () => {
    const kv = new MemoryKvNamespace();
    const workflow = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: { send: async () => undefined } as unknown as Queue<AsyncJobMessage>,
        MCP_ASYNC_QUEUE_ENABLED: 'true',
      },
      {
        logger: new SilentLogger() as never,
        isReadOnlyTool: () => false,
      },
    );

    const result = await workflow.enqueueToolCall({
      request: {
        method: 'tools/call',
        params: { name: 'create_docket_alert', arguments: {} },
      },
      requestId: 'request-mutation-rejection',
      directive: { mode: 'async' },
    });

    const payload = parsePayload(result);
    assert.equal(result.isError, true);
    assert.equal(payload.success, false);
    assert.match(String(payload.error), /not eligible/);
    assert.equal((await workflow.listPublicJobSnapshots()).length, 0);
  });
});

describe('processAsyncQueueMessage', () => {
  it('fails closed when the queue consumer has no job store binding', async () => {
    await assert.rejects(
      () =>
        processAsyncQueueMessage({
          env: {} as never,
          logger: new SilentLogger() as never,
          message: { jobId: 'missing-store' },
          execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
        }),
      /ASYNC_JOBS_KV binding is missing/,
    );
  });

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

    const disposition = await processAsyncQueueMessage({
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
    assert.deepEqual(disposition, { action: 'ack', reason: 'cancelled' });
  });

  it('returns a retry disposition without self-requeueing the failed message', async () => {
    const kv = new MemoryKvNamespace();
    const message: AsyncJobMessage = { jobId: 'job-retry-disposition' };
    await createQueuedJob(kv, message.jobId);
    let queueSendCount = 0;

    const disposition = await processAsyncQueueMessage({
      env: {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => {
            queueSendCount += 1;
          },
        } as unknown as Queue<AsyncJobMessage>,
      },
      logger: new SilentLogger() as never,
      message,
      execute: async () => {
        throw new Error('transient upstream failure');
      },
    });

    const stored = (await kv.get(`job:${message.jobId}`, 'json')) as Record<string, unknown>;
    assert.deepEqual(disposition, {
      action: 'retry',
      reason: 'transient_failure',
      delaySeconds: 1,
    });
    assert.equal(queueSendCount, 0);
    assert.equal(stored.status, 'queued');
  });

  it('returns terminal acknowledgement for a permanent failure', async () => {
    const kv = new MemoryKvNamespace();
    const message: AsyncJobMessage = { jobId: 'job-permanent-failure' };
    await createQueuedJob(kv, message.jobId);
    const current = (await kv.get(`job:${message.jobId}`, 'json')) as Record<string, unknown>;
    current.attempts = { current: 2, max: 3 };
    await kv.put(`job:${message.jobId}`, JSON.stringify(current));

    const disposition = await processAsyncQueueMessage({
      env: { ASYNC_JOBS_KV: kv as unknown as KVNamespace },
      logger: new SilentLogger() as never,
      message,
      execute: async () => {
        throw new Error('permanent tool failure');
      },
    });

    const stored = (await kv.get(`job:${message.jobId}`, 'json')) as Record<string, unknown>;
    assert.deepEqual(disposition, { action: 'ack', reason: 'permanent_failure' });
    assert.equal(stored.status, 'failed');
  });
});
