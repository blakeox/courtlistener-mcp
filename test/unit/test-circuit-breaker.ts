#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Circuit Breaker (TypeScript)
 * Tests circuit breaker patterns, state transitions, failure detection, and recovery
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { Logger } from '../../src/infrastructure/logger.js';
import { createMockLogger } from '../utils/test-helpers.ts';

// Import the actual CircuitBreaker components
const circuitBreakerModule = await import('../../dist/infrastructure/circuit-breaker.js');
const { CircuitBreaker, CircuitBreakerManager, CircuitState, createCircuitBreakerConfig } =
  circuitBreakerModule;

type CBConfig = import('../../dist/infrastructure/circuit-breaker.js').CircuitBreakerConfig;

// Helper to create an enabled config with short timings for fast tests
function makeConfig(overrides: Partial<CBConfig> = {}): CBConfig {
  return {
    enabled: true,
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 500,
    resetTimeout: 30,
    monitoringWindow: 1000,
    ...overrides,
  };
}

// Helper: trip a breaker to OPEN state
async function tripBreaker(
  breaker: InstanceType<typeof CircuitBreaker>,
  failures: number,
): Promise<void> {
  for (let i = 0; i < failures; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error(`trip-${i}`);
      });
    } catch {
      /* expected */
    }
  }
}

