import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerRuntime } from '../../src/server/worker-runtime-factory.js';
import type { WorkerMcpEnv } from '../../src/server/worker-runtime-contract.js';

function createEnvironment(
  apiKey: string,
  flags: Partial<Pick<WorkerMcpEnv, 'MCP_NATIVE_TASKS_ENABLED' | 'MCP_LIST_CHANGED_ENABLED'>> = {},
): WorkerMcpEnv {
  return {
    MCP_OBJECT: {} as DurableObjectNamespace,
    COURTLISTENER_API_KEY: apiKey,
    ...flags,
  };
}

describe('Worker runtime factory', () => {
  it('creates isolated service containers and configuration per Worker environment', () => {
    const first = createWorkerRuntime(
      createEnvironment('first-secret', { MCP_NATIVE_TASKS_ENABLED: 'false' }),
    );
    const second = createWorkerRuntime(
      createEnvironment('second-secret', { MCP_NATIVE_TASKS_ENABLED: 'true' }),
    );

    assert.notEqual(first.container, second.container);
    assert.notEqual(first.toolRegistry, second.toolRegistry);
    assert.equal(first.config.courtListener.apiKey, 'first-secret');
    assert.equal(second.config.courtListener.apiKey, 'second-secret');
    assert.equal(first.protocolFlags.NATIVE_TASKS, false);
    assert.equal(second.protocolFlags.NATIVE_TASKS, true);
  });

  it('constructs the complete Worker service graph without the global container', () => {
    const runtime = createWorkerRuntime(createEnvironment('worker-secret'));

    assert.ok(runtime.logger);
    assert.ok(runtime.metrics);
    assert.ok(runtime.promptRegistry);
    assert.ok(runtime.resourceRegistry);
    assert.ok(runtime.toolRegistry);
    assert.equal(runtime.container.has('config'), true);
  });
});
