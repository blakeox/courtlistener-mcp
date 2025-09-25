#!/usr/bin/env node

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Import compiled JS from dist
const { GracefulShutdown } = await import('../../dist/graceful-shutdown.js');
const { Logger } = await import('../../dist/infrastructure/logger.js');

// Create a minimal test logger using the real logger's API
function createTestLogger() {
	const base = new Logger({ level: 'silent' });
	// Ensure child() is available and returns a no-op logger
	return base.child('Test');
}

describe('GracefulShutdown', () => {
	let originalOn;
	let addedHandlers = [];
	let originalExit;
	let exitCalls;

	beforeEach(() => {
		// Stub process.on to capture handlers without installing real ones
		originalOn = process.on;
		addedHandlers = [];
		process.on = (event, handler) => {
			addedHandlers.push({ event, handler });
			return process;
		};

		// Stub process.exit to prevent actual exit
		originalExit = process.exit;
		exitCalls = [];
		// @ts-ignore - override for test
		process.exit = (code) => {
			exitCalls.push(code);
			return undefined;
		};
	});

	afterEach(() => {
		process.on = originalOn;
		// @ts-ignore - restore
		process.exit = originalExit;
		addedHandlers = [];
	});

	it('registers hooks and reports status', async () => {
		const logger = createTestLogger();
		const gs = new GracefulShutdown(
			{ enabled: true, timeout: 100, forceTimeout: 50, signals: ['SIGINT'] },
			logger
		);

		assert.strictEqual(gs.getStatus().hooksRegistered, 0);
		assert.strictEqual(gs.getStatus().isShuttingDown, false);

		let ran = false;
		gs.addHook({ name: 'h1', priority: 1, cleanup: async () => { ran = true; } });
		assert.strictEqual(gs.getStatus().hooksRegistered, 1);

		await gs.shutdown('test');
		assert.strictEqual(gs.getStatus().isShuttingDown, true);
		assert.strictEqual(ran, true);
	});

	it('times out a slow hook without exiting process', async () => {
		const logger = createTestLogger();
		const gs = new GracefulShutdown(
			{ enabled: true, timeout: 30, forceTimeout: 20, signals: ['SIGINT'] },
			logger
		);

		// One hook that never resolves to trigger per-hook timeout path
		gs.addHook({ name: 'slow', priority: 1, cleanup: async () => new Promise(() => {}) });

		await gs.shutdown('timeout-test');
		// Ensure no process.exit was called during shutdown
		assert.deepStrictEqual(exitCalls, []);
	});

	it('installs signal and exception handlers when enabled', () => {
		const logger = createTestLogger();
		// Constructing should register handlers via stubbed process.on
		// Include default signals plus uncaught/unhandled handlers
		const gs = new GracefulShutdown(
			{ enabled: true, timeout: 50, forceTimeout: 20, signals: ['SIGTERM', 'SIGINT'] },
			logger
		);
		assert.ok(gs, 'instance created');

		const events = addedHandlers.map(h => h.event);
		assert.ok(events.includes('SIGTERM'));
		assert.ok(events.includes('SIGINT'));
		assert.ok(events.includes('uncaughtException'));
		assert.ok(events.includes('unhandledRejection'));
	});
});
