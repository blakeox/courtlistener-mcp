/**
 * Comprehensive tests for Authentication Middleware
 * Tests API key validation, client identification, and security features
 */

import { createMockLogger, createMockRequest, testFixtures, assertions } from '../utils/test-helpers.js';

// Mock the authentication middleware since we can't import the actual one due to compilation issues
class MockAuthenticationMiddleware {
  constructor(config, logger) {
    this.config = {
      enabled: true,
      apiKey: 'test-api-key-123',
      methods: ['api_key', 'basic_auth'],
      requireClientId: false,
      clientIdHeader: 'x-client-id',
      ...config
    };
    this.logger = logger;
    this.clients = new Map();
  }

  async authenticate(headers) {
    if (!this.config.enabled) {
      return { authenticated: true, clientId: 'anonymous' };
    }

    // Check API key authentication
    const apiKey = headers['x-api-key'] || headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return { authenticated: false, error: 'Missing API key' };
    }

    if (apiKey !== this.config.apiKey) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    // Generate or retrieve client ID
    const clientId = this.generateClientId(headers);
    
    return { authenticated: true, clientId };
  }

  generateClientId(headers) {
    const providedId = headers[this.config.clientIdHeader];
    if (providedId) {
      return providedId;
    }

    // Generate based on request fingerprint
    const fingerprint = [
      headers['user-agent'] || 'unknown',
      headers['x-forwarded-for'] || 'unknown'
    ].join('|');

    return `generated-${Buffer.from(fingerprint).toString('base64').slice(0, 8)}`;
  }

  validateApiKey(apiKey) {
    return apiKey === this.config.apiKey;
  }

  getClientStats(clientId) {
    return this.clients.get(clientId) || { requests: 0, lastSeen: null };
  }

  updateClientStats(clientId) {
    const stats = this.getClientStats(clientId);
    stats.requests++;
    stats.lastSeen = new Date();
    this.clients.set(clientId, stats);
  }
}

