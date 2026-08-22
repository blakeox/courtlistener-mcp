#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CallToolRequest } from '@modelcontextprotocol/server';

import {
  createQueuePublicJobPort,
  CloudflareAsyncQueueWorkflow,
} from '../../src/server/worker-async-queue-runtime.js';
import { AsyncWorkflowTaskStore } from '../../src/server/async-workflow-task-store.js';

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

  async get(key: string, type?: 'text' | 'json'): Promise<unknown | null> {
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

describe('AsyncWorkflowTaskStore queue-backed port', () => {
  it('maps queued KV jobs into native MCP task records', async () => {
    const kv = new MemoryKvNamespace();
    const now = Date.now();
    const request: CallToolRequest = {
      method: 'tools/call',
      params: { name: 'list_courts', arguments: { page_size: 1 } },
    };

    await kv.put(
      'job:job-1',
      JSON.stringify({
        id: 'job-1',
        toolName: request.params.name,
        request,
        requestId: 'req-1',
        status: 'queued',
        createdAtMs: now,
        updatedAtMs: now,
        expiresAtMs: now + 60_000,
        attempts: { current: 0, max: 3 },
        retryDelayMs: 500,
        cancellationRequested: false,
        queuedAtMs: now,
      }),
    );

    const workflow = new CloudflareAsyncQueueWorkflow(
      {
        ASYNC_JOBS_KV: kv as unknown as KVNamespace,
        ASYNC_TOOL_QUEUE: {
          send: async () => {},
        } as unknown as Queue<{ jobId: string }>,
      },
      { logger: new SilentLogger() as never },
    );
    const store = new AsyncWorkflowTaskStore(createQueuePublicJobPort(workflow));
    const snapshot = await workflow.getPublicJobSnapshot('job-1');
    assert.ok(snapshot);

    const createResult = store.buildCreateTaskResult(snapshot, 1_000);
    assert.equal(createResult.task.taskId, 'job-1');
    assert.equal(createResult.task.status, 'working');

    const listed = await store.listTasks();
    assert.equal(listed.tasks.length, 1);
    assert.equal(listed.tasks[0]?.taskId, 'job-1');
  });
});