describe('CircuitBreaker', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  // ── Closed state ──────────────────────────────────────────────────
  describe('Closed state', () => {
    it('should start in CLOSED state', () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      const stats = cb.getStats();
      assert.strictEqual(stats.state, CircuitState.CLOSED);
      assert.strictEqual(stats.failureCount, 0);
      assert.strictEqual(stats.successCount, 0);
    });

    it('should pass requests through and return results', async () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      const result = await cb.execute(async () => 42);
      assert.strictEqual(result, 42);
    });

    it('should increment totalRequests on each call', async () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      await cb.execute(async () => 'a');
      await cb.execute(async () => 'b');
      assert.strictEqual(cb.getStats().totalRequests, 2);
    });

    it('should reset failureCount on success', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 3 }), mockLogger);
      // 2 failures (below threshold)
      await tripBreaker(cb, 2);
      assert.strictEqual(cb.getStats().failureCount, 2);

      // success resets failure count
      await cb.execute(async () => 'ok');
      assert.strictEqual(cb.getStats().failureCount, 0);
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);
    });

    it('should propagate operation errors', async () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      await assert.rejects(
        () =>
          cb.execute(async () => {
            throw new Error('boom');
          }),
        { message: 'boom' },
      );
    });
  });

  // ── Failure threshold → OPEN ──────────────────────────────────────
  describe('Failure threshold', () => {
    it('should open after exactly failureThreshold consecutive failures', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 3 }), mockLogger);

      // 2 failures → still closed
      await tripBreaker(cb, 2);
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);

      // 3rd failure → opens
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);
    });

    it('should open with failureThreshold of 1', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 1 }), mockLogger);
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);
    });

    it('should set nextAttemptTime when opening', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 50 }),
        mockLogger,
      );
      const before = Date.now();
      await tripBreaker(cb, 1);
      const stats = cb.getStats();
      assert.ok(stats.nextAttemptTime! >= before + 50);
    });
  });

  // ── Open state ────────────────────────────────────────────────────
  describe('Open state', () => {
    it('should reject requests immediately (fail fast)', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);

      const start = Date.now();
      await assert.rejects(() => cb.execute(async () => 'nope'), /Circuit breaker 'svc' is OPEN/);
      assert.ok(Date.now() - start < 50, 'should fail fast');
    });

    it('should include breaker name in rejection error', async () => {
      const cb = new CircuitBreaker(
        'my-api',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await assert.rejects(() => cb.execute(async () => 'nope'), /my-api/);
    });

    it('should still increment totalRequests when rejecting', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      const before = cb.getStats().totalRequests;
      try {
        await cb.execute(async () => 'x');
      } catch {
        /* expected */
      }
      assert.strictEqual(cb.getStats().totalRequests, before + 1);
    });
  });

  // ── Cooldown → half-open ──────────────────────────────────────────
  describe('Cooldown / half-open transition', () => {
    it('should transition to HALF_OPEN after resetTimeout elapses', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);

      await new Promise((r) => setTimeout(r, 25));
      // Next execute triggers half-open transition
      const result = await cb.execute(async () => 'probe');
      assert.strictEqual(result, 'probe');
      // After success it may be HALF_OPEN or CLOSED depending on successThreshold
    });
  });

  // ── Half-open state ───────────────────────────────────────────────
  describe('Half-open state', () => {
    it('should allow a probe request after cooldown', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 2 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      const result = await cb.execute(async () => 'probe-ok');
      assert.strictEqual(result, 'probe-ok');
      assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);
    });

    it('should remain HALF_OPEN until successThreshold is met', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 3 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      await cb.execute(async () => 'ok1');
      assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);
      assert.strictEqual(cb.getStats().successCount, 1);

      await cb.execute(async () => 'ok2');
      assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);
      assert.strictEqual(cb.getStats().successCount, 2);

      await cb.execute(async () => 'ok3');
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);
    });
  });

  // ── Recovery ──────────────────────────────────────────────────────
  describe('Recovery (half-open → closed)', () => {
    it('should close and reset counters after enough successes in half-open', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 2 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      await cb.execute(async () => 'ok1');
      await cb.execute(async () => 'ok2');

      const stats = cb.getStats();
      assert.strictEqual(stats.state, CircuitState.CLOSED);
      assert.strictEqual(stats.failureCount, 0);
      assert.strictEqual(stats.successCount, 0);
      assert.strictEqual(stats.nextAttemptTime, undefined);
      assert.strictEqual(stats.lastFailureTime, undefined);
    });
  });

  // ── Re-open (half-open → open) ────────────────────────────────────
  describe('Re-open (half-open failure)', () => {
    it('should immediately reopen on failure in half-open state', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 2 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      await assert.rejects(
        () =>
          cb.execute(async () => {
            throw new Error('half-open fail');
          }),
        /half-open fail/,
      );

      const stats = cb.getStats();
      assert.strictEqual(stats.state, CircuitState.OPEN);
      assert.ok(stats.nextAttemptTime! > Date.now());
      assert.strictEqual(stats.successCount, 0);
    });

    it('should reopen even if some successes preceded the failure in half-open', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 3 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      // 1 success in half-open, then failure
      await cb.execute(async () => 'ok1');
      assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);

      await assert.rejects(
        () =>
          cb.execute(async () => {
            throw new Error('fail-again');
          }),
        /fail-again/,
      );
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);
    });
  });

  // ── Manual reset ──────────────────────────────────────────────────
  describe('Manual reset', () => {
    it('should return to CLOSED and clear all counters', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);

      cb.reset();

      const stats = cb.getStats();
      assert.strictEqual(stats.state, CircuitState.CLOSED);
      assert.strictEqual(stats.failureCount, 0);
      assert.strictEqual(stats.successCount, 0);
      assert.strictEqual(stats.nextAttemptTime, undefined);
    });

    it('should allow requests again after reset', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      cb.reset();

      const result = await cb.execute(async () => 'after-reset');
      assert.strictEqual(result, 'after-reset');
    });
  });

  // ── Statistics ────────────────────────────────────────────────────
  describe('Statistics (getStats)', () => {
    it('should track totalRequests across successes and failures', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 5 }), mockLogger);
      await cb.execute(async () => 'ok');
      try {
        await cb.execute(async () => {
          throw new Error('e');
        });
      } catch {
        /* */
      }
      await cb.execute(async () => 'ok2');

      const stats = cb.getStats();
      assert.strictEqual(stats.totalRequests, 3);
      assert.strictEqual(stats.totalFailures, 1);
    });

    it('should track uptime', async () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(cb.getStats().uptime >= 10);
    });

    it('should record lastFailureTime on failure', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 5 }), mockLogger);
      const before = Date.now();
      try {
        await cb.execute(async () => {
          throw new Error('e');
        });
      } catch {
        /* */
      }
      const stats = cb.getStats();
      assert.ok(stats.lastFailureTime! >= before);
      assert.ok(stats.lastFailureTime! <= Date.now());
    });

    it('should return undefined lastFailureTime when no failures', () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      assert.strictEqual(cb.getStats().lastFailureTime, undefined);
    });

    it('should track totalFailures cumulatively (not reset by state changes)', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 1 }),
        mockLogger,
      );
      // Trip once
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().totalFailures, 1);

      // Recover
      await new Promise((r) => setTimeout(r, 25));
      await cb.execute(async () => 'ok');

      // Trip again
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().totalFailures, 2);
    });
  });

  // ── isHealthy ─────────────────────────────────────────────────────
  describe('isHealthy', () => {
    it('should be healthy when CLOSED', () => {
      const cb = new CircuitBreaker('svc', makeConfig(), mockLogger);
      assert.strictEqual(cb.isHealthy(), true);
    });

    it('should be unhealthy when OPEN', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 5000 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.isHealthy(), false);
    });

    it('should be healthy when HALF_OPEN with successes', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 3 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));
      await cb.execute(async () => 'probe');
      assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);
      assert.strictEqual(cb.isHealthy(), true);
    });

    it('should always return true when circuit breaker is disabled', () => {
      const cb = new CircuitBreaker('svc', makeConfig({ enabled: false }), mockLogger);
      assert.strictEqual(cb.isHealthy(), true);
    });
  });

  // ── Disabled circuit breaker ──────────────────────────────────────
  describe('Disabled circuit breaker', () => {
    it('should pass all requests through without tracking when disabled', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ enabled: false }), mockLogger);
      const result = await cb.execute(async () => 'pass-through');
      assert.strictEqual(result, 'pass-through');
      assert.strictEqual(cb.getStats().totalRequests, 0);
    });

    it('should not open even after many failures when disabled', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ enabled: false, failureThreshold: 1 }),
        mockLogger,
      );
      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('e');
          });
        } catch {
          /* */
        }
      }
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);
    });
  });

  // ── Configuration ─────────────────────────────────────────────────
  describe('Configuration', () => {
    it('should respect custom failureThreshold', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 5 }), mockLogger);
      await tripBreaker(cb, 4);
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);
      await tripBreaker(cb, 1);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);
    });

    it('should respect custom successThreshold for half-open recovery', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 20, successThreshold: 4 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);
      await new Promise((r) => setTimeout(r, 25));

      for (let i = 0; i < 3; i++) {
        await cb.execute(async () => 'ok');
        assert.strictEqual(cb.getStats().state, CircuitState.HALF_OPEN);
      }
      await cb.execute(async () => 'ok4');
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);
    });

    it('should respect custom resetTimeout', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ failureThreshold: 1, resetTimeout: 100 }),
        mockLogger,
      );
      await tripBreaker(cb, 1);

      // Too early — should still be open
      await new Promise((r) => setTimeout(r, 30));
      await assert.rejects(() => cb.execute(async () => 'too-early'), /OPEN/);

      // Wait remaining time
      await new Promise((r) => setTimeout(r, 80));
      const result = await cb.execute(async () => 'now-ok');
      assert.strictEqual(result, 'now-ok');
    });
  });

  // ── Timeout handling ──────────────────────────────────────────────
  describe('Timeout', () => {
    it('should reject operations that exceed the configured timeout', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ timeout: 50 }), mockLogger);
      const start = Date.now();
      await assert.rejects(
        () => cb.execute(() => new Promise((r) => setTimeout(() => r('late'), 200))),
        /Operation timeout after 50ms/,
      );
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 150, `should timeout quickly, took ${elapsed}ms`);
    });

    it('should count a timeout as a failure', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({ timeout: 20, failureThreshold: 5 }),
        mockLogger,
      );
      try {
        await cb.execute(() => new Promise((r) => setTimeout(() => r('x'), 100)));
      } catch {
        /* */
      }
      assert.strictEqual(cb.getStats().failureCount, 1);
      assert.strictEqual(cb.getStats().totalFailures, 1);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('should handle rapid successive calls', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 3 }), mockLogger);
      const promises = Array.from({ length: 5 }, (_, i) => cb.execute(async () => `result-${i}`));
      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 5);
      assert.strictEqual(cb.getStats().totalRequests, 5);
    });

    it('should handle mixed concurrent successes and failures', async () => {
      const cb = new CircuitBreaker('svc', makeConfig({ failureThreshold: 10 }), mockLogger);
      const ops = [
        cb.execute(async () => 'ok').catch(() => 'caught'),
        cb
          .execute(async () => {
            throw new Error('e');
          })
          .catch(() => 'caught'),
        cb.execute(async () => 'ok2').catch(() => 'caught'),
      ];
      await Promise.all(ops);
      assert.strictEqual(cb.getStats().totalRequests, 3);
      assert.strictEqual(cb.getStats().totalFailures, 1);
    });

    it('should survive a full lifecycle: closed → open → half-open → closed → open', async () => {
      const cb = new CircuitBreaker(
        'svc',
        makeConfig({
          failureThreshold: 2,
          resetTimeout: 20,
          successThreshold: 1,
        }),
        mockLogger,
      );

      // closed → open
      await tripBreaker(cb, 2);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);

      // open → half-open → closed
      await new Promise((r) => setTimeout(r, 25));
      await cb.execute(async () => 'recover');
      assert.strictEqual(cb.getStats().state, CircuitState.CLOSED);

      // closed → open again
      await tripBreaker(cb, 2);
      assert.strictEqual(cb.getStats().state, CircuitState.OPEN);
    });
  });
});

