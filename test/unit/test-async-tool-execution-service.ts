#!/usr/bin/env node

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { sleep } from '../../src/common/utils.js';
import {
  AsyncToolWorkflowOrchestrator,
  type AsyncJobSnapshot,
} from '../../src/server/async-tool-workflow.js';
import { createDirectToolExecutionService } from '../../src/server/tool-execution-service.js';
import { BaseToolHandler, ToolHandlerRegistry, type ToolContext } from '../../src/server/tool-handler.js';

type TestInput = {
  delayMs?: number;
  failuresBeforeSuccess?: number;
};

class DelayedFlakyHandler extends BaseToolHandler<TestInput, unknown> {
  readonly name = 'delayed_flaky';
  readonly description = 'Test handler';
  readonly category = 'test';
  private failures = 0;

  validate(input: unknown): { success: true; data: TestInput } {
    return { success: true, data: (input as TestInput) ?? {} };
  }

  async execute(input: TestInput, _context: ToolContext): Promise<CallToolResult> {
    if ((input.delayMs ?? 0) > 0) {
      await sleep(input.delayMs ?? 0);
    }
    if (this.failures < (input.failuresBeforeSuccess ?? 0)) {
      this.failures += 1;
      throw new Error(`transient-${this.failures}`);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, failures: this.failures }) }],
    };
  }

  getSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        delayMs: { type: 'number' },
        failuresBeforeSuccess: { type: 'number' },
      },
    };
  }
}

class AlwaysFailHandler extends BaseToolHandler<Record<string, never>, never> {
  readonly name = 'always_fail';
  readonly description = 'Always fail';
  readonly category = 'test';

  validate(input: unknown): { success: true; data: Record<string, never> } {
    return { success: true, data: (input as Record<string, never>) ?? {} };
  }

  async execute(): Promise<CallToolResult> {
    throw new Error('permanent-failure');
  }

  getSchema(): Record<string, unknown> {
    return { type: 'object', properties: {} };
  }
}

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

function parsePayload(result: CallToolResult): Record<string, unknown> {
  assert.ok(result.content.length > 0);
  const first = result.content[0];
  assert.strictEqual(first.type, 'text');
  return JSON.parse(first.text) as Record<string, unknown>;
}

async function waitForTerminalStatus(
  service: ReturnType<typeof createDirectToolExecutionService>,
  jobId: string,
  maxAttempts: number = 300,
): Promise<AsyncJobSnapshot> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const statusResult = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'mcp_async_get_job',
          arguments: { jobId },
        },
      },
      `status-${attempt}`,
    );
    const payload = parsePayload(statusResult);
    const job = payload.job as AsyncJobSnapshot;
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'expired') {
      return job;
    }
    await sleep(10);
  }
  throw new Error('Job did not reach terminal state');
}

