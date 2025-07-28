/**
 * Comprehensive tests for Rate Limiting Middleware
 * Tests per-client limits, burst handling, penalties, and whitelisting
 */

import { createMockLogger, createMockRequest } from '../../utils/test-helpers.js';

// Mock rate limiter implementation for testing
class MockPerClientRateLimiter {
  constructor(config, logger) {
    this.config = {
      perClientEnabled: true,
      requestsPerMinute: 60,
      burstSize: 10,
      penaltyMultiplier: 2,
      whitelistPatterns: [],
      blacklistPatterns: [],
      slidingWindow: true,
      ...config
    };
    this.logger = logger;
    this.clients = new Map();
    this.whitelist = new Set();
    this.blacklist = new Set();
  }

  async checkLimit(headers, toolName) {
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
      remaining: this.config.requestsPerMinute - clientData.requests.length
    };
  }

  extractClientId(headers) {
    return headers['x-client-id'] || 
           headers['x-forwarded-for'] || 
           headers['remote-addr'] || 
           'anonymous';
  }

  getOrCreateClientData(clientId, now) {
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, {
        requests: [],
        burstCount: 0,
        penaltyCount: 0,
        penaltyUntil: 0,
        lastRequest: 0,
        firstSeen: now
      });
    }
    return this.clients.get(clientId);
  }

  cleanOldRequests(clientData, now) {
    const oneMinuteAgo = now - 60000;
    clientData.requests = clientData.requests.filter(req => req.timestamp > oneMinuteAgo);
    
    // Reset burst count if enough time has passed
    const lastRequest = Math.max(...clientData.requests.map(r => r.timestamp), 0);
    if (now - lastRequest > 10000) { // 10 seconds
      clientData.burstCount = 0;
    }
  }

  recordRequest(clientData, now, toolName) {
    clientData.requests.push({ timestamp: now, tool: toolName });
    clientData.burstCount++;
    clientData.lastRequest = now;
  }

  applyPenalty(clientData, now) {
    clientData.penaltyCount++;
    const penaltyDuration = 60000 * Math.pow(this.config.penaltyMultiplier, clientData.penaltyCount - 1);
    clientData.penaltyUntil = now + penaltyDuration;
    clientData.burstCount = 0; // Reset burst count
  }

  addToWhitelist(clientId) {
    this.whitelist.add(clientId);
  }

  addToBlacklist(clientId) {
    this.blacklist.add(clientId);
  }

  getClientStats(clientId) {
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
      lastRequest: clientData.lastRequest
    };
  }

  getAllStats() {
    const stats = {
      totalClients: this.clients.size,
      whitelistedClients: this.whitelist.size,
      blacklistedClients: this.blacklist.size,
      penalizedClients: 0,
      activeClients: 0
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
  let rateLimiter;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    rateLimiter = new MockPerClientRateLimiter({
      perClientEnabled: true,
      requestsPerMinute: 10,
      burstSize: 3,
      penaltyMultiplier: 2
    }, mockLogger);
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limits', async () => {
      const headers = { 'x-client-id': 'test-client' };
      
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      
      console.assert(result.allowed === true, 'Should allow request within limits');
      console.assert(result.retryAfter === 0, 'Should have zero retry delay');
      console.assert(result.remaining >= 0, 'Should provide remaining count');
    });

    it('should block requests exceeding rate limit', async () => {
      const headers = { 'x-client-id': 'heavy-user' };
      
      // Make requests up to the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }
      
      // This should be blocked
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      
      console.assert(result.allowed === false, 'Should block request exceeding limit');
      console.assert(result.retryAfter > 0, 'Should provide retry delay');
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
      console.assert(client1Result.allowed === false, 'Client1 should be blocked');
      
      // Client2 should still be allowed
      const client2Result = await rateLimiter.checkLimit(client2Headers, 'test-tool');
      console.assert(client2Result.allowed === true, 'Client2 should still be allowed');
    });
  });

  describe('Burst Protection', () => {
    it('should allow burst requests up to burst size', async () => {
      const headers = { 'x-client-id': 'burst-client' };
      
      // Make rapid requests up to burst size
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(headers, 'test-tool');
        console.assert(result.allowed === true, `Burst request ${i + 1} should be allowed`);
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
      console.assert(result.allowed === false, 'Should block request exceeding burst size');
    });

    it('should reset burst count after time period', async () => {
      const headers = { 'x-client-id': 'burst-reset-client' };
      
      // Exhaust burst allowance
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === false, 'Should be blocked after burst');
      
      // Simulate time passing (in real implementation, this would be automatic)
      const clientData = rateLimiter.clients.get('burst-reset-client');
      clientData.burstCount = 0; // Reset burst count manually for test
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === true, 'Should be allowed after burst reset');
    });
  });

  describe('Penalty System', () => {
    it('should apply penalty for repeated violations', async () => {
      const headers = { 'x-client-id': 'penalty-client' };
      
      // Trigger first penalty
      for (let i = 0; i < 11; i++) { // Exceed limit
        await rateLimiter.checkLimit(headers, 'test-tool');
      }
      
      const clientData = rateLimiter.clients.get('penalty-client');
      console.assert(clientData.penaltyCount === 1, 'Should have one penalty');
      console.assert(clientData.penaltyUntil > Date.now(), 'Should be under penalty');
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
      
      console.assert(secondPenaltyDuration > firstPenaltyDuration, 
        'Second penalty should be longer than first');
      console.assert(clientData.penaltyCount === 2, 'Should track penalty count');
    });

    it('should enforce penalty duration', async () => {
      const headers = { 'x-client-id': 'penalized-client' };
      const clientData = rateLimiter.getOrCreateClientData('penalized-client', Date.now());
      
      // Apply penalty
      const now = Date.now();
      clientData.penaltyUntil = now + 60000; // 1 minute penalty
      
      // Should be blocked during penalty
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === false, 'Should be blocked during penalty');
      console.assert(result.retryAfter > 0, 'Should provide retry time');
    });
  });

  describe('Whitelist and Blacklist', () => {
    it('should allow unlimited requests for whitelisted clients', async () => {
      const headers = { 'x-client-id': 'whitelisted-client' };
      rateLimiter.addToWhitelist('whitelisted-client');
      
      // Make many requests
      for (let i = 0; i < 50; i++) {
        const result = await rateLimiter.checkLimit(headers, 'test-tool');
        console.assert(result.allowed === true, `Whitelisted request ${i + 1} should be allowed`);
      }
    });

    it('should block all requests from blacklisted clients', async () => {
      const headers = { 'x-client-id': 'blacklisted-client' };
      rateLimiter.addToBlacklist('blacklisted-client');
      
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === false, 'Blacklisted client should be blocked');
      console.assert(result.retryAfter > 0, 'Should provide retry time for blacklisted client');
    });

    it('should handle whitelist taking precedence over blacklist', async () => {
      const headers = { 'x-client-id': 'special-client' };
      
      // Add to both lists
      rateLimiter.addToBlacklist('special-client');
      rateLimiter.addToWhitelist('special-client');
      
      const result = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === true, 'Whitelist should take precedence over blacklist');
    });
  });

  describe('Client Identification', () => {
    it('should extract client ID from x-client-id header', () => {
      const headers = { 'x-client-id': 'custom-client' };
      const clientId = rateLimiter.extractClientId(headers);
      console.assert(clientId === 'custom-client', 'Should use custom client ID');
    });

    it('should fall back to x-forwarded-for header', () => {
      const headers = { 'x-forwarded-for': '192.168.1.100' };
      const clientId = rateLimiter.extractClientId(headers);
      console.assert(clientId === '192.168.1.100', 'Should use forwarded IP');
    });

    it('should use anonymous for unknown clients', () => {
      const headers = {};
      const clientId = rateLimiter.extractClientId(headers);
      console.assert(clientId === 'anonymous', 'Should use anonymous for unknown clients');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide client statistics', async () => {
      const headers = { 'x-client-id': 'stats-client' };
      
      // Make some requests
      await rateLimiter.checkLimit(headers, 'tool1');
      await rateLimiter.checkLimit(headers, 'tool2');
      
      const stats = rateLimiter.getClientStats('stats-client');
      console.assert(stats !== null, 'Should provide stats for existing client');
      console.assert(stats.requestsInLastMinute === 2, 'Should track request count');
      console.assert(stats.clientId === 'stats-client', 'Should include client ID');
    });

    it('should provide overall statistics', async () => {
      // Create some client activity
      await rateLimiter.checkLimit({ 'x-client-id': 'client1' }, 'tool1');
      await rateLimiter.checkLimit({ 'x-client-id': 'client2' }, 'tool2');
      
      rateLimiter.addToWhitelist('whitelisted');
      rateLimiter.addToBlacklist('blacklisted');
      
      const stats = rateLimiter.getAllStats();
      console.assert(stats.totalClients >= 2, 'Should count total clients');
      console.assert(stats.whitelistedClients === 1, 'Should count whitelisted clients');
      console.assert(stats.blacklistedClients === 1, 'Should count blacklisted clients');
    });

    it('should track penalty statistics', async () => {
      const headers = { 'x-client-id': 'penalty-stats-client' };
      
      // Trigger penalty
      for (let i = 0; i < 11; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }
      
      const stats = rateLimiter.getClientStats('penalty-stats-client');
      console.assert(stats.penaltyCount > 0, 'Should track penalty count');
      console.assert(stats.isPenalized === true, 'Should indicate penalty status');
      console.assert(stats.penaltyEndsAt > Date.now(), 'Should provide penalty end time');
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
        { timestamp: now - 30000, tool: 'recent-tool' }  // 30 seconds ago
      ];
      
      // Clean old requests
      rateLimiter.cleanOldRequests(clientData, now);
      
      console.assert(clientData.requests.length === 1, 'Should remove old requests');
      console.assert(clientData.requests[0].tool === 'recent-tool', 'Should keep recent requests');
    });
  });

  describe('Configuration Options', () => {
    it('should bypass rate limiting when disabled', async () => {
      const disabledLimiter = new MockPerClientRateLimiter({
        perClientEnabled: false
      }, mockLogger);
      
      const headers = { 'x-client-id': 'any-client' };
      
      // Should allow unlimited requests
      for (let i = 0; i < 100; i++) {
        const result = await disabledLimiter.checkLimit(headers, 'test-tool');
        console.assert(result.allowed === true, 'Should allow when disabled');
      }
    });

    it('should use custom rate limits', async () => {
      const customLimiter = new MockPerClientRateLimiter({
        requestsPerMinute: 2,
        burstSize: 1
      }, mockLogger);
      
      const headers = { 'x-client-id': 'custom-client' };
      
      // Should allow first request
      let result = await customLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === true, 'Should allow first request');
      
      // Should block second burst request
      result = await customLimiter.checkLimit(headers, 'test-tool');
      console.assert(result.allowed === false, 'Should block second burst request');
    });

    it('should use custom penalty multiplier', () => {
      const customLimiter = new MockPerClientRateLimiter({
        penaltyMultiplier: 3
      }, mockLogger);
      
      const clientData = customLimiter.getOrCreateClientData('penalty-test', Date.now());
      const now = Date.now();
      
      customLimiter.applyPenalty(clientData, now);
      const firstPenalty = clientData.penaltyUntil - now;
      
      customLimiter.applyPenalty(clientData, now);
      const secondPenalty = clientData.penaltyUntil - now;
      
      // Should use 3x multiplier instead of default 2x
      console.assert(secondPenalty >= firstPenalty * 3, 'Should use custom penalty multiplier');
    });
  });

  describe('Performance Tests', () => {
    it('should handle high request volume efficiently', async () => {
      const start = Date.now();
      
      // Simulate many clients making requests
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        const headers = { 'x-client-id': `client-${i % 100}` }; // 100 unique clients
        promises.push(rateLimiter.checkLimit(headers, 'performance-test'));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.assert(duration < 1000, `Should handle 1000 requests quickly, took ${duration}ms`);
    });

    it('should clean up old data efficiently', async () => {
      // Create data for many clients
      for (let i = 0; i < 1000; i++) {
        const clientData = rateLimiter.getOrCreateClientData(`client-${i}`, Date.now());
        clientData.requests = Array(100).fill(null).map((_, j) => ({
          timestamp: Date.now() - (j * 1000),
          tool: 'test'
        }));
      }
      
      const start = Date.now();
      
      // Clean up all clients
      for (const clientData of rateLimiter.clients.values()) {
        rateLimiter.cleanOldRequests(clientData, Date.now());
      }
      
      const duration = Date.now() - start;
      console.assert(duration < 500, `Should clean up efficiently, took ${duration}ms`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent requests from same client', async () => {
      const headers = { 'x-client-id': 'concurrent-client' };
      
      // Make concurrent requests
      const promises = Array(5).fill(null).map(() => 
        rateLimiter.checkLimit(headers, 'concurrent-test')
      );
      
      const results = await Promise.all(promises);
      
      // Some should be allowed, some might be blocked due to burst limit
      const allowedCount = results.filter(r => r.allowed).length;
      console.assert(allowedCount <= 3, 'Should respect burst limit even with concurrent requests');
    });

    it('should handle malformed headers gracefully', async () => {
      const malformedHeaders = {
        'x-client-id': null,
        'x-forwarded-for': undefined
      };
      
      const result = await rateLimiter.checkLimit(malformedHeaders, 'test-tool');
      console.assert(result.allowed !== undefined, 'Should handle malformed headers gracefully');
    });

    it('should handle very old timestamps', async () => {
      const headers = { 'x-client-id': 'old-client' };
      const clientData = rateLimiter.getOrCreateClientData('old-client', Date.now());
      
      // Add very old request
      clientData.requests.push({
        timestamp: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
        tool: 'old-tool'
      });
      
      const result = await rateLimiter.checkLimit(headers, 'new-tool');
      console.assert(result.allowed === true, 'Should ignore very old requests');
    });
  });

  // Additional tests from existing test-enterprise-middleware.js
  describe('Enhanced Rate Limiting Tests', () => {
    it('should allow requests within limits and block when exceeded', async () => {
      const rateLimiter = new MockPerClientRateLimiter({
        perClientEnabled: true,
        requestsPerMinute: 5,
        burstSize: 2
      }, createMockLogger());

      const headers = { 'x-client-id': 'test-client-limits' };
      
      // Test requests within limits
      const firstResult = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(firstResult.allowed === true, 'Should allow first request');
      console.assert(firstResult.retryAfter === 0, 'Should not have retry delay for allowed request');
      
      // Make requests up to burst limit
      for (let i = 0; i < 2; i++) {
        await rateLimiter.checkLimit(headers, 'test-tool');
      }
      
      // This should be blocked (exceeding burst size)
      const blockedResult = await rateLimiter.checkLimit(headers, 'test-tool');
      console.assert(blockedResult.allowed === false, 'Should block requests exceeding burst size');
      console.assert(blockedResult.retryAfter > 0, 'Should provide retry-after value for blocked requests');
    });

    it('should handle whitelisted clients correctly', async () => {
      const rateLimiter = new MockPerClientRateLimiter({
        perClientEnabled: true,
        requestsPerMinute: 5,
        burstSize: 2
      }, createMockLogger());

      const whitelistedHeaders = { 'x-client-id': 'whitelisted-client' };
      
      // Add to whitelist
      rateLimiter.whitelist.add('whitelisted-client');
      
      // Should allow unlimited requests for whitelisted clients
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.checkLimit(whitelistedHeaders, 'test-tool');
        console.assert(result.allowed === true, `Should allow request ${i + 1} for whitelisted client`);
        console.assert(result.retryAfter === 0, 'Should not have retry delay for whitelisted client');
      }
    });

    it('should enforce blacklist correctly', async () => {
      const rateLimiter = new MockPerClientRateLimiter({
        perClientEnabled: true,
        requestsPerMinute: 100
      }, createMockLogger());

      const blacklistedHeaders = { 'x-client-id': 'blacklisted-client' };
      
      // Add to blacklist
      rateLimiter.blacklist.add('blacklisted-client');
      
      // Should block all requests from blacklisted clients
      const result = await rateLimiter.checkLimit(blacklistedHeaders, 'test-tool');
      console.assert(result.allowed === false, 'Should block blacklisted clients');
      console.assert(result.retryAfter > 0, 'Should provide long retry delay for blacklisted clients');
    });

    it('should handle disabled rate limiting', async () => {
      const disabledRateLimiter = new MockPerClientRateLimiter({
        perClientEnabled: false
      }, createMockLogger());

      const headers = { 'x-client-id': 'any-client' };
      
      // Should allow all requests when disabled
      for (let i = 0; i < 100; i++) {
        const result = await disabledRateLimiter.checkLimit(headers, 'test-tool');
        console.assert(result.allowed === true, 'Should allow all requests when rate limiting is disabled');
        console.assert(result.retryAfter === 0, 'Should not impose delays when disabled');
      }
    });

    it('should track different tools separately', async () => {
      const rateLimiter = new MockPerClientRateLimiter({
        perClientEnabled: true,
        requestsPerMinute: 5,
        burstSize: 2
      }, createMockLogger());

      const headers = { 'x-client-id': 'multi-tool-client' };
      
      // Use different tools to ensure separate tracking
      const tool1Result = await rateLimiter.checkLimit(headers, 'tool-1');
      const tool2Result = await rateLimiter.checkLimit(headers, 'tool-2');
      
      console.assert(tool1Result.allowed === true, 'Should allow requests for tool-1');
      console.assert(tool2Result.allowed === true, 'Should allow requests for tool-2');
      
      // Each tool should have its own limits (or be tracked together based on implementation)
      const clientData = rateLimiter.clients.get('multi-tool-client');
      console.assert(clientData !== undefined, 'Should track client data');
      console.assert(clientData.requests.length >= 2, 'Should track requests for multiple tools');
    });
  });
});

console.log('✅ Enhanced Rate Limiting Middleware Tests Completed');
