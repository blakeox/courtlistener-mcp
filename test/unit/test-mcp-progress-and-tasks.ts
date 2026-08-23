#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../../src/infrastructure/protocol-constants.js';
import { createMcpProgressReporter } from '../../src/server/mcp-progress-reporter.js';
import { AsyncToolWorkflowOrchestrator } from '../../src/server/async-tool-workflow.js';
import { AsyncWorkflowTaskStore } from '../../src/server/async-workflow-task-store.js';
import { createOrchestratorPublicJobPort } from '../../src/server/async-public-job-port.js';

describe('MCP progress reporter', () => {
  it('remains disabled without a progress token', async () => {
    const reporter = createMcpProgressReporter(undefined);
    assert.equal(reporter.enabled, false);
    await reporter.report({ progress: 1, message: 'noop' });
  });

  it('forwards progress notifications when a token is present', async () => {
    const notifications: Array<Record<string, unknown>> = [];
    const reporter = createMcpProgressReporter({
      _meta: { progressToken: 'token-1' },
      sendNotification: async (notification) => {
        notifications.push(notification as Record<string, unknown>);
      },
    });

    assert.equal(reporter.enabled, true);
    await reporter.report({ progress: 2, total: 5, message: 'Working' });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.method, 'notifications/progress');
  });
});

describe('native MCP tasks capability', () => {
  it('advertises tasks only when MCP_NATIVE_TASKS_ENABLED=true', () => {
    const disabled = buildServerCapabilities(
      resolveProtocolFeatureFlags({ MCP_NATIVE_TASKS_ENABLED: 'false' }),
    );
    const enabled = buildServerCapabilities(
      resolveProtocolFeatureFlags({ MCP_NATIVE_TASKS_ENABLED: 'true' }),
    );

    assert.equal(disabled.tasks, undefined);
    assert.deepEqual(enabled.tasks, {
      list: {},
      cancel: {},
      requests: {
        tools: {
          call: {},
        },
      },
    });
  });

  it('maps async jobs into native task records', () => {
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      child: () => logger,
    } as never;
    const orchestrator = new AsyncToolWorkflowOrchestrator(logger, { enabled: true });
    const store = new AsyncWorkflowTaskStore(createOrchestratorPublicJobPort(orchestrator));

    const envelope = orchestrator.enqueueToolCall({
      request: {
        method: 'tools/call',
        params: {
          name: 'list_courts',
          arguments: { jurisdiction: 'F' },
          task: { ttl: 60_000 },
        },
      },
      requestId: 'req-1',
      directive: { mode: 'async' },
      execute: async () => ({
        content: [{ type: 'text', text: '{"ok":true}' }],
      }),
    });

    const jobId = (envelope.structuredContent as { job?: { id?: string } }).job?.id;
    assert.ok(jobId);
    const jobSnapshot = (envelope.structuredContent as { job?: { id: string } }).job!;
    const taskResult = store.buildCreateTaskResult(jobSnapshot, 1_000);
    assert.ok(taskResult?.task.taskId);
    assert.equal(taskResult?.task.status, 'working');
  });
});
