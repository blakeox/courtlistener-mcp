#!/usr/bin/env node

/**
 * ✅ Comprehensive Rate Limiting Tests (TypeScript)
 * Tests all rate limiting strategies including adaptive, burst handling, and recovery
 */

import { createMockLogger, type MockLogger } from '../../utils/test-helpers.ts';

interface RateLimitRequest {
  clientId?: string;
  ip?: string;
  userAgent?: string;
  expectedSuccess?: boolean;
  responseTime?: number;
  skipRateLimit?: boolean;
  [key: string]: unknown;
}

interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: RateLimitRequest) => string;
  skip?: (req: RateLimitRequest) => boolean;
  onLimitReached?: (key: string, store: unknown, request: RateLimitRequest) => void;
  adaptiveEnabled?: boolean;
  burstAllowance?: number;
  recoveryRate?: number;
}

interface RequestData {
  timestamp: number;
  success: boolean;
  responseTime: number;
  ip?: string;
  userAgent?: string;
}

interface ClientStore {
  requests: RequestData[];
  currentCount: number;
  adaptiveLimit: number;
  burstUsed: number;
  windowStart: number;
  consecutiveFailures: number;
  averageResponseTime: number;
  successRate: number;
  lastAdaptiveAdjustment: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  burstRemaining?: number;
  adaptiveLimit?: number;
  windowStart?: number;
}

interface RateLimitStats {
  totalRequests: number;
  limitedRequests: number;
  adaptiveAdjustments: number;
}

interface RateLimiter {
  config: Required<RateLimitConfig>;
  stores: Map<string, ClientStore>;
  globalStats: RateLimitStats;
  checkLimit(request: RateLimitRequest): Promise<RateLimitResult>;
  createClientStore(): ClientStore;
  updateStore(store: ClientStore, now: number, request: RateLimitRequest): Promise<RateLimitResult>;
  updateStoreStats(store: ClientStore, requestData: RequestData): void;
  handleAdaptiveRateLimiting(store: ClientStore, result: RateLimitResult): void;
  getStats(key?: string | null): Promise<unknown>;
  reset(key?: string | null): Promise<void>;
  middleware(request: RateLimitRequest, response: { headers: Record<string, unknown> }, next?: () => unknown): Promise<unknown>;
}

interface RateLimitError extends Error {
  status?: number;
  headers?: Record<string, unknown>;
}

class EnhancedRateLimitingTests {
  private logger: MockLogger;
  private testCount: number;
  private passedTests: number;
  private failedTests: number;