describe('async tool execution service', () => {
  it('executes async jobs through queued lifecycle and returns result envelope', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DelayedFlakyHandler());
    const service = createDirectToolExecutionService({
      toolRegistry: registry,
      logger: new SilentLogger() as never,
      asyncWorkflow: new AsyncToolWorkflowOrchestrator(new SilentLogger() as never, {
        queueConcurrency: 1,
        defaultRetryDelayMs: 1,
      }),
    });

    const queued = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 15,
            __mcp_async: {
              mode: 'async',
            },
          },
        },
      },
      'queue-1',
    );
    const queuedPayload = parsePayload(queued);
    const job = queuedPayload.job as AsyncJobSnapshot;
    const terminal = await waitForTerminalStatus(service, job.id);
    assert.strictEqual(terminal.status, 'succeeded');

    const retrieved = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'mcp_async_get_job_result',
          arguments: { jobId: job.id },
        },
      },
      'result-1',
    );
    const retrievedPayload = parsePayload(retrieved);
    assert.strictEqual((retrievedPayload.job as AsyncJobSnapshot).status, 'succeeded');
    assert.ok(retrievedPayload.result);
  });

  it('retries failures and marks dead-letter style failure after max attempts', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new AlwaysFailHandler());
    const service = createDirectToolExecutionService({
      toolRegistry: registry,
      logger: new SilentLogger() as never,
      asyncWorkflow: new AsyncToolWorkflowOrchestrator(new SilentLogger() as never, {
        queueConcurrency: 1,
        defaultRetryDelayMs: 1,
      }),
    });

    const queued = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'always_fail',
          arguments: {
            __mcp_async: {
              mode: 'async',
              maxAttempts: 2,
              retryDelayMs: 1,
            },
          },
        },
      },
      'queue-fail',
    );
    const queuedPayload = parsePayload(queued);
    const job = queuedPayload.job as AsyncJobSnapshot;
    const terminal = await waitForTerminalStatus(service, job.id);
    assert.strictEqual(terminal.status, 'failed');
    assert.strictEqual(terminal.error?.deadLetter, true);
    assert.strictEqual(terminal.attempts.current, 2);
  });

  it('deduplicates idempotent async submissions and supports cancel on queued jobs', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DelayedFlakyHandler());
    const workflow = new AsyncToolWorkflowOrchestrator(new SilentLogger() as never, {
      queueConcurrency: 1,
      defaultRetryDelayMs: 1,
    });
    const service = createDirectToolExecutionService({
      toolRegistry: registry,
      logger: new SilentLogger() as never,
      asyncWorkflow: workflow,
    });

    const first = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 40,
            __mcp_async: {
              mode: 'async',
              idempotencyKey: 'same-key',
            },
          },
        },
      },
      'queue-first',
    );
    const firstJob = (parsePayload(first).job as AsyncJobSnapshot).id;

    const second = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 40,
            __mcp_async: {
              mode: 'async',
              idempotencyKey: 'same-key',
            },
          },
        },
      },
      'queue-second',
    );
    const secondPayload = parsePayload(second);
    assert.strictEqual((secondPayload.job as AsyncJobSnapshot).id, firstJob);
    assert.strictEqual(secondPayload.deduplicated, true);

    const toCancel = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 1,
            __mcp_async: {
              mode: 'async',
            },
          },
        },
      },
      'queue-cancel-target',
    );
    const cancelJobId = (parsePayload(toCancel).job as AsyncJobSnapshot).id;
    const cancelled = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'mcp_async_cancel_job',
          arguments: { jobId: cancelJobId },
        },
      },
      'cancel',
    );
    const cancelledPayload = parsePayload(cancelled);
    assert.strictEqual((cancelledPayload.job as AsyncJobSnapshot).status, 'failed');
    assert.strictEqual((cancelledPayload.job as AsyncJobSnapshot).error?.code, 'cancelled');
  });

  it('coalesces matching queued requests and records queue/completion guardrails', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DelayedFlakyHandler());
    const workflow = new AsyncToolWorkflowOrchestrator(new SilentLogger() as never, {
      queueConcurrency: 1,
      queueBatchSize: 1,
      maxQueueDepth: 1,
      queueLatencyGuardrailMs: 5,
      completionLatencyGuardrailMs: 10,
      defaultRetryDelayMs: 1,
    });
    const service = createDirectToolExecutionService({
      toolRegistry: registry,
      logger: new SilentLogger() as never,
      asyncWorkflow: workflow,
    });

    const first = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 30,
            payload: { a: 1, b: 2 },
            __mcp_async: { mode: 'async' },
          },
        },
      },
      'queue-coalesce-1',
    );
    const firstJob = parsePayload(first).job as AsyncJobSnapshot;

    const second = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            payload: { b: 2, a: 1 },
            delayMs: 30,
            __mcp_async: { mode: 'async' },
          },
        },
      },
      'queue-coalesce-2',
    );
    const secondPayload = parsePayload(second);
    assert.strictEqual((secondPayload.job as AsyncJobSnapshot).id, firstJob.id);
    assert.strictEqual(secondPayload.deduplicated, true);

    const extra = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 30,
            payload: { a: 2 },
            __mcp_async: { mode: 'async' },
          },
        },
      },
      'queue-coalesce-3',
    );
    assert.ok((parsePayload(extra).job as AsyncJobSnapshot).id);
    const extraSecond = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 30,
            payload: { a: 3 },
            __mcp_async: { mode: 'async' },
          },
        },
      },
      'queue-coalesce-4',
    );
    assert.ok((parsePayload(extraSecond).job as AsyncJobSnapshot).id);

    await waitForTerminalStatus(service, firstJob.id);

    const diagnostics = workflow.getDiagnostics();
    assert.ok(diagnostics.latencies.queueLatencyMs.count >= 1);
    assert.ok(diagnostics.latencies.completionLatencyMs.count >= 1);
    assert.ok(diagnostics.guardrails.queueDepth.breaches >= 1);
    assert.ok(diagnostics.guardrails.queueLatencyMs.breaches >= 1);
    assert.ok(diagnostics.guardrails.completionLatencyMs.breaches >= 1);
  });

  it('marks jobs as expired when ttl is exceeded', async () => {
    const registry = new ToolHandlerRegistry();
    registry.register(new DelayedFlakyHandler());
    const service = createDirectToolExecutionService({
      toolRegistry: registry,
      logger: new SilentLogger() as never,
      asyncWorkflow: new AsyncToolWorkflowOrchestrator(new SilentLogger() as never, {
        queueConcurrency: 1,
        defaultRetryDelayMs: 1,
      }),
    });

    const queued = await service.execute(
      {
        method: 'tools/call',
        params: {
          name: 'delayed_flaky',
          arguments: {
            delayMs: 1200,
            __mcp_async: {
              mode: 'async',
              ttlSeconds: 1,
            },
          },
        },
      },
      'queue-expire',
    );
    const jobId = (parsePayload(queued).job as AsyncJobSnapshot).id;
    const terminal = await waitForTerminalStatus(service, jobId);
    assert.strictEqual(terminal.status, 'expired');
  });
});