// ── CircuitBreakerManager ───────────────────────────────────────────
describe('CircuitBreakerManager', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  it('should create and return distinct breakers for different names', () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig();
    const a = mgr.getBreaker('a', cfg);
    const b = mgr.getBreaker('b', cfg);
    assert.ok(a);
    assert.ok(b);
    assert.notStrictEqual(a, b);
  });

  it('should return the same breaker instance for the same name', () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig();
    const first = mgr.getBreaker('svc', cfg);
    const second = mgr.getBreaker('svc', cfg);
    assert.strictEqual(first, second);
  });

  it('should aggregate stats via getAllStats', async () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig();
    const a = mgr.getBreaker('a', cfg);
    const b = mgr.getBreaker('b', cfg);
    await a.execute(async () => 'x');
    await b.execute(async () => 'y');

    const allStats = mgr.getAllStats();
    assert.strictEqual(Object.keys(allStats).length, 2);
    assert.strictEqual(allStats['a'].totalRequests, 1);
    assert.strictEqual(allStats['b'].totalRequests, 1);
  });

  it('areAllHealthy returns true when all breakers are closed', async () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig();
    mgr.getBreaker('a', cfg);
    mgr.getBreaker('b', cfg);
    assert.strictEqual(mgr.areAllHealthy(), true);
  });

  it('areAllHealthy returns false when any breaker is open', async () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig({ failureThreshold: 1, resetTimeout: 5000 });
    mgr.getBreaker('healthy', cfg);
    const sick = mgr.getBreaker('sick', cfg);
    await tripBreaker(sick, 1);
    assert.strictEqual(mgr.areAllHealthy(), false);
  });

  it('areAllHealthy returns true with no breakers', () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    assert.strictEqual(mgr.areAllHealthy(), true);
  });

  it('resetAll should reset every managed breaker', async () => {
    const mgr = new CircuitBreakerManager(mockLogger);
    const cfg = makeConfig({ failureThreshold: 1, resetTimeout: 5000 });
    const a = mgr.getBreaker('a', cfg);
    const b = mgr.getBreaker('b', cfg);
    await tripBreaker(a, 1);
    await tripBreaker(b, 1);
    assert.strictEqual(mgr.areAllHealthy(), false);

    mgr.resetAll();
    assert.strictEqual(mgr.areAllHealthy(), true);
    assert.strictEqual(a.getStats().state, CircuitState.CLOSED);
    assert.strictEqual(b.getStats().state, CircuitState.CLOSED);
  });
});

