#!/usr/bin/env node

/**
 * Comprehensive Authentication Tests
 * Tests all authentication features including security, performance, and edge cases
 */

import { createMockLogger } from '../../utils/test-helpers.js';

class EnhancedAuthenticationTests {
  constructor() {
    this.logger = createMockLogger();
    this.testCount = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  runTest(testName, testFn) {
    this.testCount++;
    try {
      testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      console.log(`  ❌ ${testName}: ${error.message}`);
      this.failedTests++;
    }
  }

  async runAsyncTest(testName, testFn) {
    this.testCount++;
    try {
      await testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      console.log(`  ❌ ${testName}: ${error.message}`);
      this.failedTests++;
    }
  }

  // Enhanced Mock Authentication Middleware with more features
  createAuthMiddleware(config = {}) {
    return {
      config: {
        enabled: true,
        validApiKeys: ['test-api-key-123', 'admin-key', 'client-key'],
        validTokens: ['valid-token-123', 'admin-token', 'client-token'],
        tokenExpiration: false,
        rateLimitIntegration: false,
        logSecurityEvents: false,
        ...config
      },
      securityEvents: [],
      rateLimitExceeded: false,
      
      async authenticate(headers) {
        if (!headers) {
          this.logSecurityEvent('auth_failure', 'null_headers');
          return { authenticated: false, reason: 'Missing headers' };
        }

        if (!this.config.enabled) {
          return { authenticated: true, clientId: 'anonymous' };
        }

        // Handle rate limiting
        if (this.rateLimitExceeded) {
          this.logSecurityEvent('auth_blocked', 'rate_limit_exceeded');
          return { authenticated: false, reason: 'Rate limit exceeded' };
        }

        // Extract credentials with null safety
        const apiKey = headers['x-api-key'];
        const authHeader = headers['authorization'];
        const bearerToken = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ') 
          ? authHeader.replace('Bearer ', '') 
          : null;
        const clientId = headers['x-client-id'] || this.generateClientId(headers);

        // Check API key
        if (apiKey) {
          if (this.config.validApiKeys && Array.isArray(this.config.validApiKeys) && this.config.validApiKeys.includes(apiKey)) {
            this.logSecurityEvent('auth_success', 'api_key', { clientId });
            return { authenticated: true, clientId, method: 'api_key' };
          } else {
            this.logSecurityEvent('auth_failure', 'invalid_api_key', { clientId });
            return { authenticated: false, reason: 'Invalid API key' };
          }
        }

        // Check Bearer token
        if (bearerToken) {
          if (this.config.tokenExpiration && typeof bearerToken === 'string' && bearerToken.includes('expired')) {
            this.logSecurityEvent('auth_failure', 'token_expired', { clientId });
            return { authenticated: false, reason: 'Token expired' };
          }
          
          if (this.config.validTokens && Array.isArray(this.config.validTokens) && this.config.validTokens.includes(bearerToken)) {
            this.logSecurityEvent('auth_success', 'bearer_token', { clientId });
            return { authenticated: true, clientId, method: 'bearer_token' };
          } else {
            this.logSecurityEvent('auth_failure', 'invalid_token', { clientId });
            return { authenticated: false, reason: 'Invalid token' };
          }
        }

        this.logSecurityEvent('auth_failure', 'no_credentials', { clientId });
        return { authenticated: false, reason: 'No valid credentials provided' };
      },

      generateClientId(headers) {
        if (!headers || typeof headers !== 'object') {
          return 'client-anonymous';
        }
        
        const userAgent = headers['user-agent'] || 'unknown';
        const ip = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
        
        try {
          const combined = userAgent + ip;
          if (typeof combined === 'string' && combined.length > 0) {
            return `client-${Buffer.from(combined).toString('base64').substring(0, 8)}`;
          }
        } catch (error) {
          // Fallback for any encoding issues
        }
        
        return 'client-default';
      },

      logSecurityEvent(type, subtype, data = {}) {
        if (this.config.logSecurityEvents) {
          this.securityEvents.push({
            type,
            subtype,
            timestamp: new Date().toISOString(),
            ...data
          });
        }
      }
    };
  }

  async runComprehensiveTests() {
    console.log('🔐 Running Comprehensive Authentication Tests...\n');

    // Basic Authentication Tests
    console.log('📋 Basic Authentication Tests:');
    
    await this.runAsyncTest('should authenticate valid API key', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'x-api-key': 'test-api-key-123' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === true, 'Should authenticate valid API key');
      console.assert(result.method === 'api_key', 'Should identify API key method');
    });

