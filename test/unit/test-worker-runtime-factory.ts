import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkerRuntime } from '../../src/server/worker-runtime-factory.js';
import type { WorkerMcpEnv } from '../../src/server/worker-runtime-contract.js';

function createEnvironment(apiKey: string): WorkerMcpEnv {
  return {
    COURTLISTENER_API_KEY: apiKey,
  };
}

describe('Worker runtime factory', () => {
  it('creates isolated service containers and configuration per Worker environment', () => {
    const first = createWorkerRuntime(createEnvironment('first-secret'));
    const second = createWorkerRuntime(createEnvironment('second-secret'));

    assert.notEqual(first.container, second.container);
    assert.notEqual(first.toolRegistry, second.toolRegistry);
    assert.equal(first.config.courtListener.apiKey, 'first-secret');
    assert.equal(second.config.courtListener.apiKey, 'second-secret');
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
