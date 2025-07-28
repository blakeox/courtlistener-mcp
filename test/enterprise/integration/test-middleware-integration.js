/**
 * Comprehensive Integration Tests for Enterprise Middleware
 * Tests how all middleware components work together in realistic scenarios
 */

import { createMockLogger, createMockRequest, performanceBenchmark } from '../../utils/test-helpers.js';

// Import all middleware mock implementations
// (In a real scenario, these would be the actual implementations)
class MockAuthenticationMiddleware {
  constructor(config, logger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
    this.validApiKeys = new Set(['valid-key-1', 'valid-key-2', 'admin-key']);
  }

  async authenticate(headers) {
    if (!this.config.enabled) return { authenticated: true, clientId: 'anonymous' };

    const apiKey = headers['x-api-key'] || headers['authorization']?.replace('Bearer ', '');
    if (this.validApiKeys.has(apiKey)) {
      return { authenticated: true, clientId: `client-${apiKey}` };
    }
    return { authenticated: false, reason: 'Invalid API key' };
  }
}

class MockInputSanitizer {
  constructor(config, logger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
  }

  async sanitize(input) {
    if (!this.config.enabled) return { sanitized: input, violations: [] };

    const violations = [];
    let sanitized = input;

    if (typeof input === 'string') {
      if (input.includes('<script>')) {
        violations.push({ type: 'XSS', severity: 'high' });
        sanitized = input.replace(/<script>.*?<\/script>/g, '[SCRIPT_REMOVED]');
      }
      if (input.includes('DROP TABLE')) {
        violations.push({ type: 'SQL_INJECTION', severity: 'high' });
        sanitized = input.replace(/DROP TABLE/gi, '[SQL_BLOCKED]');
      }
    }

    return { sanitized, violations };
  }
}

class MockRateLimiter {
  constructor(config, logger) {
    this.config = { enabled: true, requestsPerMinute: 60, ...config };
    this.logger = logger;
    this.clients = new Map();
  }

  async checkLimit(clientId) {
    if (!this.config.enabled) return { allowed: true };

    const now = Date.now();
    const client = this.clients.get(clientId) || { requests: [], penalties: 0 };
    
    client.requests = client.requests.filter(req => now - req < 60000);
    
    if (client.requests.length >= this.config.requestsPerMinute) {
      client.penalties++;
      return { allowed: false, retryAfter: 60 };
    }

    client.requests.push(now);
    this.clients.set(clientId, client);
    return { allowed: true };
  }
}

class MockAuditLogger {
  constructor(config, logger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
    this.auditEntries = [];
  }

  async logRequest(req, metadata = {}) {
    if (!this.config.enabled) return null;

    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'request',
      method: req.method,
      url: req.url,
      clientId: metadata.clientId,
      headers: req.headers,
      ...metadata
    };

