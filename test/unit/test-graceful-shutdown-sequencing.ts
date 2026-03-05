#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GracefulShutdown } from '../../src/graceful-shutdown.js';
import { Logger } from '../../src/infrastructure/logger.js';

function createTestLogger(): Logger {
  const logger = new Logger({ level: 'error', format: 'json', enabled: false }, 'test');
  return logger.child('graceful-shutdown-sequencing');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GracefulShutdown sequencing', () => {
  it('executes hooks sequentially in priority order', async () => {
    const logger = createTestLogger();
    const shutdown = new GracefulShutdown(
      { enabled: false, timeout: 500, forceTimeout: 100, signals: [] },
      logger,
    );

    const executionOrder: string[] = [];
    let active = 0;
    let maxActive = 0;

    shutdown.addHook({
      name: 'third',
      priority: 30,
      cleanup: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        executionOrder.push('third');
        active--;
      },
    });
    shutdown.addHook({
      name: 'first',
      priority: 10,
      cleanup: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        executionOrder.push('first');
        active--;
      },
    });
    shutdown.addHook({
      name: 'second',
      priority: 20,
      cleanup: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        executionOrder.push('second');
        active--;
      },
    });

    await shutdown.shutdown('test-order');

    assert.deepEqual(executionOrder, ['first', 'second', 'third']);
    assert.equal(maxActive, 1);
  });

  it('respects overall shutdown budget while timing out slow hooks', async () => {
    const logger = createTestLogger();
    const shutdown = new GracefulShutdown(
      { enabled: false, timeout: 90, forceTimeout: 100, signals: [] },
      logger,
    );

    shutdown.addHook({
      name: 'slow-a',
      priority: 10,
      cleanup: async () => {
        await sleep(200);
      },
    });
    shutdown.addHook({
      name: 'slow-b',
      priority: 20,
      cleanup: async () => {
        await sleep(200);
      },
    });
    shutdown.addHook({
      name: 'fast',
      priority: 30,
      cleanup: async () => {},
    });

    const startedAt = Date.now();
    await shutdown.shutdown('test-budget');
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 250, `shutdown exceeded expected budget window: ${elapsedMs}ms`);
  });
});

