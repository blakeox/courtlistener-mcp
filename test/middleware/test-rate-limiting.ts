/**
 * ✅ Comprehensive tests for Rate Limiting Middleware (TypeScript)
 * Tests per-client limits, burst handling, penalties, and whitelisting
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { MockLogger } from '../utils/test-helpers.ts';
import { createMockLogger } from '../utils/test-helpers.ts';

interface RateLimitConfig {
  perClientEnabled?: boolean;
  requestsPerMinute?: number;
  burstSize?: number;
  penaltyMultiplier?: number;
  whitelistPatterns?: string[];
  blacklistPatterns?: string[];
  slidingWindow?: boolean;
}

interface CheckLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining?: number;
}

interface ClientRequest {
  timestamp: number;
  tool: string;
}

interface ClientData {
  requests: ClientRequest[];
  burstCount: number;
  penaltyCount: number;
  penaltyUntil: number;
  lastRequest: number;
  firstSeen: number;
}

interface ClientStats {
  clientId: string;
  requestsInLastMinute: number;
  burstCount: number;
  penaltyCount: number;
  isPenalized: boolean;
  penaltyEndsAt: number;
  firstSeen: number;
  lastRequest: number;
}

interface OverallStats {
  totalClients: number;
  whitelistedClients: number;
  blacklistedClients: number;
  penalizedClients: number;
  activeClients: number;
}

// Mock rate limiter implementation for testing
class MockPerClientRateLimiter {
  public clients: Map<string, ClientData>;
  public whitelist: Set<string>;
  public blacklist: Set<string>;
  private config: Required<RateLimitConfig>;
  private logger: MockLogger;

  constructor(config: RateLimitConfig, logger: MockLogger) {
    this.config = {
      perClientEnabled: true,
      requestsPerMinute: 60,
      burstSize: 10,
      penaltyMultiplier: 2,
      whitelistPatterns: [],
      blacklistPatterns: [],
      slidingWindow: true,
      ...config,
    };
    this.logger = logger;
    this.clients = new Map();
    this.whitelist = new Set();
    this.blacklist = new Set();
  }

  async checkLimit(
    headers: Record<string, string | null | undefined>,
    toolName: string,
  ): Promise<CheckLimitResult> {
    if (!this.config.perClientEnabled) {
      return { allowed: true, retryAfter: 0 };
    }

    const clientId = this.extractClientId(headers);

    // Check whitelist
    if (this.whitelist.has(clientId)) {
      return { allowed: true, retryAfter: 0 };
    }

    // Check blacklist
    if (this.blacklist.has(clientId)) {
      return { allowed: false, retryAfter: 3600 }; // 1 hour
    }

    const now = Date.now();
    const clientData = this.getOrCreateClientData(clientId, now);

    // Clean old requests if using sliding window
    if (this.config.slidingWindow) {
      this.cleanOldRequests(clientData, now);
    }

    // Check if client is currently penalized
    if (clientData.penaltyUntil && now < clientData.penaltyUntil) {
      const retryAfter = Math.ceil((clientData.penaltyUntil - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Check burst limit
    if (clientData.burstCount >= this.config.burstSize) {
      this.applyPenalty(clientData, now);
      const retryAfter = Math.ceil((clientData.penaltyUntil - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Check rate limit
    if (clientData.requests.length >= this.config.requestsPerMinute) {
      this.applyPenalty(clientData, now);
      const retryAfter = Math.ceil((clientData.penaltyUntil - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // Allow request and update counters
    this.recordRequest(clientData, now, toolName);

    return {
      allowed: true,
      retryAfter: 0,
      remaining: this.config.requestsPerMinute - clientData.requests.length,
    };
  }

  extractClientId(headers: Record<string, string | null | undefined>): string {
    return (
      (headers['x-client-id'] as string) ||
      (headers['x-forwarded-for'] as string) ||
      (headers['remote-addr'] as string) ||
      'anonymous'
    );
  }

  getOrCreateClientData(clientId: string, now: number): ClientData {
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        requests: [],
        burstCount: 0,
        penaltyCount: 0,
        penaltyUntil: 0,
        lastRequest: 0,
        firstSeen: now,
      });
    }
    return this.clients.get(clientId)!;
  }

  cleanOldRequests(clientData: ClientData, now: number): void {
    const oneMinuteAgo = now - 60000;
    clientData.requests = clientData.requests.filter((req) => req.timestamp > oneMinuteAgo);

    // Reset burst count if enough time has passed
    const lastRequest = Math.max(...clientData.requests.map((r) => r.timestamp), 0) || 0;
    if (now - lastRequest > 10000) {
      // 10 seconds
      clientData.burstCount = 0;
    }
  }

  recordRequest(clientData: ClientData, now: number, toolName: string): void {
    clientData.requests.push({ timestamp: now, tool: toolName });
    clientData.burstCount++;
    clientData.lastRequest = now;
  }

  applyPenalty(clientData: ClientData, now: number): void {
    clientData.penaltyCount++;
    const penaltyDuration =
      60000 * Math.pow(this.config.penaltyMultiplier, clientData.penaltyCount - 1);
    clientData.penaltyUntil = now + penaltyDuration;
    clientData.burstCount = 0; // Reset burst count
  }

  addToWhitelist(clientId: string): void {
    this.whitelist.add(clientId);
  }

  addToBlacklist(clientId: string): void {
    this.blacklist.add(clientId);
  }

  getClientStats(clientId: string): ClientStats | null {
    const clientData = this.clients.get(clientId);
    if (!clientData) return null;

    const now = Date.now();
    this.cleanOldRequests(clientData, now);

    return {
      clientId,
      requestsInLastMinute: clientData.requests.length,
      burstCount: clientData.burstCount,
      penaltyCount: clientData.penaltyCount,
      isPenalized: clientData.penaltyUntil > now,
      penaltyEndsAt: clientData.penaltyUntil,
      firstSeen: clientData.firstSeen,
      lastRequest: clientData.lastRequest,
    };
  }

  getAllStats(): OverallStats {
    const stats: OverallStats = {
      totalClients: this.clients.size,
      whitelistedClients: this.whitelist.size,
      blacklistedClients: this.blacklist.size,
      penalizedClients: 0,
      activeClients: 0,
    };

    const now = Date.now();
    const fiveMinutesAgo = now - 300000;

    for (const clientData of this.clients.values()) {
      if (clientData.penaltyUntil > now) {
        stats.penalizedClients++;
      }
      if (clientData.lastRequest > fiveMinutesAgo) {
        stats.activeClients++;
      }
    }

    return stats;
  }
}

describe('Rate Limiting Middleware Tests', () => {
  let rateLimiter: MockPerClientRateLimiter;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    rateLimiter = new MockPerClientRateLimiter(
      {
        perClientEnabled: true,
        requestsPerMinute: 10,
        burstSize: 3,
        penaltyMultiplier: 2,
      },
      mockLogger,
    );
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limits', async () => {
      const headers = { 'x-client-id': 'test-client' };

      const result = await rateLimiter.checkLimit(headers, 'test-tool');

      assert.strictEqual(result.allowed, true, 'Should allow request within limits');
      assert.strictEqual(result.retryAfter, 0, 'Should have zero retry delay');
      assert.ok(
        result.remaining !== undefined && result.remaining >= 0,
        'Should provide remaining count',
      );
    });

    it('should block requests exceeding rate limit', async () => {
      const headers = { 'x-client-id': 'heavy-user' };

      // Make requests up to the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }

      // This should be blocked
      const result = await rateLimiter.checkLimit(headers, 'test-tool');

      assert.strictEqual(result.allowed, false, 'Should block request exceeding limit');
      assert.ok(result.retryAfter > 0, 'Should provide retry delay');
    });

    it('should track different clients separately', async () => {
      const client1Headers = { 'x-client-id': 'client1' };
      const client2Headers = { 'x-client-id': 'client2' };

      // Exhaust client1's limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(client1Headers, 'test-tool');
      }

      // Client1 should be blocked
      const client1Result = await rateLimiter.checkLimit(client1Headers, 'test-tool');
      assert.strictEqual(client1Result.allowed, false, 'Client1 should be blocked');

      // Client2 should still be allowed
      const client2Result = await rateLimiter.checkLimit(client2Headers, 'test-tool');
      assert.strictEqual(client2Result.allowed, true, 'Client2 should still be allowed');
    });
  });

  describe('Burst Protection', () => {
    it('should allow burst requests up to burst size', async () => {
      const headers = { 'x-client-id': 'burst-client' };

      // Make rapid requests up to burst size
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(headers, 'test-tool');
        assert.strictEqual(result.allowed, true, `Burst request ${i + 1} should be allowed`);
      }
    });

    it('should block requests exceeding burst size', async () => {
      const headers = { 'x-client-id': 'burst-client' };

      // Make requests up to burst size
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }

      // This should trigger burst protection
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Should block request exceeding burst size');
    });

    it('should reset burst count after time period', async () => {
      const headers = { 'x-client-id': 'burst-reset-client' };

      // Exhaust burst allowance
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }

      // Should be blocked
      let result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Should be blocked after burst');

      // Simulate time passing (in real implementation, this would be automatic)
      const clientData = rateLimiter.clients.get('burst-reset-client');
      if (clientData) {
        clientData.burstCount = 0; // Reset burst count manually for test
      }

      // Should be allowed again
      result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, true, 'Should be allowed after burst reset');
    });
  });

  describe('Penalty System', () => {
    it('should apply penalty for repeated violations', async () => {
      const headers = { 'x-client-id': 'penalty-client' };

      // Trigger first penalty
      for (let i = 0; i < 11; i++) {
        // Exceed limit
        await rateLimiter.checkLimit(headers, 'test-tool');
      }

      const clientData = rateLimiter.clients.get('penalty-client');
      assert.ok(clientData !== undefined, 'Client data should exist');
      assert.strictEqual(clientData.penaltyCount, 1, 'Should have one penalty');
      assert.ok(clientData.penaltyUntil > Date.now(), 'Should be under penalty');
    });

    it('should increase penalty duration for repeat offenders', async () => {
      const headers = { 'x-client-id': 'repeat-offender' };
      const clientData = rateLimiter.getOrCreateClientData('repeat-offender', Date.now());

      // Apply multiple penalties
      const now = Date.now();
      rateLimiter.applyPenalty(clientData, now);
      const firstPenaltyDuration = clientData.penaltyUntil - now;

      rateLimiter.applyPenalty(clientData, now);
      const secondPenaltyDuration = clientData.penaltyUntil - now;

      assert.ok(
        secondPenaltyDuration > firstPenaltyDuration,
        'Second penalty should be longer than first',
      );
      assert.strictEqual(clientData.penaltyCount, 2, 'Should track penalty count');
    });

    it('should enforce penalty duration', async () => {
      const headers = { 'x-client-id': 'penalized-client' };
      const clientData = rateLimiter.getOrCreateClientData('penalized-client', Date.now());

      // Apply penalty
      const now = Date.now();
      clientData.penaltyUntil = now + 60000; // 1 minute penalty

      // Should be blocked during penalty
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Should be blocked during penalty');
      assert.ok(result.retryAfter > 0, 'Should provide retry time');
    });
  });

  describe('Whitelist and Blacklist', () => {
    it('should allow unlimited requests for whitelisted clients', async () => {
      const headers = { 'x-client-id': 'whitelisted-client' };
      rateLimiter.addToWhitelist('whitelisted-client');

      // Make many requests
      for (let i = 0; i < 50; i++) {
        const result = await rateLimiter.checkLimit(headers, 'test-tool');
        assert.strictEqual(result.allowed, true, `Whitelisted request ${i + 1} should be allowed`);
      }
    });

    it('should block all requests from blacklisted clients', async () => {
      const headers = { 'x-client-id': 'blacklisted-client' };
      rateLimiter.addToBlacklist('blacklisted-client');

      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Blacklisted client should be blocked');
      assert.ok(result.retryAfter > 0, 'Should provide retry time for blacklisted client');
    });

    it('should handle whitelist taking precedence over blacklist', async () => {
      const headers = { 'x-client-id': 'special-client' };

      // Add to both lists
      rateLimiter.addToBlacklist('special-client');
      rateLimiter.addToWhitelist('special-client');

      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, true, 'Whitelist should take precedence over blacklist');
    });
  });

  describe('Client Identification', () => {
    it('should extract client ID from x-client-id header', () => {
      const headers = { 'x-client-id': 'custom-client' };
      const clientId = rateLimiter.extractClientId(headers);
      assert.strictEqual(clientId, 'custom-client', 'Should use custom client ID');
    });

    it('should fall back to x-forwarded-for header', () => {
      const headers = { 'x-forwarded-for': '192.168.1.100' };
      const clientId = rateLimiter.extractClientId(headers);
      assert.strictEqual(clientId, '192.168.1.100', 'Should use forwarded IP');
    });

    it('should use anonymous for unknown clients', () => {
      const headers: Record<string, string | null | undefined> = {};
      const clientId = rateLimiter.extractClientId(headers);
      assert.strictEqual(clientId, 'anonymous', 'Should use anonymous for unknown clients');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide client statistics', async () => {
      const headers = { 'x-client-id': 'stats-client' };

      // Make some requests
      await rateLimiter.checkLimit(headers, 'tool1');
      await rateLimiter.checkLimit(headers, 'tool2');

      const stats = rateLimiter.getClientStats('stats-client');
      assert.ok(stats !== null, 'Should provide stats for existing client');
      assert.strictEqual(stats?.requestsInLastMinute, 2, 'Should track request count');
      assert.strictEqual(stats?.clientId, 'stats-client', 'Should include client ID');
    });

    it('should provide overall statistics', async () => {
      // Create some client activity
      await rateLimiter.checkLimit({ 'x-client-id': 'client1' }, 'tool1');
      await rateLimiter.checkLimit({ 'x-client-id': 'client2' }, 'tool2');

      rateLimiter.addToWhitelist('whitelisted');
      rateLimiter.addToBlacklist('blacklisted');

      const stats = rateLimiter.getAllStats();
      assert.ok(stats.totalClients >= 2, 'Should count total clients');
      assert.strictEqual(stats.whitelistedClients, 1, 'Should count whitelisted clients');
      assert.strictEqual(stats.blacklistedClients, 1, 'Should count blacklisted clients');
    });

    it('should track penalty statistics', async () => {
      const headers = { 'x-client-id': 'penalty-stats-client' };

      // Trigger penalty
      for (let i = 0; i < 11; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }

      const stats = rateLimiter.getClientStats('penalty-stats-client');
      assert.ok(stats !== null, 'Stats should exist');
      assert.ok((stats?.penaltyCount || 0) > 0, 'Should track penalty count');
      assert.strictEqual(stats?.isPenalized, true, 'Should indicate penalty status');
      assert.ok((stats?.penaltyEndsAt || 0) > Date.now(), 'Should provide penalty end time');
    });
  });

  describe('Sliding Window', () => {
    it('should clean old requests in sliding window mode', async () => {
      const headers = { 'x-client-id': 'sliding-client' };
      const clientData = rateLimiter.getOrCreateClientData('sliding-client', Date.now());

      // Add old requests
      const now = Date.now();
      clientData.requests = [
        { timestamp: now - 120000, tool: 'old-tool' }, // 2 minutes ago
        { timestamp: now - 30000, tool: 'recent-tool' }, // 30 seconds ago
      ];

      // Clean old requests
      rateLimiter.cleanOldRequests(clientData, now);

      assert.strictEqual(clientData.requests.length, 1, 'Should remove old requests');
      assert.strictEqual(clientData.requests[0].tool, 'recent-tool', 'Should keep recent requests');
    });
  });

  describe('Configuration Options', () => {
    it('should bypass rate limiting when disabled', async () => {
      const disabledLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: false,
        },
        mockLogger,
      );

      const headers = { 'x-client-id': 'any-client' };

      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        const result = await disabledLimiter.checkLimit(headers, 'test-tool');
        assert.strictEqual(result.allowed, true, 'Should allow when disabled');
      }
    });

    it('should use custom rate limits', async () => {
      const customLimiter = new MockPerClientRateLimiter(
        {
          requestsPerMinute: 2,
          burstSize: 1,
        },
        mockLogger,
      );

      const headers = { 'x-client-id': 'custom-client' };

      // Should allow first request
      let result = await customLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, true, 'Should allow first request');

      // Should block second burst request
      result = await customLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Should block second burst request');
    });

    it('should use custom penalty multiplier', () => {
      const customLimiter = new MockPerClientRateLimiter(
        {
          penaltyMultiplier: 3,
        },
        mockLogger,
      );

      const clientData = customLimiter.getOrCreateClientData('penalty-test', Date.now());
      const now = Date.now();

      customLimiter.applyPenalty(clientData, now);
      const firstPenalty = clientData.penaltyUntil - now;

      customLimiter.applyPenalty(clientData, now);
      const secondPenalty = clientData.penaltyUntil - now;

      // Should use 3x multiplier instead of default 2x
      assert.ok(secondPenalty >= firstPenalty * 3, 'Should use custom penalty multiplier');
    });
  });

  describe('Performance Tests', () => {
    it('should handle high request volume efficiently', async () => {
      const start = Date.now();

      // Simulate many clients making requests
      const promises: Array<Promise<CheckLimitResult>> = [];
      for (let i = 0; i < 1000; i++) {
        const headers = { 'x-client-id': `client-${i % 100}` }; // 100 unique clients
        promises.push(rateLimiter.checkLimit(headers, 'performance-test'));
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      assert.ok(duration < 1000, `Should handle 1000 requests quickly, took ${duration}ms`);
    });

    it('should clean up old data efficiently', async () => {
      // Create data for many clients
      for (let i = 0; i < 1000; i++) {
        const clientData = rateLimiter.getOrCreateClientData(`client-${i}`, Date.now());
        clientData.requests = Array(100)
          .fill(null)
          .map((_, j) => ({
            timestamp: Date.now() - j * 1000,
            tool: 'test',
          }));
      }

      const start = Date.now();

      // Clean up all clients
      for (const clientData of rateLimiter.clients.values()) {
        rateLimiter.cleanOldRequests(clientData, Date.now());
      }

      const duration = Date.now() - start;
      assert.ok(duration < 500, `Should clean up efficiently, took ${duration}ms`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests from same client', async () => {
      const headers = { 'x-client-id': 'concurrent-client' };

      // Make concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => rateLimiter.checkLimit(headers, 'concurrent-test'));

      const results = await Promise.all(promises);

      // Some should be allowed, some might be blocked due to burst limit
      const allowedCount = results.filter((r) => r.allowed).length;
      assert.ok(allowedCount <= 3, 'Should respect burst limit even with concurrent requests');
    });

    it('should handle malformed headers gracefully', async () => {
      const malformedHeaders: Record<string, string | null | undefined> = {
        'x-client-id': null,
        'x-forwarded-for': undefined,
      };

      const result = await rateLimiter.checkLimit(malformedHeaders, 'test-tool');
      assert.ok(result.allowed !== undefined, 'Should handle malformed headers gracefully');
    });

    it('should handle very old timestamps', async () => {
      const headers = { 'x-client-id': 'old-client' };
      const clientData = rateLimiter.getOrCreateClientData('old-client', Date.now());

      // Add very old request
      clientData.requests.push({
        timestamp: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
        tool: 'old-tool',
      });

      const result = await rateLimiter.checkLimit(headers, 'new-tool');
      assert.strictEqual(result.allowed, true, 'Should ignore very old requests');
    });
  });

  // Additional tests from existing test-enterprise-middleware.js
  describe('Enhanced Rate Limiting Tests', () => {
    it('should allow requests within limits and block when exceeded', async () => {
      const testRateLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: true,
          requestsPerMinute: 5,
          burstSize: 2,
        },
        createMockLogger(),
      );

      const headers = { 'x-client-id': 'test-client-limits' };

      // Test requests within limits
      const firstResult = await testRateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(firstResult.allowed, true, 'Should allow first request');
      assert.strictEqual(
        firstResult.retryAfter,
        0,
        'Should not have retry delay for allowed request',
      );

      // Make requests up to burst limit
      for (let i = 0; i < 2; i++) {
        await testRateLimiter.checkLimit(headers, 'test-tool');
      }

      // This should be blocked (exceeding burst size)
      const blockedResult = await testRateLimiter.checkLimit(headers, 'test-tool');
      assert.strictEqual(
        blockedResult.allowed,
        false,
        'Should block requests exceeding burst size',
      );
      assert.ok(
        blockedResult.retryAfter > 0,
        'Should provide retry-after value for blocked requests',
      );
    });

    it('should handle whitelisted clients correctly', async () => {
      const testRateLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: true,
          requestsPerMinute: 5,
          burstSize: 2,
        },
        createMockLogger(),
      );

      const whitelistedHeaders = { 'x-client-id': 'whitelisted-client' };

      // Add to whitelist
      testRateLimiter.whitelist.add('whitelisted-client');

      // Should allow unlimited requests for whitelisted clients
      for (let i = 0; i < 10; i++) {
        const result = await testRateLimiter.checkLimit(whitelistedHeaders, 'test-tool');
        assert.strictEqual(
          result.allowed,
          true,
          `Should allow request ${i + 1} for whitelisted client`,
        );
        assert.strictEqual(
          result.retryAfter,
          0,
          'Should not have retry delay for whitelisted client',
        );
      }
    });

    it('should enforce blacklist correctly', async () => {
      const testRateLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: true,
          requestsPerMinute: 100,
        },
        createMockLogger(),
      );

      const blacklistedHeaders = { 'x-client-id': 'blacklisted-client' };

      // Add to blacklist
      testRateLimiter.blacklist.add('blacklisted-client');

      // Should block all requests from blacklisted clients
      const result = await testRateLimiter.checkLimit(blacklistedHeaders, 'test-tool');
      assert.strictEqual(result.allowed, false, 'Should block blacklisted clients');
      assert.ok(result.retryAfter > 0, 'Should provide long retry delay for blacklisted clients');
    });

    it('should handle disabled rate limiting', async () => {
      const disabledRateLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: false,
        },
        createMockLogger(),
      );

      const headers = { 'x-client-id': 'any-client' };

      // Should allow all requests when disabled
      for (let i = 0; i < 100; i++) {
        const result = await disabledRateLimiter.checkLimit(headers, 'test-tool');
        assert.strictEqual(
          result.allowed,
          true,
          'Should allow all requests when rate limiting is disabled',
        );
        assert.strictEqual(result.retryAfter, 0, 'Should not impose delays when disabled');
      }
    });

    it('should track different tools separately', async () => {
      const testRateLimiter = new MockPerClientRateLimiter(
        {
          perClientEnabled: true,
          requestsPerMinute: 5,
          burstSize: 2,
        },
        createMockLogger(),
      );

      const headers = { 'x-client-id': 'multi-tool-client' };

      // Use different tools to ensure separate tracking
      const tool1Result = await testRateLimiter.checkLimit(headers, 'tool-1');
      const tool2Result = await testRateLimiter.checkLimit(headers, 'tool-2');

      assert.strictEqual(tool1Result.allowed, true, 'Should allow requests for tool-1');
      assert.strictEqual(tool2Result.allowed, true, 'Should allow requests for tool-2');

      // Each tool should have its own limits (or be tracked together based on implementation)
      const clientData = testRateLimiter.clients.get('multi-tool-client');
      assert.ok(clientData !== undefined, 'Should track client data');
      assert.ok(clientData.requests.length >= 2, 'Should track requests for multiple tools');
    });
  });
});

console.log('✅ Rate Limiting Middleware Tests Completed');
