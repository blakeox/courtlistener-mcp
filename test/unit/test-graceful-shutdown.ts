#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GracefulShutdown } from '../../src/graceful-shutdown.js';
import { Logger } from '../../src/infrastructure/logger.js';

function createTestLogger(): Logger {
  const base = new Logger({ level: 'error', format: 'json', enabled: false }, 'test');
  return base.child('GracefulShutdownTest');
}

interface ProcessEventHandler {
  event: string;
  handler: (...args: unknown[]) => void;
}

describe('GracefulShutdown', () => {
  let originalOn: typeof process.on;
  let registeredHandlers: ProcessEventHandler[];

  beforeEach(() => {
    originalOn = process.on;
    registeredHandlers = [];
    process.on = ((event: string, handler: (...args: unknown[]) => void) => {
      registeredHandlers.push({ event, handler });
      return process;
    }) as typeof process.on;
  });

  afterEach(() => {
    process.on = originalOn;
  });

  it('registers process listeners when enabled', () => {
    const logger = createTestLogger();
    new GracefulShutdown(
      {
        enabled: true,
        timeout: 100,
        forceTimeout: 25,
        signals: ['SIGINT', 'SIGTERM'],
      },
      logger,
    );

    const events = registeredHandlers.map((entry) => entry.event);
    assert.ok(events.includes('SIGINT'));
    assert.ok(events.includes('SIGTERM'));
    assert.ok(events.includes('uncaughtException'));
    assert.ok(events.includes('unhandledRejection'));
  });

  it('tracks hooks and status', () => {
    const logger = createTestLogger();
    const shutdown = new GracefulShutdown(
      {
        enabled: false,
        timeout: 100,
        forceTimeout: 25,
        signals: [],
      },
      logger,
    );

    assert.equal(shutdown.getStatus().hooksRegistered, 0);
    shutdown.addHook({
      name: 'cleanup-a',
      priority: 10,
      cleanup: async () => {},
    });
    assert.equal(shutdown.getStatus().hooksRegistered, 1);

    shutdown.removeHook('cleanup-a');
    assert.equal(shutdown.getStatus().hooksRegistered, 0);
  });

  it('executes hooks once under concurrent shutdown calls', async () => {
    const logger = createTestLogger();
    const shutdown = new GracefulShutdown(
      {
        enabled: false,
        timeout: 200,
        forceTimeout: 25,
        signals: [],
      },
      logger,
    );

    let callCount = 0;
    shutdown.addHook({
      name: 'cleanup-once',
      priority: 10,
      cleanup: async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 25));
      },
    });

    await Promise.all([
      shutdown.shutdown('a'),
      shutdown.shutdown('b'),
      shutdown.shutdown('c'),
      shutdown.shutdown('d'),
    ]);

    assert.equal(callCount, 1);
    assert.equal(shutdown.getStatus().isShuttingDown, true);
  });

  it('handles repeated signal-style shutdown triggers deterministically', async () => {
    const logger = createTestLogger();
    const shutdown = new GracefulShutdown(
      {
        enabled: true,
        timeout: 250,
        forceTimeout: 25,
        signals: ['SIGTERM'],
      },
      logger,
    );

    let cleanupCount = 0;
    shutdown.addHook({
      name: 'cleanup-on-signal',
      priority: 10,
      cleanup: async () => {
        cleanupCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    });

    const signalHandler = registeredHandlers.find((entry) => entry.event === 'SIGTERM');
    assert.ok(signalHandler, 'Expected SIGTERM handler to be registered');

    const originalExit = process.exit;
    const exitCodes: number[] = [];
    process.exit = ((code?: number) => {
      exitCodes.push(code ?? 0);
      return undefined as never;
    }) as typeof process.exit;

    try {
      signalHandler?.handler();
      signalHandler?.handler();
      signalHandler?.handler();

      await new Promise((resolve) => setTimeout(resolve, 75));
    } finally {
      process.exit = originalExit;
    }

    assert.equal(cleanupCount, 1);
    assert.deepEqual(exitCodes, [0]);
  });
});