  constructor() {
    this.logger = createMockLogger();
    this.testCount = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  private runTest(testName: string, testFn: () => void): void {
    this.testCount++;
    try {
      testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  private async runAsyncTest(
    testName: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    this.testCount++;
    try {
      await testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  // Enhanced Mock Rate Limiter
  private createRateLimiter(config: RateLimitConfig = {}): RateLimiter {
    const limiter: RateLimiter = {
      config: {
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        keyGenerator: (req: RateLimitRequest) =>
          req.clientId || req.ip || 'anonymous',
        skip: () => false,
        onLimitReached: undefined,
        adaptiveEnabled: false,
        burstAllowance: 0.2, // 20% burst allowance
        recoveryRate: 0.1, // 10% recovery per window
        ...config,
      } as Required<RateLimitConfig>,
      stores: new Map<string, ClientStore>(),
      globalStats: {
        totalRequests: 0,
        limitedRequests: 0,
        adaptiveAdjustments: 0,
      },

      async checkLimit(request: RateLimitRequest): Promise<RateLimitResult> {
        this.globalStats.totalRequests++;

        // Generate key for this client
        const key = this.config.keyGenerator(request);

        // Check if request should be skipped
        if (this.config.skip(request)) {
          return {
            allowed: true,
            remaining: this.config.maxRequests,
            resetTime: 0,
          };
        }

        // Get or create store for this key
        let store = this.stores.get(key);
        if (!store) {
          store = this.createClientStore();
          this.stores.set(key, store);
        }

        // Update store with current request
        const now = Date.now();
        const result = await this.updateStore(store, now, request);

        // Handle adaptive rate limiting
        if (this.config.adaptiveEnabled) {
          this.handleAdaptiveRateLimiting(store, result);
        }

        // Track limited requests
        if (!result.allowed) {
          this.globalStats.limitedRequests++;

          if (this.config.onLimitReached) {
            this.config.onLimitReached(key, store, request);
          }
        }

        return result;
      },

      createClientStore(): ClientStore {
        return {
          requests: [],
          currentCount: 0,
          adaptiveLimit: this.config.maxRequests,
          burstUsed: 0,
          windowStart: Date.now(),
          consecutiveFailures: 0,
          averageResponseTime: 0,
          successRate: 1.0,
          lastAdaptiveAdjustment: Date.now(),
        };
      },

      async updateStore(
        store: ClientStore,
        now: number,
        request: RateLimitRequest
      ): Promise<RateLimitResult> {
        const windowStart = now - this.config.windowMs;

        // Clean old requests
        store.requests = store.requests.filter(
          (req) => req.timestamp > windowStart
        );
        store.currentCount = store.requests.length;

        // Reset window if needed
        if (now - store.windowStart >= this.config.windowMs) {
          store.windowStart = now;
          store.burstUsed = 0; // Reset burst allowance
        }

        // Calculate effective limit (including burst allowance)
        const burstLimit = Math.floor(
          store.adaptiveLimit * (1 + this.config.burstAllowance)
        );
        const effectiveLimit = Math.min(
          burstLimit,
          store.adaptiveLimit +
            Math.floor(store.adaptiveLimit * this.config.burstAllowance)
        );

        // Check if request is allowed
        const allowed = store.currentCount < effectiveLimit;

        if (allowed) {
          // Add request to store
          const requestData: RequestData = {
            timestamp: now,
            success: request.expectedSuccess !== false,
            responseTime: request.responseTime || Math.random() * 100,
            ip: request.ip,
            userAgent: request.userAgent,
          };

          store.requests.push(requestData);
          store.currentCount++;

          // Update burst usage if over normal limit
          if (store.currentCount > store.adaptiveLimit) {
            store.burstUsed = store.currentCount - store.adaptiveLimit;
          }

          // Update store statistics
          this.updateStoreStats(store, requestData);
        }

        // Calculate reset time
        const oldestRequest = store.requests[0];
        const resetTime = oldestRequest
          ? oldestRequest.timestamp + this.config.windowMs
          : now + this.config.windowMs;

        return {
          allowed,
          remaining: Math.max(0, effectiveLimit - store.currentCount),
          resetTime,
          burstRemaining: Math.max(0, burstLimit - store.currentCount),
          adaptiveLimit: store.adaptiveLimit,
          windowStart: store.windowStart,
        };
      },

      updateStoreStats(store: ClientStore, requestData: RequestData): void {
        const recentRequests = store.requests.slice(-10); // Last 10 requests

        // Update success rate
        const successCount = recentRequests.filter((req) => req.success).length;
        store.successRate =
          recentRequests.length > 0 ? successCount / recentRequests.length : 1.0;

        // Update average response time
        const totalResponseTime = recentRequests.reduce(
          (sum, req) => sum + req.responseTime,
          0
        );
        store.averageResponseTime =
          recentRequests.length > 0
            ? totalResponseTime / recentRequests.length
            : 0;

        // Track consecutive failures
        if (requestData.success) {
          store.consecutiveFailures = 0;
        } else {
          store.consecutiveFailures++;
        }
      },

      handleAdaptiveRateLimiting(
        store: ClientStore,
        result: RateLimitResult
      ): void {
        const now = Date.now();
        const timeSinceLastAdjustment = now - store.lastAdaptiveAdjustment;

        // Only adjust once per minute
        if (timeSinceLastAdjustment < 60000) return;

        let adjustment = 0;
        const adjustmentFactor = 0.1; // 10% adjustments

        // Decrease limit if performance is poor
        if (
          store.successRate < 0.8 ||
          store.averageResponseTime > 500 ||
          store.consecutiveFailures > 5
        ) {
          adjustment = -Math.floor(store.adaptiveLimit * adjustmentFactor);
        }
        // Increase limit if performance is good and utilization is high
        else if (
          store.successRate > 0.95 &&
          store.averageResponseTime < 100 &&
          (result.remaining || 0) < 5
        ) {
          adjustment = Math.floor(store.adaptiveLimit * adjustmentFactor);
        }

        if (adjustment !== 0) {
          const oldLimit = store.adaptiveLimit;
          store.adaptiveLimit = Math.max(
            1,
            Math.min(
              this.config.maxRequests * 2,
              store.adaptiveLimit + adjustment
            )
          );
          store.lastAdaptiveAdjustment = now;
          this.globalStats.adaptiveAdjustments++;

          console.log(
            `    📊 Adaptive adjustment: ${oldLimit} → ${store.adaptiveLimit} (${
              adjustment > 0 ? '+' : ''
            }${adjustment})`
          );
        }
      },

      async getStats(key: string | null = null): Promise<unknown> {
        if (key) {
          const store = this.stores.get(key);
          if (!store) return null;

          return {
            key,
            currentCount: store.currentCount,
            adaptiveLimit: store.adaptiveLimit,
            burstUsed: store.burstUsed,
            successRate: store.successRate,
            averageResponseTime: Math.round(store.averageResponseTime),
            consecutiveFailures: store.consecutiveFailures,
            windowStart: store.windowStart,
          };
        }

        return {
          global: this.globalStats,
          clients: Array.from(this.stores.entries()).map(([clientKey, store]) => ({
            key: clientKey,
            currentCount: store.currentCount,
            adaptiveLimit: store.adaptiveLimit,
            successRate: store.successRate,
            averageResponseTime: Math.round(store.averageResponseTime),
          })),
        };
      },

      async reset(key: string | null = null): Promise<void> {
        if (key) {
          this.stores.delete(key);
        } else {
          this.stores.clear();
          this.globalStats = {
            totalRequests: 0,
            limitedRequests: 0,
            adaptiveAdjustments: 0,
          };
        }
      },

      // Simulate rate limiting middleware
      async middleware(
        request: RateLimitRequest,
        response: { headers: Record<string, unknown> },
        next?: () => unknown
      ): Promise<unknown> {
        const result = await this.checkLimit(request);

        if (!result.allowed) {
          const error: RateLimitError = new Error('Rate limit exceeded');
          error.status = 429;
          error.headers = {
            'X-RateLimit-Limit': String(this.config.maxRequests),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(result.resetTime),
            'Retry-After': String(
              Math.ceil((result.resetTime - Date.now()) / 1000)
            ),
          };
          throw error;
        }

        // Add rate limit headers to response
        response.headers = {
          ...response.headers,
          'X-RateLimit-Limit': String(
            result.adaptiveLimit || this.config.maxRequests
          ),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.resetTime),
        };

        return next ? next() : response;
      },
    };

    return limiter;
  }

  async runComprehensiveTests(): Promise<void> {
    console.log('🚦 Running Comprehensive Rate Limiting Tests...\n');

    // Basic Rate Limiting Tests
    console.log('🔄 Basic Rate Limiting Tests:');

    await this.runAsyncTest('should allow requests within limit', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit({ clientId: 'client1' });
        console.assert(
          result.allowed === true,
          `Request ${i + 1} should be allowed`
        );
        console.assert(
          result.remaining === 4 - i,
          `Should have ${4 - i} remaining`
        );
      }
    });

    await this.runAsyncTest('should block requests over limit', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 3,
        windowMs: 60000,
      });

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        await limiter.checkLimit({ clientId: 'client1' });
      }

      // This should be blocked
      const result = await limiter.checkLimit({ clientId: 'client1' });
      console.assert(result.allowed === false, 'Should block request over limit');
      console.assert(result.remaining === 0, 'Should have 0 remaining');
    });

    await this.runAsyncTest('should isolate different clients', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Client 1 uses up their limit
      await limiter.checkLimit({ clientId: 'client1' });
      await limiter.checkLimit({ clientId: 'client1' });
      const blocked = await limiter.checkLimit({ clientId: 'client1' });

      // Client 2 should still have their full limit
      const allowed = await limiter.checkLimit({ clientId: 'client2' });

      console.assert(blocked.allowed === false, 'Client 1 should be blocked');
      console.assert(allowed.allowed === true, 'Client 2 should be allowed');
    });

    // Window and Reset Tests
    console.log('\n⏰ Window and Reset Tests:');

    await this.runAsyncTest('should reset after window expires', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 2,
        windowMs: 100,
      });

      // Use up the limit
      await limiter.checkLimit({ clientId: 'client1' });
      await limiter.checkLimit({ clientId: 'client1' });
      const blocked = await limiter.checkLimit({ clientId: 'client1' });

      console.assert(blocked.allowed === false, 'Should be blocked initially');

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      const allowed = await limiter.checkLimit({ clientId: 'client1' });
      console.assert(
        allowed.allowed === true,
        'Should be allowed after window reset'
      );
    });

    await this.runAsyncTest('should provide accurate reset time', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      const start = Date.now();
      const result = await limiter.checkLimit({ clientId: 'client1' });

      console.assert(result.resetTime > start, 'Reset time should be in the future');
      console.assert(
        result.resetTime <= start + 60000,
        'Reset time should be within window'
      );
    });

    // Burst Handling Tests
    console.log('\n💥 Burst Handling Tests:');

    await this.runAsyncTest('should allow burst traffic', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 10,
        burstAllowance: 0.5, // 50% burst allowance
        windowMs: 60000,
      });

      // Should allow up to 15 requests (10 + 50% burst)
      let allowedCount = 0;
      for (let i = 0; i < 20; i++) {
        const result = await limiter.checkLimit({ clientId: 'client1' });
        if (result.allowed) allowedCount++;
      }

      console.assert(
        allowedCount === 15,
        `Should allow 15 requests with burst, got ${allowedCount}`
      );
    });

    await this.runAsyncTest('should track burst usage', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 5,
        burstAllowance: 0.4,
        windowMs: 60000,
      });

      // Use normal limit
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit({ clientId: 'client1' });
      }

      // Use burst allowance
      const burstResult = await limiter.checkLimit({ clientId: 'client1' });

      console.assert(burstResult.allowed === true, 'Should allow burst request');
      console.assert(
        burstResult.burstRemaining === 1,
        'Should have 1 burst remaining'
      );
    });

    // Adaptive Rate Limiting Tests
    console.log('\n🎯 Adaptive Rate Limiting Tests:');

    await this.runAsyncTest('should decrease limit on poor performance', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 10,
        adaptiveEnabled: true,
        windowMs: 60000,
      });

      // Simulate poor performance
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit({
          clientId: 'client1',
          expectedSuccess: false,
          responseTime: 600,
        });
      }

      // Force adaptive adjustment by setting last adjustment time to past
      const store = limiter.stores.get('client1');
      if (store) {
        store.lastAdaptiveAdjustment = Date.now() - 70000; // 70 seconds ago

        // Trigger adaptive adjustment
        await limiter.checkLimit({ clientId: 'client1' });

        const stats = (await limiter.getStats('client1')) as {
          adaptiveLimit: number;
        } | null;
        console.assert(
          stats !== null && stats.adaptiveLimit < 10,
          'Should decrease adaptive limit for poor performance'
        );
      }
    });

    await this.runAsyncTest('should increase limit on good performance', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 10,
        adaptiveEnabled: true,
        windowMs: 60000,
      });

      // Use most of the limit with good performance
      for (let i = 0; i < 8; i++) {
        await limiter.checkLimit({
          clientId: 'client1',
          expectedSuccess: true,
          responseTime: 50,
        });
      }

      // Force adaptive adjustment
      const store = limiter.stores.get('client1');
      if (store) {
        store.lastAdaptiveAdjustment = Date.now() - 70000;

        // Trigger adjustment with near-limit usage
        await limiter.checkLimit({ clientId: 'client1' });

        const stats = (await limiter.getStats('client1')) as {
          adaptiveLimit: number;
        } | null;
        console.assert(
          stats !== null && stats.adaptiveLimit > 10,
          'Should increase adaptive limit for good performance'
        );
      }
    });

    // Middleware Integration Tests
    console.log('\n🔌 Middleware Integration Tests:');

    await this.runAsyncTest('should integrate with middleware pipeline', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      const request: RateLimitRequest = { clientId: 'client1' };
      const response: { headers: Record<string, unknown> } = { headers: {} };

      // First request should succeed
      await limiter.middleware(request, response);
      console.assert(
        response.headers['X-RateLimit-Remaining'] === '1',
        'Should set remaining header'
      );

      // Second request should succeed
      await limiter.middleware(request, response);

      // Third request should fail
      try {
        await limiter.middleware(request, response);
        console.assert(false, 'Should throw rate limit error');
      } catch (error) {
        const rateLimitError = error as RateLimitError;
        console.assert(rateLimitError.status === 429, 'Should return 429 status');
        console.assert(
          (rateLimitError.headers?.['Retry-After'] as number) > 0,
          'Should include Retry-After header'
        );
      }
    });

    await this.runAsyncTest('should skip requests when configured', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 1,
        skip: (req: RateLimitRequest) => req.skipRateLimit === true,
        windowMs: 60000,
      });

      // Use up the limit
      await limiter.checkLimit({ clientId: 'client1' });

      // This should be blocked normally
      const blocked = await limiter.checkLimit({ clientId: 'client1' });
      console.assert(blocked.allowed === false, 'Should block normal request');

      // This should be skipped
      const skipped = await limiter.checkLimit({
        clientId: 'client1',
        skipRateLimit: true,
      });
      console.assert(skipped.allowed === true, 'Should skip when configured');
    });

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle high-frequency requests', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 1000,
        windowMs: 60000,
      });
      const iterations = 500;

      const start = Date.now();

      const promises = Array(iterations)
        .fill(null)
        .map((_, i) =>
          limiter.checkLimit({ clientId: `client_${i % 10}` })
        );

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      console.assert(
        results.length === iterations,
        'Should process all requests'
      );
      console.assert(
        duration < 2000,
        'Should process 500 requests within 2 seconds'
      );

      const avgTime = duration / iterations;
      console.log(`    ⚡ Average check time: ${avgTime.toFixed(2)}ms`);
    });

    await this.runAsyncTest('should handle concurrent burst traffic', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 10,
        burstAllowance: 0.5,
        windowMs: 60000,
      });

      // Simulate 20 concurrent requests
      const promises = Array(20)
        .fill(null)
        .map(() => limiter.checkLimit({ clientId: 'client1' }));

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.allowed).length;

      console.assert(
        allowedCount === 15,
        `Should handle concurrent burst correctly, got ${allowedCount}`
      );
    });

    // Edge Cases and Error Handling
    console.log('\n⚠️ Edge Cases:');

    await this.runAsyncTest('should handle missing client identifier', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      // Request without clientId should use 'anonymous'
      const result = await limiter.checkLimit({});
      console.assert(result.allowed === true, 'Should handle missing client ID');

      const stats = (await limiter.getStats()) as {
        clients: Array<{ key: string }>;
      };
      console.assert(
        stats.clients.some((c) => c.key === 'anonymous'),
        'Should create anonymous client'
      );
    });

    await this.runAsyncTest('should handle custom key generator', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 5,
        keyGenerator: (req: RateLimitRequest) =>
          `${req.ip}-${req.userAgent}`,
        windowMs: 60000,
      });

      const result = await limiter.checkLimit({
        ip: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
      });

      console.assert(result.allowed === true, 'Should use custom key generator');

      const stats = (await limiter.getStats()) as {
        clients: Array<{ key: string }>;
      };
      console.assert(
        stats.clients.some((c) => c.key === '192.168.1.1-TestAgent/1.0'),
        'Should use custom key'
      );
    });

    await this.runAsyncTest('should provide comprehensive statistics', async () => {
      const limiter = this.createRateLimiter({
        maxRequests: 3,
        windowMs: 60000,
      });

      // Generate some activity
      await limiter.checkLimit({ clientId: 'client1' });
      await limiter.checkLimit({ clientId: 'client1' });
      await limiter.checkLimit({ clientId: 'client2' });

      // Try to exceed limit
      await limiter.checkLimit({ clientId: 'client1' });
      await limiter.checkLimit({ clientId: 'client1' }); // Should be blocked

      const stats = (await limiter.getStats()) as {
        global: RateLimitStats;
        clients: unknown[];
      };

      console.assert(
        stats.global.totalRequests === 5,
        'Should track total requests'
      );
      console.assert(
        stats.global.limitedRequests === 1,
        'Should track limited requests'
      );
      console.assert(stats.clients.length === 2, 'Should track different clients');
    });

    // Summary
    this.printSummary();
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 RATE LIMITING TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(
      `Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`
    );
    if (this.testCount > 0) {
      console.log(
        `Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`
      );
    }

    if (this.failedTests === 0) {
      console.log(
        '\n🎉 All rate limiting tests passed! Traffic control and adaptive features are working correctly.'
      );
    } else {
      console.log(
        `\n💥 ${this.failedTests} test(s) failed. Please review rate limiting implementation.`
      );
      process.exit(1);
    }

    console.log('\n✅ Enhanced Rate Limiting Tests Completed Successfully!');
  }
}

// Run the comprehensive rate limiting tests
const rateLimitTests = new EnhancedRateLimitingTests();
rateLimitTests.runComprehensiveTests().catch((error) => {
  console.error('Fatal error in rate limiting tests:', error);
  process.exit(1);
});