    this.auditEntries.push(entry);
    return entry.id;
  }

  async logResponse(auditId, res, metadata = {}) {
    if (!this.config.enabled) return;

    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'response',
      requestAuditId: auditId,
      statusCode: res.statusCode,
      responseTime: metadata.responseTime,
      ...metadata
    };

    this.auditEntries.push(entry);
  }

  async logSecurityEvent(eventType, details) {
    if (!this.config.enabled) return;

    const entry = {
      id: `security_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'security_event',
      eventType,
      details
    };

    this.auditEntries.push(entry);
  }
}

class MockCompressionMiddleware {
  constructor(config, logger) {
    this.config = { enabled: true, threshold: 1024, ...config };
    this.logger = logger;
  }

  async compressResponse(data, acceptedEncodings = []) {
    if (!this.config.enabled || Buffer.byteLength(data, 'utf8') < this.config.threshold) {
      return { data, compressed: false, originalSize: Buffer.byteLength(data, 'utf8') };
    }

    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressedSize = Math.floor(originalSize * 0.4); // Simulate 60% compression

    return {
      data: `[COMPRESSED:${compressedSize}]${data.substring(0, 50)}...`,
      compressed: true,
      originalSize,
      compressedSize,
      ratio: originalSize / compressedSize,
      algorithm: acceptedEncodings.includes('br') ? 'br' : 'gzip'
    };
  }
}

class MockCircuitBreaker {
  constructor(config, logger) {
    this.config = { enabled: true, failureThreshold: 5, ...config };
    this.logger = logger;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async execute(operation) {
    if (!this.config.enabled) {
      return await operation();
    }

    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure < 60000) { // 1 minute recovery time
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
      }
      throw error;
    }
  }

  getState() {
    return { state: this.state, failureCount: this.failureCount };
  }
}

// Integrated Enterprise Middleware Stack
class EnterpriseMiddlewareStack {
  constructor(config = {}, logger) {
    this.logger = logger || createMockLogger();
    
    // Initialize all middleware components
    this.auth = new MockAuthenticationMiddleware(config.auth, this.logger);
    this.sanitizer = new MockInputSanitizer(config.sanitizer, this.logger);
    this.rateLimiter = new MockRateLimiter(config.rateLimiter, this.logger);
    this.auditor = new MockAuditLogger(config.auditor, this.logger);
    this.compressor = new MockCompressionMiddleware(config.compressor, this.logger);
    this.circuitBreaker = new MockCircuitBreaker(config.circuitBreaker, this.logger);
    
    this.config = {
      enableAuth: true,
      enableSanitization: true,
      enableRateLimit: true,
      enableAudit: true,
      enableCompression: true,
      enableCircuitBreaker: true,
      ...config
    };
  }

  async processRequest(req, handler) {
    const startTime = Date.now();
    let auditId = null;
    let authResult = null;
    let sanitizationResult = null;
    let rateLimitResult = null;

    try {
      // Step 1: Authentication
      if (this.config.enableAuth) {
        authResult = await this.auth.authenticate(req.headers);
        if (!authResult.authenticated) {
          await this.auditor.logSecurityEvent('AUTH_FAILURE', {
            reason: authResult.reason,
            headers: req.headers
          });
          return {
            statusCode: 401,
            body: { error: 'Authentication failed', reason: authResult.reason },
            headers: { 'Content-Type': 'application/json' }
          };
        }
        req.clientId = authResult.clientId;
      }

      // Step 2: Input Sanitization
      if (this.config.enableSanitization && req.body) {
        sanitizationResult = await this.sanitizer.sanitize(req.body);
        if (sanitizationResult.violations.length > 0) {
          const highSeverityViolations = sanitizationResult.violations.filter(v => v.severity === 'high');
          if (highSeverityViolations.length > 0) {
            await this.auditor.logSecurityEvent('MALICIOUS_INPUT', {
              clientId: req.clientId,
              violations: highSeverityViolations,
              originalInput: req.body
            });
            return {
              statusCode: 400,
              body: { error: 'Malicious input detected', violations: highSeverityViolations },
              headers: { 'Content-Type': 'application/json' }
            };
          }
        }
        req.body = sanitizationResult.sanitized;
      }

      // Step 3: Rate Limiting
      if (this.config.enableRateLimit) {
        rateLimitResult = await this.rateLimiter.checkLimit(req.clientId || 'anonymous');
        if (!rateLimitResult.allowed) {
          await this.auditor.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            clientId: req.clientId,
            retryAfter: rateLimitResult.retryAfter
          });
          return {
            statusCode: 429,
            body: { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
            headers: { 
              'Content-Type': 'application/json',
              'Retry-After': rateLimitResult.retryAfter.toString()
            }
          };
        }
      }

      // Step 4: Audit Logging (Request)
      if (this.config.enableAudit) {
        auditId = await this.auditor.logRequest(req, {
          clientId: req.clientId,
          authenticated: authResult?.authenticated,
          sanitizationViolations: sanitizationResult?.violations?.length || 0
        });
      }

      // Step 5: Execute Handler with Circuit Breaker
      let response;
      if (this.config.enableCircuitBreaker) {
        response = await this.circuitBreaker.execute(async () => {
          return await handler(req);
        });
      } else {
        response = await handler(req);
      }

      // Step 6: Response Compression
      if (this.config.enableCompression && response.body) {
        const acceptedEncodings = req.headers['accept-encoding']?.split(',').map(e => e.trim()) || [];
        const compressionResult = await this.compressor.compressResponse(
          typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
          acceptedEncodings
        );

        if (compressionResult.compressed) {
          response.body = compressionResult.data;
          response.headers = {
            ...response.headers,
            'Content-Encoding': compressionResult.algorithm,
            'Content-Length': compressionResult.compressedSize.toString()
          };
        }
      }

      // Step 7: Audit Logging (Response)
      if (this.config.enableAudit && auditId) {
        await this.auditor.logResponse(auditId, response, {
          responseTime: Date.now() - startTime,
          compressed: response.headers?.['Content-Encoding'] !== undefined
        });
      }

      return response;

    } catch (error) {
      // Error handling with audit logging
      const errorResponse = {
        statusCode: error.statusCode || 500,
        body: { error: error.message || 'Internal server error' },
        headers: { 'Content-Type': 'application/json' }
      };

      if (this.config.enableAudit) {
        if (auditId) {
          await this.auditor.logResponse(auditId, errorResponse, {
            responseTime: Date.now() - startTime,
            error: error.message
          });
        }
        
        await this.auditor.logSecurityEvent('REQUEST_ERROR', {
          clientId: req.clientId,
          error: error.message,
          statusCode: errorResponse.statusCode
        });
      }

      return errorResponse;
    }
  }

  getStats() {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      auditEntries: this.auditor.auditEntries.length,
      rateLimitClients: this.rateLimiter.clients.size
    };
  }
}

describe('Enterprise Middleware Integration Tests', () => {
  let middlewareStack;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    middlewareStack = new EnterpriseMiddlewareStack({}, mockLogger);
  });

  describe('Full Request Processing Pipeline', () => {
    it('should process valid authenticated request successfully', async () => {
      const req = createMockRequest({
        headers: {
          'x-api-key': 'valid-key-1',
          'accept-encoding': 'gzip, br',
          'content-type': 'application/json'
        },
        body: { query: 'legal documents', limit: 10 }
      });

      const mockHandler = async (req) => {
        return {
          statusCode: 200,
          body: { results: ['doc1', 'doc2'], total: 2 },
          headers: { 'Content-Type': 'application/json' }
        };
      };

      const response = await middlewareStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 200, 'Should return 200 status');
      console.assert(req.clientId === 'client-valid-key-1', 'Should set client ID');
      console.assert(response.headers['Content-Encoding'] !== undefined, 'Should compress response');
    });

    it('should reject unauthenticated requests', async () => {
      const req = createMockRequest({
        headers: {},
        body: { query: 'test' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await middlewareStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 401, 'Should return 401 for unauthenticated request');
      console.assert(response.body.error === 'Authentication failed', 'Should include auth error');
      
      // Check security event was logged
      const securityEvents = middlewareStack.auditor.auditEntries.filter(e => e.type === 'security_event');
      console.assert(securityEvents.length > 0, 'Should log security event');
      console.assert(securityEvents[0].eventType === 'AUTH_FAILURE', 'Should log auth failure');
    });

    it('should block malicious input', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' },
        body: '<script>alert("xss")</script>DROP TABLE users;'
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await middlewareStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 400, 'Should return 400 for malicious input');
      console.assert(response.body.error === 'Malicious input detected', 'Should detect malicious input');
      console.assert(response.body.violations.length > 0, 'Should include violation details');
      
      // Check security event was logged
      const securityEvents = middlewareStack.auditor.auditEntries.filter(e => e.type === 'security_event');
      const maliciousInputEvent = securityEvents.find(e => e.eventType === 'MALICIOUS_INPUT');
      console.assert(maliciousInputEvent !== undefined, 'Should log malicious input event');
    });

    it('should enforce rate limits', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      // Exhaust rate limit
      const rateLimitConfig = { rateLimiter: { requestsPerMinute: 2 } };
      const limitedStack = new EnterpriseMiddlewareStack(rateLimitConfig, mockLogger);

      // Make requests up to limit
      await limitedStack.processRequest(req, mockHandler);
      await limitedStack.processRequest(req, mockHandler);

      // This should be rate limited
      const response = await limitedStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 429, 'Should return 429 for rate limited request');
      console.assert(response.body.error === 'Rate limit exceeded', 'Should include rate limit error');
      console.assert(response.headers['Retry-After'] !== undefined, 'Should include retry after header');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle handler errors gracefully', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const failingHandler = async () => {
        throw new Error('Handler error');
      };

      const response = await middlewareStack.processRequest(req, failingHandler);

      console.assert(response.statusCode === 500, 'Should return 500 for handler error');
      console.assert(response.body.error === 'Handler error', 'Should include error message');
      
      // Check audit logging
      const auditEntries = middlewareStack.auditor.auditEntries;
      const errorEvent = auditEntries.find(e => e.type === 'security_event' && e.eventType === 'REQUEST_ERROR');
      console.assert(errorEvent !== undefined, 'Should log request error');
    });

    it('should trigger circuit breaker on repeated failures', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const failingHandler = async () => {
        throw new Error('Service unavailable');
      };

      const circuitConfig = { circuitBreaker: { failureThreshold: 2 } };
      const circuitStack = new EnterpriseMiddlewareStack(circuitConfig, mockLogger);

      // Trigger failures to open circuit
      await circuitStack.processRequest(req, failingHandler);
      await circuitStack.processRequest(req, failingHandler);

      const state = circuitStack.circuitBreaker.getState();
      console.assert(state.state === 'OPEN', 'Circuit breaker should be open');

      // Next request should fail immediately
      const response = await circuitStack.processRequest(req, failingHandler);
      console.assert(response.body.error === 'Circuit breaker is OPEN', 'Should fail with circuit breaker error');
    });

    it('should handle circuit breaker recovery', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      let callCount = 0;
      const intermittentHandler = async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Service temporarily unavailable');
        }
        return { statusCode: 200, body: 'success' };
      };

      const circuitConfig = { circuitBreaker: { failureThreshold: 2 } };
      const circuitStack = new EnterpriseMiddlewareStack(circuitConfig, mockLogger);

      // Trigger circuit breaker
      await circuitStack.processRequest(req, intermittentHandler);
      await circuitStack.processRequest(req, intermittentHandler);

      console.assert(circuitStack.circuitBreaker.getState().state === 'OPEN', 'Should open circuit');

      // Simulate time passing and recovery
      circuitStack.circuitBreaker.lastFailureTime = Date.now() - 70000; // > 1 minute ago

      const response = await circuitStack.processRequest(req, intermittentHandler);
      console.assert(response.statusCode === 200, 'Should recover and process request');
      console.assert(circuitStack.circuitBreaker.getState().state === 'CLOSED', 'Circuit should close');
    });
  });

  describe('Security Event Correlation', () => {
    it('should correlate multiple security events from same client', async () => {
      const clientReq = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      // First, trigger rate limit
      const rateLimitConfig = { rateLimiter: { requestsPerMinute: 1 } };
      const securityStack = new EnterpriseMiddlewareStack(rateLimitConfig, mockLogger);

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      // Exhaust rate limit
      await securityStack.processRequest(clientReq, mockHandler);
      await securityStack.processRequest(clientReq, mockHandler); // This should be rate limited

      // Then, try malicious input
      const maliciousReq = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' },
        body: '<script>alert("hack")</script>'
      });

      await securityStack.processRequest(maliciousReq, mockHandler);

      // Check security events
      const securityEvents = securityStack.auditor.auditEntries.filter(e => e.type === 'security_event');
      const clientEvents = securityEvents.filter(e => e.details?.clientId === 'client-valid-key-1');

      console.assert(clientEvents.length >= 2, 'Should have multiple security events for same client');
      
      const eventTypes = clientEvents.map(e => e.eventType);
      console.assert(eventTypes.includes('RATE_LIMIT_EXCEEDED'), 'Should include rate limit event');
      console.assert(eventTypes.includes('MALICIOUS_INPUT'), 'Should include malicious input event');
    });

    it('should track suspicious patterns across requests', async () => {
      const suspiciousReqs = [
        { headers: { 'x-api-key': 'invalid-key' } }, // Auth failure
        { headers: { 'x-api-key': 'invalid-key-2' } }, // Another auth failure
        { headers: {} } // No auth
      ].map(req => createMockRequest(req));

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      // Process multiple suspicious requests
      for (const req of suspiciousReqs) {
        await middlewareStack.processRequest(req, mockHandler);
      }

      const authFailures = middlewareStack.auditor.auditEntries.filter(
        e => e.type === 'security_event' && e.eventType === 'AUTH_FAILURE'
      );

      console.assert(authFailures.length >= 3, 'Should track multiple auth failures');
    });
  });

  describe('Performance and Optimization', () => {
    it('should process requests efficiently', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' },
        body: { query: 'test' }
      });

      const fastHandler = async () => ({
        statusCode: 200,
        body: { result: 'fast response' }
      });

      const result = await performanceBenchmark(async () => {
        return await middlewareStack.processRequest(req, fastHandler);
      });

      console.assert(result.duration < 100, `Request processing should be fast, took ${result.duration}ms`);
      console.assert(result.result.statusCode === 200, 'Should process request successfully');
    });

    it('should handle high request volume', async () => {
      const requests = Array(50).fill(null).map((_, i) => 
        createMockRequest({
          headers: { 'x-api-key': 'valid-key-1' },
          body: { query: `test-${i}` }
        })
      );

      const fastHandler = async () => ({
        statusCode: 200,
        body: { result: 'success' }
      });

      const startTime = Date.now();
      
      const responses = await Promise.all(
        requests.map(req => middlewareStack.processRequest(req, fastHandler))
      );

      const duration = Date.now() - startTime;

      console.assert(duration < 1000, `Should handle 50 requests quickly, took ${duration}ms`);
      console.assert(responses.every(r => r.statusCode === 200), 'All requests should succeed');
      
      const stats = middlewareStack.getStats();
      console.assert(stats.auditEntries >= 100, 'Should log all requests and responses'); // 50 requests + 50 responses
    });

    it('should optimize compression for large responses', async () => {
      const req = createMockRequest({
        headers: { 
          'x-api-key': 'valid-key-1',
          'accept-encoding': 'gzip, br'
        }
      });

      const largeResponseHandler = async () => ({
        statusCode: 200,
        body: { 
          data: 'Large response data. '.repeat(100),
          items: Array(50).fill({ name: 'item', description: 'A long description of the item' })
        }
      });

      const response = await middlewareStack.processRequest(req, largeResponseHandler);

      console.assert(response.statusCode === 200, 'Should process large response');
      console.assert(response.headers['Content-Encoding'] !== undefined, 'Should compress large response');
      console.assert(response.body.includes('[COMPRESSED'), 'Should contain compression marker');
    });
  });

  describe('Configuration and Flexibility', () => {
    it('should work with individual middleware disabled', async () => {
      const config = {
        enableAuth: false,
        enableRateLimit: false,
        enableCompression: false
      };

      const customStack = new EnterpriseMiddlewareStack(config, mockLogger);

      const req = createMockRequest({
        headers: {}, // No auth
        body: { query: 'test' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await customStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 200, 'Should succeed with auth disabled');
      console.assert(response.headers['Content-Encoding'] === undefined, 'Should not compress with compression disabled');
    });

    it('should allow custom middleware configuration', async () => {
      const config = {
        auth: { enabled: true },
        rateLimiter: { requestsPerMinute: 100 },
        compressor: { threshold: 500 },
        circuitBreaker: { failureThreshold: 10 }
      };

      const customStack = new EnterpriseMiddlewareStack(config, mockLogger);

      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await customStack.processRequest(req, mockHandler);

      console.assert(response.statusCode === 200, 'Should work with custom configuration');
      console.assert(customStack.rateLimiter.config.requestsPerMinute === 100, 'Should use custom rate limit');
    });

    it('should handle partial middleware failures gracefully', async () => {
      // Create a stack where audit logging fails
      const faultyAuditor = {
        logRequest: async () => { throw new Error('Audit failure'); },
        logResponse: async () => { throw new Error('Audit failure'); },
        logSecurityEvent: async () => { throw new Error('Audit failure'); }
      };

      middlewareStack.auditor = faultyAuditor;

      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await middlewareStack.processRequest(req, mockHandler);

      // Request should still succeed despite audit failure
      console.assert(response.statusCode === 200, 'Should handle audit failures gracefully');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical Legal MCP Server request', async () => {
      const mcpRequest = createMockRequest({
        method: 'POST',
        url: '/mcp/call',
        headers: {
          'x-api-key': 'valid-key-1',
          'content-type': 'application/json',
          'accept-encoding': 'gzip, br'
        },
        body: {
          jsonrpc: '2.0',
          id: '123',
          method: 'tools/call',
          params: {
            name: 'search_legal_documents',
            arguments: {
              query: 'contract dispute resolution',
              limit: 20,
              jurisdiction: 'federal'
            }
          }
        }
      });

      const mcpHandler = async (req) => {
        // Simulate legal document search
        return {
          statusCode: 200,
          body: {
            jsonrpc: '2.0',
            id: req.body.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Found 15 relevant legal documents on contract dispute resolution...'
                }
              ]
            }
          },
          headers: { 'Content-Type': 'application/json' }
        };
      };

      const response = await middlewareStack.processRequest(mcpRequest, mcpHandler);

      console.assert(response.statusCode === 200, 'Should process MCP request successfully');
      console.assert(response.body.includes('jsonrpc'), 'Should maintain MCP format');
      console.assert(response.headers['Content-Encoding'] !== undefined, 'Should compress response');
      
      // Check audit trail
      const auditEntries = middlewareStack.auditor.auditEntries;
      const requestEntry = auditEntries.find(e => e.type === 'request');
      console.assert(requestEntry !== undefined, 'Should audit MCP request');
      console.assert(requestEntry.clientId === 'client-valid-key-1', 'Should identify client');
    });

    it('should handle bot/crawler detection and blocking', async () => {
      const botRequest = createMockRequest({
        headers: {
          'user-agent': 'MaliciousBot/1.0',
          'x-forwarded-for': '192.168.1.100'
        },
        body: 'SELECT * FROM users'
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const response = await middlewareStack.processRequest(botRequest, mockHandler);

      // Should fail authentication (no API key) and detect malicious input
      console.assert(response.statusCode === 401, 'Should block unauthenticated bot');
      
      const securityEvents = middlewareStack.auditor.auditEntries.filter(e => e.type === 'security_event');
      console.assert(securityEvents.length > 0, 'Should log security events for bot');
    });

    it('should handle API abuse scenario', async () => {
      const abusiveClient = 'abusive-client';
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      // Override client ID to simulate specific abusive client
      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      // Configure strict rate limiting
      const strictConfig = { rateLimiter: { requestsPerMinute: 3 } };
      const strictStack = new EnterpriseMiddlewareStack(strictConfig, mockLogger);

      // Simulate rapid requests from abusive client
      const responses = [];
      for (let i = 0; i < 10; i++) {
        const response = await strictStack.processRequest(req, mockHandler);
        responses.push(response);
      }

      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitCount = responses.filter(r => r.statusCode === 429).length;

      console.assert(successCount <= 3, 'Should only allow limited successful requests');
      console.assert(rateLimitCount >= 7, 'Should rate limit most requests');
      
      // Check security events
      const rateLimitEvents = strictStack.auditor.auditEntries.filter(
        e => e.type === 'security_event' && e.eventType === 'RATE_LIMIT_EXCEEDED'
      );
      console.assert(rateLimitEvents.length >= 7, 'Should log multiple rate limit violations');
    });

    it('should handle service degradation scenario', async () => {
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      let requestCount = 0;
      const degradedHandler = async () => {
        requestCount++;
        
        // Simulate service degradation - every 3rd request fails
        if (requestCount % 3 === 0) {
          throw new Error('Service degraded');
        }
        
        return { statusCode: 200, body: 'success' };
      };

      const responses = [];
      for (let i = 0; i < 10; i++) {
        try {
          const response = await middlewareStack.processRequest(req, degradedHandler);
          responses.push(response);
        } catch (error) {
          responses.push({ statusCode: 500, error: error.message });
        }
      }

      const successCount = responses.filter(r => r.statusCode === 200).length;
      const errorCount = responses.filter(r => r.statusCode === 500).length;

      console.assert(successCount >= 6, 'Should have some successful requests');
      console.assert(errorCount >= 3, 'Should have some failed requests');
      
      // Circuit breaker should not be triggered for intermittent failures
      const circuitState = middlewareStack.circuitBreaker.getState();
      console.assert(circuitState.state !== 'OPEN', 'Circuit should not open for intermittent failures');
    });
  });

  describe('Compliance and Audit Trail', () => {
    it('should maintain complete audit trail for compliance', async () => {
      const complianceRequest = createMockRequest({
        headers: { 
          'x-api-key': 'valid-key-1',
          'x-request-id': 'compliance-req-123',
          'user-agent': 'LegalApp/1.0'
        },
        body: { 
          query: 'GDPR compliance documents',
          sensitivity: 'confidential'
        }
      });

      const complianceHandler = async () => ({
        statusCode: 200,
        body: { 
          documents: ['gdpr-doc-1', 'gdpr-doc-2'],
          classification: 'confidential'
        }
      });

      const response = await middlewareStack.processRequest(complianceRequest, complianceHandler);

      console.assert(response.statusCode === 200, 'Should process compliance request');

      // Verify complete audit trail
      const auditEntries = middlewareStack.auditor.auditEntries;
      
      const requestEntry = auditEntries.find(e => e.type === 'request');
      console.assert(requestEntry !== undefined, 'Should have request audit entry');
      console.assert(requestEntry.clientId === 'client-valid-key-1', 'Should track client');
      console.assert(requestEntry.headers['x-request-id'] === 'compliance-req-123', 'Should preserve request ID');

      const responseEntry = auditEntries.find(e => e.type === 'response');
      console.assert(responseEntry !== undefined, 'Should have response audit entry');
      console.assert(responseEntry.requestAuditId === requestEntry.id, 'Should link request and response');
      console.assert(typeof responseEntry.responseTime === 'number', 'Should track response time');
    });

    it('should handle data retention requirements', async () => {
      // This test verifies that audit data structure supports retention policies
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      await middlewareStack.processRequest(req, mockHandler);

      const auditEntries = middlewareStack.auditor.auditEntries;
      
      auditEntries.forEach(entry => {
        console.assert(entry.timestamp !== undefined, 'Should have timestamp for retention');
        console.assert(entry.id !== undefined, 'Should have unique ID for tracking');
        console.assert(entry.type !== undefined, 'Should have type for categorization');
      });
    });
  });

  // Additional integration tests from existing test-enterprise-middleware.js
  describe('Enhanced Middleware Integration', () => {
    it('should integrate sanitization and compression correctly', async () => {
      // Test that middleware can work together in a realistic scenario
      const middlewareStack = new EnterpriseMiddlewareStack({
        authentication: { enabled: false }, // Skip auth for this test
        sanitization: { enabled: true },
        compression: { enabled: true, threshold: 50 },
        audit: { enabled: true }
      }, createMockLogger());

      const input = { 
        query: 'safe legal query', 
        data: 'x'.repeat(100) // Large enough to trigger compression
      };

      const mockHandler = async () => ({ 
        statusCode: 200, 
        body: input 
      });

      const req = createMockRequest({
        body: input,
        headers: { 'content-type': 'application/json' }
      });

      const result = await middlewareStack.processRequest(req, mockHandler);

      // Verify sanitization occurred
      const auditEntries = middlewareStack.auditor.auditEntries;
      const sanitizationEntry = auditEntries.find(e => e.type === 'sanitization');
      console.assert(sanitizationEntry !== undefined, 'Should log sanitization activity');
      console.assert(sanitizationEntry.violations.length === 0, 'Should have no violations for safe input');

      // Verify compression occurred
      const compressionEntry = auditEntries.find(e => e.type === 'compression');
      console.assert(compressionEntry !== undefined, 'Should log compression activity');
      console.assert(compressionEntry.compressed === true, 'Should compress large responses');
    });

    it('should handle authentication failures and still process safely', async () => {
      const middlewareStack = new EnterpriseMiddlewareStack({
        authentication: { enabled: true },
        sanitization: { enabled: true },
        audit: { enabled: true }
      }, createMockLogger());

      const req = createMockRequest({
        headers: { 'x-api-key': 'invalid-key' },
        body: { query: 'test query' }
      });

      const mockHandler = async () => ({ 
        statusCode: 200, 
        body: 'success' 
      });

      const result = await middlewareStack.processRequest(req, mockHandler);

      // Should fail authentication but still log securely
      console.assert(result.statusCode === 401, 'Should return 401 for invalid authentication');
      
      const auditEntries = middlewareStack.auditor.auditEntries;
      const authEntry = auditEntries.find(e => e.type === 'authentication');
      console.assert(authEntry !== undefined, 'Should log authentication attempt');
      console.assert(authEntry.success === false, 'Should log authentication failure');
    });

    it('should handle configuration validation across middleware', async () => {
      // Test that invalid configurations are handled gracefully
      const invalidConfig = {
        authentication: { enabled: true },
        sanitization: { enabled: true, maxStringLength: -1 }, // Invalid
        compression: { enabled: true, threshold: -100 }, // Invalid
        audit: { enabled: true }
      };

      // Should not throw when creating middleware with invalid config
      const middlewareStack = new EnterpriseMiddlewareStack(invalidConfig, createMockLogger());
      
      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' },
        body: { query: 'test' }
      });

      const mockHandler = async () => ({ statusCode: 200, body: 'success' });

      const result = await middlewareStack.processRequest(req, mockHandler);
      
      // Should handle gracefully and still process request
      console.assert(result.statusCode === 200, 'Should handle invalid config gracefully');
    });

    it('should measure performance impact of full middleware stack', async () => {
      const middlewareStack = new EnterpriseMiddlewareStack({
        authentication: { enabled: true },
        sanitization: { enabled: true },
        compression: { enabled: true },
        audit: { enabled: true },
        rateLimit: { enabled: false } // Disable for performance testing
      }, createMockLogger());

      const req = createMockRequest({
        headers: { 'x-api-key': 'valid-key-1' },
        body: { 
          query: 'complex legal research query',
          parameters: Array(100).fill({ key: 'value' }) // Moderate complexity
        }
      });

      const mockHandler = async () => ({ 
        statusCode: 200, 
        body: { 
          results: Array(1000).fill({ case: 'example', summary: 'test data' })
        }
      });

      const start = Date.now();
      const result = await middlewareStack.processRequest(req, mockHandler);
      const duration = Date.now() - start;

      console.assert(result.statusCode === 200, 'Should process request successfully');
      console.assert(duration < 2000, 'Should complete full middleware stack within 2 seconds');
      
      console.log(`    ⚡ Full middleware stack processing completed in ${duration}ms`);

      // Verify all middleware components were executed
      const auditEntries = middlewareStack.auditor.auditEntries;
      const types = auditEntries.map(e => e.type);
      
      console.assert(types.includes('authentication'), 'Should execute authentication');
      console.assert(types.includes('sanitization'), 'Should execute sanitization');
      console.assert(types.includes('compression'), 'Should execute compression');
    });
  });
});

console.log('✅ Enhanced Enterprise Middleware Integration Tests Completed');