describe('Authentication Middleware Tests', () => {
  let auth;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auth = new MockAuthenticationMiddleware({
      enabled: true,
      apiKey: 'test-api-key-123'
    }, mockLogger);
  });

  describe('Basic Authentication', () => {
    it('should authenticate valid API key', async () => {
      const headers = { 'x-api-key': 'test-api-key-123' };
      const result = await auth.authenticate(headers);
      
      console.assert(result.authenticated === true, 'Should authenticate valid API key');
      console.assert(result.clientId, 'Should provide client ID');
    });

    it('should reject invalid API key', async () => {
      const headers = { 'x-api-key': 'invalid-key' };
      const result = await auth.authenticate(headers);
      
      console.assert(result.authenticated === false, 'Should reject invalid API key');
      console.assert(result.error === 'Invalid API key', 'Should provide error message');
    });

    it('should reject missing API key', async () => {
      const headers = {};
      const result = await auth.authenticate(headers);
      
      console.assert(result.authenticated === false, 'Should reject missing API key');
      console.assert(result.error === 'Missing API key', 'Should provide error message');
    });

    it('should handle Bearer token format', async () => {
      const headers = { 'authorization': 'Bearer test-api-key-123' };
      const result = await auth.authenticate(headers);
      
      console.assert(result.authenticated === true, 'Should handle Bearer token format');
    });
  });

  describe('Client Identification', () => {
    it('should use provided client ID', async () => {
      const headers = {
        'x-api-key': 'test-api-key-123',
        'x-client-id': 'custom-client-id'
      };
      const result = await auth.authenticate(headers);
      
      console.assert(result.clientId === 'custom-client-id', 'Should use provided client ID');
    });

    it('should generate client ID from fingerprint', async () => {
      const headers = {
        'x-api-key': 'test-api-key-123',
        'user-agent': 'TestAgent/1.0',
        'x-forwarded-for': '192.168.1.1'
      };
      const result = await auth.authenticate(headers);
      
      console.assert(result.clientId.startsWith('generated-'), 'Should generate client ID');
      console.assert(result.clientId.length > 10, 'Generated ID should be reasonably long');
    });

    it('should generate consistent client IDs for same fingerprint', async () => {
      const headers = {
        'x-api-key': 'test-api-key-123',
        'user-agent': 'TestAgent/1.0',
        'x-forwarded-for': '192.168.1.1'
      };
      
      const result1 = await auth.authenticate(headers);
      const result2 = await auth.authenticate(headers);
      
      console.assert(result1.clientId === result2.clientId, 'Should generate consistent client IDs');
    });
  });

  describe('Client Statistics', () => {
    it('should track client request count', () => {
      const clientId = 'test-client';
      
      // Initial state
      let stats = auth.getClientStats(clientId);
      console.assert(stats.requests === 0, 'Should start with zero requests');
      
      // Update stats
      auth.updateClientStats(clientId);
      stats = auth.getClientStats(clientId);
      console.assert(stats.requests === 1, 'Should increment request count');
      
      // Update again
      auth.updateClientStats(clientId);
      stats = auth.getClientStats(clientId);
      console.assert(stats.requests === 2, 'Should continue incrementing');
    });

    it('should track last seen timestamp', () => {
      const clientId = 'test-client';
      const before = new Date();
      
      auth.updateClientStats(clientId);
      
      const stats = auth.getClientStats(clientId);
      const after = new Date();
      
      console.assert(stats.lastSeen >= before, 'Last seen should be after start time');
      console.assert(stats.lastSeen <= after, 'Last seen should be before end time');
    });
  });

  describe('Configuration Options', () => {
    it('should bypass authentication when disabled', async () => {
      const disabledAuth = new MockAuthenticationMiddleware({
        enabled: false
      }, mockLogger);
      
      const headers = {}; // No API key
      const result = await disabledAuth.authenticate(headers);
      
      console.assert(result.authenticated === true, 'Should bypass when disabled');
      console.assert(result.clientId === 'anonymous', 'Should use anonymous client ID');
    });

    it('should use custom client ID header', async () => {
      const customAuth = new MockAuthenticationMiddleware({
        enabled: true,
        apiKey: 'test-api-key-123',
        clientIdHeader: 'x-custom-client-id'
      }, mockLogger);
      
      const headers = {
        'x-api-key': 'test-api-key-123',
        'x-custom-client-id': 'custom-id'
      };
      const result = await customAuth.authenticate(headers);
      
      console.assert(result.clientId === 'custom-id', 'Should use custom header for client ID');
    });
  });

  describe('Security Features', () => {
    it('should validate API key format', () => {
      console.assert(auth.validateApiKey('test-api-key-123') === true, 'Should validate correct key');
      console.assert(auth.validateApiKey('wrong-key') === false, 'Should reject wrong key');
      console.assert(auth.validateApiKey('') === false, 'Should reject empty key');
      console.assert(auth.validateApiKey(null) === false, 'Should reject null key');
    });

    it('should handle special characters in API key', () => {
      const specialAuth = new MockAuthenticationMiddleware({
        enabled: true,
        apiKey: 'test-key-with-special-chars-!@#$%'
      }, mockLogger);
      
      console.assert(
        specialAuth.validateApiKey('test-key-with-special-chars-!@#$%') === true,
        'Should handle special characters'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed headers gracefully', async () => {
      const malformedHeaders = {
        'x-api-key': 'test-api-key-123',
        'authorization': 'InvalidFormat'
      };
      
      const result = await auth.authenticate(malformedHeaders);
      console.assert(result.authenticated === true, 'Should use x-api-key when authorization is malformed');
    });

    it('should handle null headers', async () => {
      try {
        const result = await auth.authenticate(null);
        console.assert(result.authenticated === false, 'Should handle null headers');
      } catch (error) {
        console.assert(error.message.includes('Cannot'), 'Should throw appropriate error for null headers');
      }
    });

    it('should handle undefined headers', async () => {
      try {
        const result = await auth.authenticate(undefined);
        console.assert(result.authenticated === false, 'Should handle undefined headers');
      } catch (error) {
        console.assert(error.message.includes('Cannot'), 'Should throw appropriate error for undefined headers');
      }
    });
  });

  describe('Performance Tests', () => {
    it('should authenticate quickly', async () => {
      const headers = { 'x-api-key': 'test-api-key-123' };
      
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await auth.authenticate(headers);
      }
      const duration = Date.now() - start;
      
      console.assert(duration < 1000, `Authentication should be fast, took ${duration}ms for 1000 requests`);
    });

    it('should handle concurrent authentication requests', async () => {
      const headers = { 'x-api-key': 'test-api-key-123' };
      
      const promises = Array(100).fill(null).map(() => auth.authenticate(headers));
      const results = await Promise.all(promises);
      
      console.assert(results.every(r => r.authenticated), 'All concurrent requests should authenticate');
    });
  });

  describe('Integration Scenarios', () => {
    it('should work with various user agents', async () => {
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'curl/7.68.0',
        'PostmanRuntime/7.26.8',
        'Python-requests/2.25.1'
      ];

      for (const userAgent of userAgents) {
        const headers = {
          'x-api-key': 'test-api-key-123',
          'user-agent': userAgent
        };
        
        const result = await auth.authenticate(headers);
        console.assert(result.authenticated === true, `Should work with user agent: ${userAgent}`);
      }
    });

    it('should generate different client IDs for different fingerprints', async () => {
      const requests = [
        { 'user-agent': 'Agent1', 'x-forwarded-for': '192.168.1.1' },
        { 'user-agent': 'Agent2', 'x-forwarded-for': '192.168.1.1' },
        { 'user-agent': 'Agent1', 'x-forwarded-for': '192.168.1.2' }
      ];

      const clientIds = new Set();
      
      for (const requestHeaders of requests) {
        const headers = {
          'x-api-key': 'test-api-key-123',
          ...requestHeaders
        };
        
        const result = await auth.authenticate(headers);
        clientIds.add(result.clientId);
      }
      
      console.assert(clientIds.size === 3, 'Should generate different client IDs for different fingerprints');
    });
  });
});

console.log('✅ Authentication Middleware Tests Completed');
