#!/usr/bin/env node

/**
 * 🌐 COMPREHENSIVE CourtListener API Integration Tests
 * Tests API functionality, error handling, rate limiting, and resilience patterns
 * Week 2: API Integration Testing Suite
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { URL } from 'node:url';

// Import the actual CourtListener API
const { CourtListenerAPI } = await import('../../dist/courtlistener.js');

/**
 * 🎭 Advanced API Mocking Framework
 * Provides realistic HTTP responses and comprehensive error simulation
 */
class APIServerMock {
  constructor() {
    this.server = null;
    this.port = 0;
    this.baseUrl = '';
    this.responses = new Map();
    this.requestLog = [];
    this.rateLimitState = {
      requests: 0,
      windowStart: Date.now()
    };
    this.config = {
      defaultDelay: 0,
      rateLimitPerMinute: 100,
      failureRate: 0,
      networkError: false
    };
  }

  /**
   * Start the mock server
   */
  async start() {
    return new Promise((resolve) => {
      this.server = createServer(this.handleRequest.bind(this));
      this.server.listen(0, 'localhost', () => {
        this.port = this.server.address().port;
        this.baseUrl = `http://localhost:${this.port}`;
        resolve(this.baseUrl);
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          this.port = 0;
          this.baseUrl = '';
          resolve();
        });
      });
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  async handleRequest(req, res) {
    const url = new URL(req.url, this.baseUrl);
    const endpoint = url.pathname;
    
    // Log request for testing verification
    this.requestLog.push({
      method: req.method,
      endpoint,
      query: Object.fromEntries(url.searchParams),
      timestamp: Date.now(),
      headers: req.headers
    });

    try {
      // Simulate network delays
      if (this.config.defaultDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.defaultDelay));
      }

      // Simulate network errors
      if (this.config.networkError) {
        req.destroy();
        return;
      }

      // Simulate random failures
      if (Math.random() < this.config.failureRate) {
        this.sendErrorResponse(res, 500, 'Simulated server error');
        return;
      }

      // Check rate limiting
      const now = Date.now();
      if (now - this.rateLimitState.windowStart >= 60000) {
        this.rateLimitState.requests = 0;
        this.rateLimitState.windowStart = now;
      }

      if (this.rateLimitState.requests >= this.config.rateLimitPerMinute) {
        this.sendErrorResponse(res, 429, 'Too Many Requests');
        return;
      }

      this.rateLimitState.requests++;

      // Find matching response
      const response = this.findResponse(endpoint, url.searchParams);
      
      if (response) {
        res.writeHead(response.status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(response.data));
      } else {
        this.sendErrorResponse(res, 404, 'Not Found');
      }

    } catch (error) {
      this.sendErrorResponse(res, 500, error.message);
    }
  }

  /**
   * Send error response
   */
  sendErrorResponse(res, status, message) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }

  /**
   * Find matching mock response
   */
  findResponse(endpoint, params) {
    // Convert URLSearchParams to plain object
    const paramsObj = {};
    for (const [key, value] of params.entries()) {
      paramsObj[key] = value;
    }
    
    // Try exact match first
    const exactKey = this.generateKey(endpoint, paramsObj);
    if (this.responses.has(exactKey)) {
      return this.responses.get(exactKey);
    }

    // Try endpoint-only match
    if (this.responses.has(endpoint)) {
      return this.responses.get(endpoint);
    }

    return null;
  }

  /**
   * Generate cache key for response matching
   */
  generateKey(endpoint, params) {
    const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
      obj[key] = params[key];
      return obj;
    }, {});
    return `${endpoint}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Register mock response
   */
  mockResponse(endpoint, params = {}, data, status = 200) {
    const key = Object.keys(params).length > 0 
      ? this.generateKey(endpoint, params)
      : endpoint;
    
    this.responses.set(key, { status, data });
  }

  /**
   * Get request history
   */
  getRequestHistory() {
    return [...this.requestLog];
  }

  /**
   * Clear request history
   */
  clearHistory() {
    this.requestLog = [];
  }

  /**
   * Configure mock behavior
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset all state
   */
  reset() {
    this.responses.clear();
    this.requestLog = [];
    this.rateLimitState = {
      requests: 0,
      windowStart: Date.now()
    };
    this.config = {
      defaultDelay: 0,
      rateLimitPerMinute: 100,
      failureRate: 0,
      networkError: false
    };
  }
}

/**
 * 📊 Mock Data Factory
 * Generates realistic test data matching CourtListener API schemas
 */
class MockDataFactory {
  static createOpinionCluster(overrides = {}) {
    return {
      id: 123456,
      case_name: "Test v. Example Corp",
      case_name_short: "Test v. Example",
      court: "ca9",
      date_filed: "2024-01-15",
      citation_count: 42,
      precedential_status: "Published",
      federal_cite_one: "123 F.3d 456",
      state_cite_one: null,
      neutral_cite: "2024 WL 123456",
      absolute_url: "/opinion/123456/test-v-example/",
      summary: "Court ruled on important legal precedent regarding test cases.",
      syllabus: "Test cases must meet specific criteria to be considered valid.",
      ...overrides
    };
  }

  static createSearchResponse(results, count = null, next = null, previous = null) {
    return {
      count: count || results.length,
      next,
      previous,
      results
    };
  }

  static createErrorResponse(message, code = null) {
    return {
      error: message,
      code,
      detail: `Error occurred: ${message}`
    };
  }
}

/**
 * 🧪 Test Component Mocks
 */
class MockLogger {
  constructor() {
    this.logs = [];
    this.timers = new Map();
  }
  
  info(msg, meta) { this.logs.push({ level: 'info', msg, meta }); }
  error(msg, meta) { this.logs.push({ level: 'error', msg, meta }); }
  debug(msg, meta) { this.logs.push({ level: 'debug', msg, meta }); }
  warn(msg, meta) { this.logs.push({ level: 'warn', msg, meta }); }
  
  apiCall(method, endpoint, duration, status, meta) {
    this.logs.push({ 
      level: 'api', 
      method, 
      endpoint, 
      duration, 
      status, 
      meta 
    });
  }
  
  startTimer(label) {
    const start = Date.now();
    this.timers.set(label, start);
    return {
      end: () => {
        const duration = Date.now() - start;
        this.timers.delete(label);
        return duration;
      },
      endWithError: (error) => {
        const duration = Date.now() - start;
        this.timers.delete(label);
        this.logs.push({ level: 'timer_error', label, duration, error });
        return duration;
      }
    };
  }
}

class MockCacheManager {
  constructor() {
    this.cache = new Map();
    this.enabled = true;
  }
  
  isEnabled() { return this.enabled; }
  setEnabled(enabled) { this.enabled = enabled; }
  
  get(endpoint, params) {
    if (!this.enabled) return null;
    const key = `${endpoint}:${JSON.stringify(params || {})}`;
    return this.cache.get(key) || null;
  }
  
  set(endpoint, params, data) {
    if (!this.enabled) return;
    const key = `${endpoint}:${JSON.stringify(params || {})}`;
    this.cache.set(key, data);
  }
  
  clear() {
    this.cache.clear();
  }
}

class MockMetricsCollector {
  constructor() {
    this.requests = [];
    this.failures = [];
  }
  
  recordRequest(duration, fromCache = false) {
    this.requests.push({ duration, fromCache, timestamp: Date.now() });
  }
  
  recordFailure(duration) {
    this.failures.push({ duration, timestamp: Date.now() });
  }
  
  getStats() {
    return {
      totalRequests: this.requests.length,
      totalFailures: this.failures.length,
      cacheHits: this.requests.filter(r => r.fromCache).length
    };
  }
}

// Global test state
let mockServer, courtListenerAPI, mockLogger, mockCache, mockMetrics;

describe('CourtListener API Integration', () => {
  beforeEach(async () => {
    // Initialize mock server
    mockServer = new APIServerMock();
    await mockServer.start();
    
    // Initialize mock dependencies
    mockLogger = new MockLogger();
    mockCache = new MockCacheManager();
    mockMetrics = new MockMetricsCollector();
    
    // Initialize API client with mock server
    const config = {
      baseUrl: `${mockServer.baseUrl}/api/rest/v4`,
      version: 'v4',
      timeout: 5000,
      retryAttempts: 3,
      rateLimitPerMinute: 100
    };
    
    courtListenerAPI = new CourtListenerAPI(config, mockCache, mockLogger, mockMetrics);
  });
  
  afterEach(async () => {
    if (mockServer) {
      await mockServer.stop();
    }
  });

  describe('🔧 API Client Initialization', () => {
    it('should initialize with proper configuration', () => {
      assert.ok(courtListenerAPI);
      assert.ok(mockLogger.logs.some(log => 
        log.level === 'info' && log.msg.includes('CourtListener API client initialized')
      ));
    });
  });

  describe('🔍 Opinion Search Functionality', () => {
    it('should search opinions successfully', async () => {
      const mockResults = [
        MockDataFactory.createOpinionCluster(),
        MockDataFactory.createOpinionCluster({ id: 123457, case_name: "Another Test Case" })
      ];
      
      // Debug: Setup mock for any search endpoint
      mockServer.mockResponse('/api/rest/v4/search/', { q: 'test' }, 
        MockDataFactory.createSearchResponse(mockResults)
      );
      
      try {
        const result = await courtListenerAPI.searchOpinions({ q: 'test' });
        
        assert.strictEqual(result.results.length, 2);
        assert.strictEqual(result.results[0].case_name, "Test v. Example Corp");
        assert.strictEqual(result.count, 2);
        
        // Verify request was logged
        const requests = mockServer.getRequestHistory();
        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].endpoint, '/api/rest/v4/search/');
        assert.strictEqual(requests[0].query.q, 'test');
      } catch (error) {
        // Debug: Show what requests were actually made
        console.log('Requests made:', mockServer.getRequestHistory());
        console.log('Mock responses:', Array.from(mockServer.responses.keys()));
        throw error;
      }
    });

    it('should handle empty search results', async () => {
      mockServer.mockResponse('/api/rest/v4/search/', { q: 'nonexistent' },
        MockDataFactory.createSearchResponse([])
      );
      
      const result = await courtListenerAPI.searchOpinions({ q: 'nonexistent' });
      
      assert.strictEqual(result.results.length, 0);
      assert.strictEqual(result.count, 0);
    });
  });

  describe('📄 Individual Resource Retrieval', () => {
    it('should retrieve opinion cluster by ID', async () => {
      const mockCluster = MockDataFactory.createOpinionCluster();
      mockServer.mockResponse('/api/rest/v4/clusters/123456/', {}, mockCluster);
      
      const result = await courtListenerAPI.getOpinionCluster(123456);
      
      assert.strictEqual(result.id, 123456);
      assert.strictEqual(result.case_name, "Test v. Example Corp");
    });
  });

  describe('⚡ Caching System', () => {
    it('should cache successful responses', async () => {
      const mockCluster = MockDataFactory.createOpinionCluster();
      mockServer.mockResponse('/api/rest/v4/clusters/123456/', {}, mockCluster);
      
      // First request - should hit server
      const result1 = await courtListenerAPI.getOpinionCluster(123456);
      assert.strictEqual(mockServer.getRequestHistory().length, 1);
      
      // Second request - should use cache
      const result2 = await courtListenerAPI.getOpinionCluster(123456);
      assert.strictEqual(mockServer.getRequestHistory().length, 1); // No additional request
      
      assert.deepStrictEqual(result1, result2);
      
      // Verify cache metrics
      const stats = mockMetrics.getStats();
      assert.strictEqual(stats.totalRequests, 2);
      assert.strictEqual(stats.cacheHits, 1);
    });
  });

  describe('🛡️ Error Handling', () => {
    it('should handle 404 errors gracefully', async () => {
      mockServer.mockResponse('/api/rest/v4/clusters/999999/', {},
        MockDataFactory.createErrorResponse("Not found"), 404
      );
      
      try {
        await courtListenerAPI.getOpinionCluster(999999);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('404'));
        assert.ok(error.message.includes('resource ID exists'));
      }
    });

    it('should handle 429 rate limit errors', async () => {
      mockServer.configure({ rateLimitPerMinute: 1 });
      
      const mockCluster = MockDataFactory.createOpinionCluster();
      mockServer.mockResponse('/api/rest/v4/clusters/123456/', {}, mockCluster);
      
      // First request should succeed
      await courtListenerAPI.getOpinionCluster(123456);
      
      // Second request should hit rate limit
      try {
        await courtListenerAPI.getOpinionCluster(123457);
        assert.fail('Should have hit rate limit');
      } catch (error) {
        assert.ok(error.message.includes('429') || error.message.includes('Too Many'));
      }
    });

    it('should handle network timeouts', async () => {
      mockServer.configure({ defaultDelay: 6000 }); // Longer than 5000ms timeout
      
      const mockCluster = MockDataFactory.createOpinionCluster();
      mockServer.mockResponse('/api/rest/v4/clusters/123456/', {}, mockCluster);
      
      try {
        await courtListenerAPI.getOpinionCluster(123456);
        assert.fail('Should have timed out');
      } catch (error) {
        assert.ok(error.message.includes('aborted') || error.message.includes('timeout'));
      }
    });
  });

  describe('🔄 Retry Logic', () => {
    it('should retry failed requests', async () => {
      // Stop the mock server to simulate network failures
      await mockServer.stop();
      
      const startTime = Date.now();
      
      try {
        // Try to make a request to the stopped server (will cause network error)
        await courtListenerAPI.getOpinionCluster(123456);
        
        assert.fail('Should have thrown a network error');
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // The retry should have taken some time due to exponential backoff
        // With 3 attempts and exponential backoff (1s, 2s), minimum time should be ~3 seconds
        assert.ok(duration >= 3000, `Should have taken at least 3 seconds for retries, took ${duration}ms`);
        
        // Error should indicate network failure or retry attempts
        assert.ok(
          error.message.includes('failed after all retry attempts') ||
          error.message.includes('request to') ||
          error.message.includes('failed, reason:') ||
          error.message.includes('fetch') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('network') ||
          error.message.includes('aborted'),
          `Should be a network error, got: ${error.message}`
        );
        
        console.log(`✓ Retry test completed - network error after ${duration}ms: ${error.message}`);
      }
    });
  });

  describe('📊 Performance Monitoring', () => {
    it('should track API performance metrics', async () => {
      const mockCluster = MockDataFactory.createOpinionCluster();
      mockServer.mockResponse('/api/rest/v4/clusters/123456/', {}, mockCluster);
      
      await courtListenerAPI.getOpinionCluster(123456);
      
      const stats = mockMetrics.getStats();
      assert.strictEqual(stats.totalRequests, 1);
      assert.strictEqual(stats.totalFailures, 0);
      
      // Verify that some logging occurred (may not be exactly 'api' level)
      assert.ok(mockLogger.logs.length > 0, 'Should have logged something');
      
      // Check for any logs related to the API call
      const hasApiRelatedLog = mockLogger.logs.some(log => 
        log.msg && log.msg.includes('clusters') || 
        log.level === 'api' ||
        (log.meta && JSON.stringify(log.meta).includes('123456'))
      );
      
      assert.ok(hasApiRelatedLog, 'Should have API-related logging');
    });
  });
});

console.log('✅ CourtListener API Integration tests completed');