// ── createCircuitBreakerConfig ──────────────────────────────────────
describe('createCircuitBreakerConfig', () => {
  it('should return defaults when no env vars set', () => {
    // Save and clear env vars
    const saved: Record<string, string | undefined> = {};
    const keys = [
      'CIRCUIT_BREAKER_ENABLED',
      'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      'CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
      'CIRCUIT_BREAKER_TIMEOUT',
      'CIRCUIT_BREAKER_RESET_TIMEOUT',
      'CIRCUIT_BREAKER_MONITORING_WINDOW',
    ];
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }

    try {
      const cfg = createCircuitBreakerConfig();
      assert.strictEqual(cfg.enabled, false);
      assert.strictEqual(cfg.failureThreshold, 5);
      assert.strictEqual(cfg.successThreshold, 3);
      assert.strictEqual(cfg.timeout, 10000);
      assert.strictEqual(cfg.resetTimeout, 60000);
      assert.strictEqual(cfg.monitoringWindow, 300000);
    } finally {
      for (const k of keys) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
        else delete process.env[k];
      }
    }
  });

  it('should respect env var overrides', () => {
    const saved: Record<string, string | undefined> = {};
    const envs: Record<string, string> = {
      CIRCUIT_BREAKER_ENABLED: 'true',
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: '10',
      CIRCUIT_BREAKER_SUCCESS_THRESHOLD: '5',
      CIRCUIT_BREAKER_TIMEOUT: '3000',
      CIRCUIT_BREAKER_RESET_TIMEOUT: '30000',
      CIRCUIT_BREAKER_MONITORING_WINDOW: '120000',
    };
    for (const [k, v] of Object.entries(envs)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }

    try {
      const cfg = createCircuitBreakerConfig();
      assert.strictEqual(cfg.enabled, true);
      assert.strictEqual(cfg.failureThreshold, 10);
      assert.strictEqual(cfg.successThreshold, 5);
      assert.strictEqual(cfg.timeout, 3000);
      assert.strictEqual(cfg.resetTimeout, 30000);
      assert.strictEqual(cfg.monitoringWindow, 120000);
    } finally {
      for (const k of Object.keys(envs)) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
        else delete process.env[k];
      }
    }
  });
});