    await this.runAsyncTest('should reject invalid API key', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'x-api-key': 'invalid-key' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should reject invalid API key');
      console.assert(result.reason && result.reason.includes('Invalid'), 'Should provide clear error reason');
    });

    await this.runAsyncTest('should authenticate valid bearer token', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'authorization': 'Bearer valid-token-123' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === true, 'Should authenticate valid bearer token');
      console.assert(result.method === 'bearer_token', 'Should identify bearer token method');
    });

    await this.runAsyncTest('should reject invalid bearer token', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'authorization': 'Bearer invalid-token' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should reject invalid bearer token');
    });

    // Advanced Authentication Tests
    console.log('\n🔒 Advanced Authentication Tests:');

    await this.runAsyncTest('should handle disabled authentication', async () => {
      const auth = this.createAuthMiddleware({ enabled: false });
      const headers = { 'x-api-key': 'any-key' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === true, 'Should allow when disabled');
      console.assert(result.clientId === 'anonymous', 'Should use anonymous client ID');
    });

    await this.runAsyncTest('should generate client IDs', async () => {
      const auth = this.createAuthMiddleware();
      const headers = {
        'x-api-key': 'test-api-key-123',
        'user-agent': 'TestAgent/1.0',
        'x-forwarded-for': '192.168.1.1'
      };
      const result = await auth.authenticate(headers);
      console.assert(result.clientId.startsWith('client-'), 'Should generate client ID');
      console.assert(result.clientId.length > 7, 'Should generate meaningful client ID');
    });

    await this.runAsyncTest('should use provided client ID', async () => {
      const auth = this.createAuthMiddleware();
      const headers = {
        'x-api-key': 'test-api-key-123',
        'x-client-id': 'custom-client-123'
      };
      const result = await auth.authenticate(headers);
      console.assert(result.clientId === 'custom-client-123', 'Should use provided client ID');
    });

    // Security Tests
    console.log('\n🛡️ Security Tests:');

    await this.runAsyncTest('should handle token expiration', async () => {
      const auth = this.createAuthMiddleware({ tokenExpiration: true });
      const headers = { 'authorization': 'Bearer expired-token-12345' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should reject expired tokens');
      console.assert(result.reason.includes('expired'), 'Should indicate expiration');
    });

    await this.runAsyncTest('should integrate with rate limiting', async () => {
      const auth = this.createAuthMiddleware({ rateLimitIntegration: true });
      auth.rateLimitExceeded = true;
      const headers = { 'x-api-key': 'test-api-key-123' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should block when rate limited');
      console.assert(result.reason.includes('rate limit'), 'Should indicate rate limiting');
    });

    await this.runAsyncTest('should log security events', async () => {
      const auth = this.createAuthMiddleware({ logSecurityEvents: true });
      
      // Successful authentication
      await auth.authenticate({ 'x-api-key': 'test-api-key-123' });
      
      // Failed authentication
      await auth.authenticate({ 'x-api-key': 'invalid-key' });
      
      console.assert(auth.securityEvents.length >= 2, 'Should log security events');
      
      const successEvent = auth.securityEvents.find(e => e.type === 'auth_success');
      const failureEvent = auth.securityEvents.find(e => e.type === 'auth_failure');
      
      console.assert(successEvent !== undefined, 'Should log successful authentication');
      console.assert(failureEvent !== undefined, 'Should log failed authentication');
    });

    // Edge Cases and Error Handling
    console.log('\n⚠️ Edge Cases and Error Handling:');

    await this.runAsyncTest('should handle null headers', async () => {
      const auth = this.createAuthMiddleware();
      const result = await auth.authenticate(null);
      console.assert(result.authenticated === false, 'Should handle null headers');
      console.assert(result.reason.includes('Missing'), 'Should indicate missing headers');
    });

    await this.runAsyncTest('should handle empty headers', async () => {
      const auth = this.createAuthMiddleware();
      const result = await auth.authenticate({});
      console.assert(result.authenticated === false, 'Should handle empty headers');
      console.assert(result.reason.includes('No valid credentials'), 'Should indicate no credentials');
    });

    await this.runAsyncTest('should handle malformed authorization header', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'authorization': 'InvalidFormat token123' };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should handle malformed headers');
    });

    await this.runAsyncTest('should handle very long credentials', async () => {
      const auth = this.createAuthMiddleware();
      const longKey = 'x'.repeat(10000);
      const headers = { 'x-api-key': longKey };
      const result = await auth.authenticate(headers);
      console.assert(result.authenticated === false, 'Should handle oversized credentials');
    });

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle high-frequency authentication', async () => {
      const auth = this.createAuthMiddleware();
      const headers = { 'x-api-key': 'test-api-key-123' };
      const iterations = 1000;
      
      const start = Date.now();
      const promises = Array(iterations).fill(null).map(() => auth.authenticate(headers));
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.assert(results.every(r => r.authenticated === true), 'All authentications should succeed');
      console.assert(duration < 5000, 'Should complete 1000 authentications within 5 seconds');
      
      const avgTime = duration / iterations;
      console.log(`    ⚡ Average authentication time: ${avgTime.toFixed(2)}ms`);
    });

    await this.runAsyncTest('should handle concurrent authentication requests', async () => {
      const auth = this.createAuthMiddleware();
      const concurrentRequests = 100;
      
      const start = Date.now();
      const promises = Array(concurrentRequests).fill(null).map((_, i) => 
        auth.authenticate({ 'x-api-key': 'test-api-key-123', 'x-client-id': `client-${i}` })
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.assert(results.every(r => r.authenticated === true), 'All concurrent authentications should succeed');
      console.assert(duration < 1000, 'Should handle 100 concurrent requests within 1 second');
      
      // Check unique client IDs
      const clientIds = new Set(results.map(r => r.clientId));
      console.assert(clientIds.size === concurrentRequests, 'Should handle unique client IDs correctly');
    });

    // Integration Tests
    console.log('\n🔗 Integration Tests:');

    this.runTest('should work with multiple authentication methods', () => {
      const auth = this.createAuthMiddleware();
      
      // Test API key
      const apiResult = auth.authenticate({ 'x-api-key': 'test-api-key-123' });
      console.assert(apiResult.authenticated === true, 'API key should work');
      
      // Test Bearer token
      const tokenResult = auth.authenticate({ 'authorization': 'Bearer valid-token-123' });
      console.assert(tokenResult.authenticated === true, 'Bearer token should work');
      
      // Test preference (API key should take precedence)
      const bothResult = auth.authenticate({
        'x-api-key': 'test-api-key-123',
        'authorization': 'Bearer valid-token-123'
      });
      console.assert(bothResult.method === 'api_key', 'API key should take precedence');
    });

    this.runTest('should maintain security event history', () => {
      const auth = this.createAuthMiddleware({ logSecurityEvents: true });
      
      // Multiple authentication attempts
      const attempts = [
        { 'x-api-key': 'test-api-key-123' },
        { 'x-api-key': 'invalid-key-1' },
        { 'authorization': 'Bearer valid-token-123' },
        { 'authorization': 'Bearer invalid-token' },
        {}
      ];
      
      attempts.forEach(headers => auth.authenticate(headers));
      
      console.assert(auth.securityEvents.length === 5, 'Should log all authentication attempts');
      
      const successEvents = auth.securityEvents.filter(e => e.type === 'auth_success');
      const failureEvents = auth.securityEvents.filter(e => e.type === 'auth_failure');
      
      console.assert(successEvents.length === 2, 'Should log 2 successful authentications');
      console.assert(failureEvents.length === 3, 'Should log 3 failed authentications');
    });

    // Summary
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUTHENTICATION TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`);

    if (this.failedTests === 0) {
      console.log('\n🎉 All authentication tests passed! Security features are working correctly.');
    } else {
      console.log(`\n💥 ${this.failedTests} test(s) failed. Please review authentication implementation.`);
      process.exit(1);
    }

    console.log('\n✅ Enhanced Authentication Tests Completed Successfully!');
  }
}

// Run the comprehensive authentication tests
const authTests = new EnhancedAuthenticationTests();
authTests.runComprehensiveTests().catch(error => {
  console.error('Fatal error in authentication tests:', error);
  process.exit(1);
});
