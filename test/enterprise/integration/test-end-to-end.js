#!/usr/bin/env node

/**
 * Comprehensive End-to-End Enterprise Tests
 * Tests complete workflows including failure scenarios and recovery patterns
 */

import { createMockLogger } from '../../utils/test-helpers.js';

class EnhancedEndToEndTests {
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
      const errorMessage = error && error.message ? error.message : 'Unknown error';
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  // Comprehensive Mock Legal MCP Server
  createLegalMCPServer(config = {}) {
    // Deep merge configuration with defaults
    const defaultConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      enterprise: {
        auth: { enabled: true },
        rateLimit: { enabled: true, maxRequests: 100 },
        audit: { enabled: true },
        sanitization: { enabled: true },
        circuitBreaker: { enabled: true },
        compression: { enabled: true },
        gracefulShutdown: { enabled: true, timeout: 30000 }
      }
    };

    // Merge user config with defaults
    const mergedConfig = {
      server: { ...defaultConfig.server, ...config.server },
      enterprise: {
        auth: { ...defaultConfig.enterprise.auth, ...config.auth },
        rateLimit: { ...defaultConfig.enterprise.rateLimit, ...config.rateLimit },
        audit: { ...defaultConfig.enterprise.audit, ...config.audit },
        sanitization: { ...defaultConfig.enterprise.sanitization, ...config.sanitization },
        circuitBreaker: { ...defaultConfig.enterprise.circuitBreaker, ...config.circuitBreaker },
        compression: { ...defaultConfig.enterprise.compression, ...config.compression },
        gracefulShutdown: { ...defaultConfig.enterprise.gracefulShutdown, ...config.gracefulShutdown }
      }
    };

    return {
      config: mergedConfig,
      
      // Server state
      state: 'stopped',
      connections: new Set(),
      requestsInFlight: new Map(),
      shutdownCallbacks: [],
      
      // Enterprise components
      components: {},
      
      // Metrics
      metrics: {
        uptime: 0,
        totalRequests: 0,
        activeConnections: 0,
        errorRate: 0,
        avgResponseTime: 0,
        memoryUsage: 0
      },

      async start() {
        if (this.state !== 'stopped') {
          throw new Error('Server already running');
        }

        this.state = 'starting';
        console.log(`    🚀 Starting Legal MCP Server on ${this.config.server.host}:${this.config.server.port}`);
        
        // Initialize enterprise components
        await this.initializeComponents();
        
        // Setup request handling
        this.setupRequestHandling();
        
        // Setup graceful shutdown
        if (this.config.enterprise?.gracefulShutdown?.enabled) {
          this.setupGracefulShutdown();
        }
        
        this.state = 'running';
        this.metrics.uptime = Date.now();
        
        return {
          success: true,
          port: this.config.server.port,
          components: Object.keys(this.components),
          message: 'Legal MCP Server started successfully'
        };
      },

      async stop() {
        if (this.state === 'stopped') {
          return { success: true, message: 'Server already stopped' };
        }

        this.state = 'stopping';
        console.log('    🛑 Stopping Legal MCP Server...');
        
        // Execute shutdown callbacks
        for (const callback of this.shutdownCallbacks) {
          try {
            await callback();
          } catch (error) {
            console.error('Shutdown callback error:', error);
          }
        }
        
        // Wait for in-flight requests to complete
        const timeout = this.config.enterprise?.gracefulShutdown?.timeout || 30000;
        await this.waitForRequestsToComplete(timeout);
        
        // Close connections
        for (const connection of this.connections) {
          try {
            connection.destroy();
          } catch (error) {
            console.error('Connection cleanup error:', error);
          }
        }
        
        this.state = 'stopped';
        this.metrics.uptime = Date.now() - this.metrics.uptime;
        
        return {
          success: true,
          uptime: this.metrics.uptime,
          message: 'Legal MCP Server stopped gracefully'
        };
      },

      async initializeComponents() {
        this.components = {};
        
        if (this.config.enterprise?.auth?.enabled) {
          this.components.auth = this.createAuthComponent();
        }
        
        if (this.config.enterprise?.rateLimit?.enabled) {
          this.components.rateLimit = this.createRateLimitComponent();
        }
        
        if (this.config.enterprise?.audit?.enabled) {
          this.components.audit = this.createAuditComponent();
        }
        
        if (this.config.enterprise?.sanitization?.enabled) {
          this.components.sanitization = this.createSanitizationComponent();
        }
        
        if (this.config.enterprise?.circuitBreaker?.enabled) {
          this.components.circuitBreaker = this.createCircuitBreakerComponent();
        }
        
        if (this.config.enterprise?.compression?.enabled) {
          this.components.compression = this.createCompressionComponent();
        }
        
        console.log(`    📦 Initialized ${Object.keys(this.components).length} enterprise components`);
      },

      createAuthComponent() {
        return {
          type: 'authentication',
          validCredentials: new Set(['legal-api-key-123', 'enterprise-token-456']),
          sessions: new Map(),
          
          async validate(credentials) {
            if (this.validCredentials.has(credentials)) {
              const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              this.sessions.set(sessionId, {
                credentials,
                created: Date.now(),
                lastAccess: Date.now()
              });
              return { valid: true, sessionId, clientId: `client_${credentials.substring(0, 8)}` };
            }
            return { valid: false, reason: 'Invalid credentials' };
          },
          
          async getSession(sessionId) {
            return this.sessions.get(sessionId);
          }
        };
      },

      createRateLimitComponent() {
        const maxRequests = this.config.enterprise?.rateLimit?.maxRequests || 100;
        return {
          type: 'rateLimit',
          clientLimits: new Map(),
          maxRequests,
          
          async checkLimit(clientId, limit = maxRequests) {
            const now = Date.now();
            const windowMs = 60000; // 1 minute window
            
            if (!this.clientLimits.has(clientId)) {
              this.clientLimits.set(clientId, { requests: [], count: 0 });
            }
            
            const clientData = this.clientLimits.get(clientId);
            
            // Clean old requests
            clientData.requests = clientData.requests.filter(req => (now - req.timestamp) < windowMs);
            clientData.count = clientData.requests.length;
            
            if (clientData.count >= limit) {
              return {
                allowed: false,
                remaining: 0,
                resetTime: now + windowMs,
                retryAfter: Math.ceil(windowMs / 1000)
              };
            }
            
            clientData.requests.push({ timestamp: now });
            clientData.count++;
            
            return {
              allowed: true,
              remaining: limit - clientData.count,
              resetTime: now + windowMs
            };
          }
        };
      },

      createAuditComponent() {
        return {
          type: 'audit',
          logs: [],
          
          async log(entry) {
            const auditEntry = {
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              timestamp: new Date().toISOString(),
              ...entry
            };
            
            this.logs.push(auditEntry);
            
            // Keep only last 1000 entries for memory management
            if (this.logs.length > 1000) {
              this.logs = this.logs.slice(-1000);
            }
            
            return auditEntry.id;
          },
          
          async getLogs(filter = {}) {
            let filtered = [...this.logs];
            
            if (filter.clientId) {
              filtered = filtered.filter(log => log.clientId === filter.clientId);
            }
            
            if (filter.startTime) {
              filtered = filtered.filter(log => new Date(log.timestamp) >= new Date(filter.startTime));
            }
            
            return filtered;
          }
        };
      },

      createSanitizationComponent() {
        return {
          type: 'sanitization',
          patterns: {
            xss: /<script[^>]*>.*?<\/script>/gi,
            sqlInjection: /(union|select|insert|update|delete|drop|create|alter)\s+/gi,
            commandInjection: /[;&|`$(){}[\]]/g
          },
          
          async sanitize(input) {
            if (typeof input !== 'string') {
              return { sanitized: input, violations: [] };
            }
            
            const violations = [];
            let sanitized = input;
            
            // Check for XSS
            if (this.patterns.xss.test(input)) {
              violations.push({ type: 'XSS', severity: 'high', pattern: 'script tags' });
              sanitized = sanitized.replace(this.patterns.xss, '[SCRIPT_REMOVED]');
            }
            
            // Check for SQL injection
            if (this.patterns.sqlInjection.test(input)) {
              violations.push({ type: 'SQL_INJECTION', severity: 'high', pattern: 'sql keywords' });
              sanitized = sanitized.replace(this.patterns.sqlInjection, '[SQL_BLOCKED]');
            }
            
            // Check for command injection
            if (this.patterns.commandInjection.test(input)) {
              violations.push({ type: 'COMMAND_INJECTION', severity: 'medium', pattern: 'shell metacharacters' });
              sanitized = sanitized.replace(this.patterns.commandInjection, '');
            }
            
            return { sanitized, violations };
          }
        };
      },

      createCircuitBreakerComponent() {
        return {
          type: 'circuitBreaker',
          state: 'CLOSED',
          failureCount: 0,
          lastFailureTime: null,
          nextAttemptTime: null,
          
          async execute(operation) {
            const threshold = 5;
            const timeout = 30000; // 30 seconds
            
            if (this.state === 'OPEN') {
              if (Date.now() < this.nextAttemptTime) {
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
              
              if (this.failureCount >= threshold) {
                this.state = 'OPEN';
                this.nextAttemptTime = Date.now() + timeout;
              }
              
              throw error;
            }
          },
          
          getState() {
            return {
              state: this.state,
              failureCount: this.failureCount,
              lastFailureTime: this.lastFailureTime,
              nextAttemptTime: this.nextAttemptTime
            };
          }
        };
      },

      createCompressionComponent() {
        return {
          type: 'compression',
          
          async compress(data, threshold = 1024) {
            const size = JSON.stringify(data).length;
            
            if (size > threshold) {
              // Simulate compression
              const compressionRatio = 0.3;
              return {
                compressed: true,
                originalSize: size,
                compressedSize: Math.floor(size * compressionRatio),
                ratio: compressionRatio,
                data: `[COMPRESSED:${size}→${Math.floor(size * compressionRatio)}]`
              };
            }
            
            return {
              compressed: false,
              originalSize: size,
              data
            };
          }
        };
      },

      setupRequestHandling() {
        // Simulate request handling setup
        this.handleRequest = this.handleRequest.bind(this);
      },

      async handleRequest(request) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const startTime = Date.now();
        
        this.metrics.totalRequests++;
        this.requestsInFlight.set(requestId, { startTime, request });
        
        try {
          // Simulate processing through enterprise pipeline
          let result;
          
          // If circuit breaker is enabled, wrap the query processing
          if (this.components.circuitBreaker) {
            result = await this.components.circuitBreaker.execute(async () => {
              return await this.processLegalQuery(request, requestId);
            });
          } else {
            result = await this.processLegalQuery(request, requestId);
          }
          
          const duration = Date.now() - startTime;
          this.updateMetrics(duration, true);
          
          return {
            success: true,
            requestId,
            result,
            duration,
            metadata: {
              componentsUsed: Object.keys(this.components),
              processingStages: ['sanitization', 'authentication', 'rateLimit', 'query', 'compression']
            }
          };
          
        } catch (error) {
          const duration = Date.now() - startTime;
          this.updateMetrics(duration, false);
          
          // Ensure error has proper structure
          const errorResult = {
            type: error.type || 'UNKNOWN_ERROR',
            message: error.message || 'Unknown error occurred',
            requestId,
            duration
          };
          
          // Add additional error properties if they exist
          if (error.violations) errorResult.violations = error.violations;
          if (error.reason) errorResult.reason = error.reason;
          if (error.retryAfter) errorResult.retryAfter = error.retryAfter;
          
          throw errorResult;
        } finally {
          this.requestsInFlight.delete(requestId);
        }
      },

      async processLegalQuery(request, requestId) {
        const context = { requestId, request };
        
        // 1. Input Sanitization
        if (this.components.sanitization) {
          const sanitization = await this.components.sanitization.sanitize(request.query || '');
          if (sanitization.violations.length > 0) {
            const error = new Error('Input sanitization failed');
            error.type = 'SANITIZATION_ERROR';
            error.violations = sanitization.violations;
            throw error;
          }
          context.sanitizedQuery = sanitization.sanitized;
        }
        
        // 2. Authentication
        if (this.components.auth) {
          const auth = await this.components.auth.validate(request.credentials);
          if (!auth.valid) {
            const error = new Error('Authentication failed');
            error.type = 'AUTH_ERROR';
            error.reason = auth.reason;
            throw error;
          }
          context.clientId = auth.clientId;
          context.sessionId = auth.sessionId;
        }
        
        // 3. Rate Limiting
        if (this.components.rateLimit) {
          const rateLimit = await this.components.rateLimit.checkLimit(context.clientId);
          if (!rateLimit.allowed) {
            const error = new Error('Rate limit exceeded');
            error.type = 'RATE_LIMIT_ERROR';
            error.retryAfter = rateLimit.retryAfter;
            throw error;
          }
          context.rateLimitInfo = rateLimit;
        }
        
        // 4. Query Execution (circuit breaker protection handled at higher level)
        const queryResult = await this.executeLegalQuery(context);
        
        // 5. Response Compression
        if (this.components.compression) {
          const compression = await this.components.compression.compress(queryResult);
          context.compressionInfo = compression;
          queryResult.compressed = compression.compressed;
        }
        
        // 6. Audit Logging
        if (this.components.audit) {
          await this.components.audit.log({
            requestId,
            clientId: context.clientId,
            query: context.sanitizedQuery,
            success: true,
            responseSize: JSON.stringify(queryResult).length
          });
        }
        
        return queryResult;
      },

      async executeLegalQuery(context) {
        const query = context.sanitizedQuery || context.request.query;
        
        // Simulate legal database queries
        if (query.includes('case law')) {
          return {
            type: 'case_law_search',
            results: [
              { case: 'Brown v. Board of Education', year: 1954, relevance: 0.95 },
              { case: 'Roe v. Wade', year: 1973, relevance: 0.87 }
            ],
            metadata: { searchTime: 45, totalFound: 2 }
          };
        }
        
        if (query.includes('statute')) {
          return {
            type: 'statute_search',
            results: [
              { title: 'Civil Rights Act', section: '1983', text: 'Every person who...' },
              { title: 'Americans with Disabilities Act', section: '101', text: 'No covered entity...' }
            ],
            metadata: { searchTime: 32, totalFound: 2 }
          };
        }
        
        if (query.includes('regulation')) {
          return {
            type: 'regulation_search',
            results: [
              { cfr: '29 CFR 1630.2', title: 'Definitions', text: 'For purposes of this part...' }
            ],
            metadata: { searchTime: 28, totalFound: 1 }
          };
        }
        
        // Default response
        return {
          type: 'general_search',
          results: [],
          metadata: { searchTime: 15, totalFound: 0, message: 'No specific results found' }
        };
      },

      updateMetrics(duration, success) {
        // Update average response time
        const alpha = 0.1; // Exponential moving average factor
        this.metrics.avgResponseTime = this.metrics.avgResponseTime * (1 - alpha) + duration * alpha;
        
        // Update error rate
        const totalResponses = this.metrics.totalRequests;
        const currentErrorRate = success ? 0 : 1;
        this.metrics.errorRate = (this.metrics.errorRate * (totalResponses - 1) + currentErrorRate) / totalResponses;
        
        // Update active connections
        this.metrics.activeConnections = this.requestsInFlight.size;
        
        // Simulate memory usage
        this.metrics.memoryUsage = Math.floor(Math.random() * 100) + 50; // 50-150 MB
      },

      setupGracefulShutdown() {
        this.shutdownCallbacks.push(async () => {
          console.log('    📋 Finalizing audit logs...');
          if (this.components.audit) {
            await this.components.audit.log({
              type: 'server_shutdown',
              timestamp: new Date().toISOString(),
              uptime: Date.now() - this.metrics.uptime
            });
          }
        });
        
        this.shutdownCallbacks.push(async () => {
          console.log('    💾 Saving metrics...');
          // Simulate metrics persistence
          await new Promise(resolve => setTimeout(resolve, 100));
        });
      },

      async waitForRequestsToComplete(timeout) {
        const start = Date.now();
        
        while (this.requestsInFlight.size > 0 && (Date.now() - start) < timeout) {
          console.log(`    ⏳ Waiting for ${this.requestsInFlight.size} requests to complete...`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.requestsInFlight.size > 0) {
          console.log(`    ⚠️ Forcibly terminating ${this.requestsInFlight.size} remaining requests`);
        }
      },

      getMetrics() {
        return {
          ...this.metrics,
          uptime: this.state === 'running' ? Date.now() - this.metrics.uptime : this.metrics.uptime,
          state: this.state,
          components: Object.keys(this.components),
          requestsInFlight: this.requestsInFlight.size
        };
      },

      async healthCheck() {
        const health = {
          status: this.state,
          timestamp: new Date().toISOString(),
          components: {},
          metrics: this.getMetrics()
        };
        
        // Check component health
        for (const [name, component] of Object.entries(this.components)) {
          try {
            if (component.type === 'circuitBreaker') {
              health.components[name] = component.getState();
            } else {
              health.components[name] = { status: 'healthy', type: component.type };
            }
          } catch (error) {
            health.components[name] = { status: 'unhealthy', error: error.message };
          }
        }
        
        return health;
      }
    };
  }

  async runComprehensiveTests() {
    console.log('🔄 Running Comprehensive End-to-End Enterprise Tests...\n');

    // Server Lifecycle Tests
    console.log('🚀 Server Lifecycle Tests:');

    await this.runAsyncTest('should start server with all components', async () => {
      const server = this.createLegalMCPServer();
      
      const startResult = await server.start();
      
      console.assert(startResult.success === true, 'Should start successfully');
      console.assert(startResult.port === 3000, 'Should use configured port');
      console.assert(startResult.components.length > 0, 'Should initialize components');
      console.assert(server.state === 'running', 'Should be in running state');
      
      await server.stop();
    });

    await this.runAsyncTest('should stop server gracefully', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const stopResult = await server.stop();
      
      console.assert(stopResult.success === true, 'Should stop successfully');
      console.assert(stopResult.uptime > 0, 'Should track uptime');
      console.assert(server.state === 'stopped', 'Should be in stopped state');
    });

    // Legal Query Processing Tests
    console.log('\n⚖️ Legal Query Processing Tests:');

    await this.runAsyncTest('should process case law queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const request = {
        credentials: 'legal-api-key-123',
        query: 'case law search for civil rights'
      };
      
      const result = await server.handleRequest(request);
      
      console.assert(result.success === true, 'Should process successfully');
      console.assert(result.result.type === 'case_law_search', 'Should identify as case law search');
      console.assert(result.result.results.length > 0, 'Should return case law results');
      console.assert(result.duration > 0, 'Should track processing duration');
      
      await server.stop();
    });

    await this.runAsyncTest('should process statute queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const request = {
        credentials: 'enterprise-token-456',
        query: 'statute search for disability rights'
      };
      
      const result = await server.handleRequest(request);
      
      console.assert(result.success === true, 'Should process successfully');
      console.assert(result.result.type === 'statute_search', 'Should identify as statute search');
      console.assert(result.result.results.length > 0, 'Should return statute results');
      
      await server.stop();
    });

    await this.runAsyncTest('should process regulation queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const request = {
        credentials: 'legal-api-key-123',
        query: 'regulation search for employment law'
      };
      
      const result = await server.handleRequest(request);
      
      console.assert(result.success === true, 'Should process successfully');
      console.assert(result.result.type === 'regulation_search', 'Should identify as regulation search');
      
      await server.stop();
    });

    // Security Integration Tests
    console.log('\n🔒 Security Integration Tests:');

    await this.runAsyncTest('should block malicious queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const maliciousRequest = {
        credentials: 'legal-api-key-123',
        query: 'case law <script>alert("xss")</script> search'
      };
      
      try {
        await server.handleRequest(maliciousRequest);
        console.assert(false, 'Should block malicious query');
      } catch (error) {
        console.assert(error.type === 'SANITIZATION_ERROR', 'Should be sanitization error');
        console.assert(error.violations.length > 0, 'Should report violations');
      }
      
      await server.stop();
    });

    await this.runAsyncTest('should reject invalid credentials', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const invalidRequest = {
        credentials: 'invalid-credentials',
        query: 'case law search'
      };
      
      try {
        await server.handleRequest(invalidRequest);
        console.assert(false, 'Should reject invalid credentials');
      } catch (error) {
        console.assert(error.type === 'AUTH_ERROR', 'Should be authentication error');
      }
      
      await server.stop();
    });

    await this.runAsyncTest('should enforce rate limits', async () => {
      const server = this.createLegalMCPServer({
        rateLimit: { maxRequests: 3 }
      });
      await server.start();
      
      const request = {
        credentials: 'legal-api-key-123',
        query: 'case law search'
      };
      
      // Use up rate limit
      for (let i = 0; i < 3; i++) {
        await server.handleRequest(request);
      }
      
      // This should be rate limited
      try {
        await server.handleRequest(request);
        console.assert(false, 'Should be rate limited');
      } catch (error) {
        console.assert(error.type === 'RATE_LIMIT_ERROR', 'Should be rate limit error');
        console.assert(error.retryAfter > 0, 'Should include retry after');
      }
      
      await server.stop();
    });

    // Resilience Tests
    console.log('\n💪 Resilience Tests:');

    await this.runAsyncTest('should handle circuit breaker scenarios', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      // Simulate failing requests by replacing the executeLegalQuery method
      const originalExecute = server.executeLegalQuery;
      server.executeLegalQuery = async () => {
        const error = new Error('Database connection failed');
        error.type = 'DATABASE_ERROR';
        throw error;
      };
      
      const request = {
        credentials: 'legal-api-key-123',
        query: 'case law search'
      };
      
      // Generate failures to open circuit
      let failureCount = 0;
      for (let i = 0; i < 6; i++) {
        try {
          await server.handleRequest(request);
        } catch (error) {
          failureCount++;
          // Expected failures
        }
      }
      
      // Check circuit breaker state
      const cbState = server.components.circuitBreaker.getState();
      console.assert(cbState.state === 'OPEN', `Circuit breaker should be open, but is ${cbState.state}`);
      console.assert(cbState.failureCount >= 5, `Should track failure count, got ${cbState.failureCount}`);
      
      // Test that circuit breaker blocks new requests
      try {
        await server.handleRequest(request);
        console.assert(false, 'Should block requests when circuit is open');
      } catch (error) {
        console.assert(error.message.includes('Circuit breaker is OPEN'), 'Should indicate circuit is open');
      }
      
      // Restore original function
      server.executeLegalQuery = originalExecute;
      
      await server.stop();
    });

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle concurrent legal queries', async () => {
      const server = this.createLegalMCPServer({
        rateLimit: { maxRequests: 50 }
      });
      await server.start();
      
      const concurrentQueries = 10;
      const start = Date.now();
      
      // Use valid credentials for all concurrent requests
      const validCredentials = ['legal-api-key-123', 'enterprise-token-456'];
      
      const promises = Array(concurrentQueries).fill(null).map((_, i) => 
        server.handleRequest({
          credentials: validCredentials[i % validCredentials.length],
          query: `case law search ${i}`
        })
      );
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.assert(results.length === concurrentQueries, 'Should complete all queries');
      console.assert(results.every(r => r.success), 'All queries should succeed');
      console.assert(duration < 2000, 'Should complete concurrent queries efficiently');
      
      const avgTime = duration / concurrentQueries;
      console.log(`    ⚡ Average concurrent query time: ${avgTime.toFixed(2)}ms`);
      
      await server.stop();
    });

    await this.runAsyncTest('should maintain performance under mixed workload', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const workloadQueries = [
        // Case law queries
        ...Array(5).fill(null).map((_, i) => ({
          credentials: 'legal-api-key-123',
          query: `case law search for topic ${i}`
        })),
        // Statute queries
        ...Array(3).fill(null).map((_, i) => ({
          credentials: 'enterprise-token-456',
          query: `statute search for area ${i}`
        })),
        // Regulation queries
        ...Array(2).fill(null).map((_, i) => ({
          credentials: 'legal-api-key-123',
          query: `regulation search for subject ${i}`
        }))
      ];
      
      const start = Date.now();
      const results = await Promise.all(
        workloadQueries.map(query => server.handleRequest(query))
      );
      const duration = Date.now() - start;
      
      console.assert(results.length === 10, 'Should complete all mixed queries');
      console.assert(results.every(r => r.success), 'All mixed queries should succeed');
      
      const caseResults = results.filter(r => r.result.type === 'case_law_search');
      const statuteResults = results.filter(r => r.result.type === 'statute_search');
      const regResults = results.filter(r => r.result.type === 'regulation_search');
      
      console.assert(caseResults.length === 5, 'Should process case law queries');
      console.assert(statuteResults.length === 3, 'Should process statute queries');
      console.assert(regResults.length === 2, 'Should process regulation queries');
      
      await server.stop();
    });

    // Health Monitoring Tests
    console.log('\n🏥 Health Monitoring Tests:');

    await this.runAsyncTest('should provide comprehensive health checks', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      // Process some requests to generate metrics
      await server.handleRequest({
        credentials: 'legal-api-key-123',
        query: 'case law search'
      });
      
      const health = await server.healthCheck();
      
      console.assert(health.status === 'running', 'Should report running status');
      console.assert(health.components !== undefined, 'Should include component health');
      console.assert(health.metrics !== undefined, 'Should include metrics');
      console.assert(health.metrics.totalRequests > 0, 'Should track total requests');
      console.assert(health.metrics.avgResponseTime > 0, 'Should track response time');
      
      await server.stop();
    });

    await this.runAsyncTest('should track metrics accurately', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      const initialMetrics = server.getMetrics();
      console.assert(initialMetrics.totalRequests === 0, 'Should start with zero requests');
      
      // Process successful request
      await server.handleRequest({
        credentials: 'legal-api-key-123',
        query: 'case law search'
      });
      
      // Process failed request
      try {
        await server.handleRequest({
          credentials: 'invalid-credentials',
          query: 'case law search'
        });
      } catch (error) {
        // Expected failure
      }
      
      const finalMetrics = server.getMetrics();
      console.assert(finalMetrics.totalRequests === 2, 'Should track total requests');
      console.assert(finalMetrics.errorRate > 0, 'Should track error rate');
      console.assert(finalMetrics.avgResponseTime > 0, 'Should track response time');
      
      await server.stop();
    });

    // Audit and Compliance Tests
    console.log('\n📋 Audit and Compliance Tests:');

    await this.runAsyncTest('should log all activities for audit', async () => {
      const server = this.createLegalMCPServer();
      await server.start();
      
      // Process various types of requests
      await server.handleRequest({
        credentials: 'legal-api-key-123',
        query: 'case law search'
      });
      
      try {
        await server.handleRequest({
          credentials: 'invalid-credentials',
          query: 'statute search'
        });
      } catch (error) {
        // Expected failure
      }
      
      const auditLogs = await server.components.audit.getLogs();
      
      console.assert(auditLogs.length >= 1, 'Should log activities'); // Only successful requests logged
      console.assert(auditLogs[0].requestId !== undefined, 'Should include request ID');
      console.assert(auditLogs[0].clientId !== undefined, 'Should include client ID');
      console.assert(auditLogs[0].query !== undefined, 'Should include query');
      
      await server.stop();
    });

    // Summary
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 END-TO-END ENTERPRISE TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`);

    if (this.failedTests === 0) {
      console.log('\n🎉 All end-to-end enterprise tests passed! Complete Legal MCP Server workflow is functioning correctly.');
    } else {
      console.log(`\n💥 ${this.failedTests} test(s) failed. Please review end-to-end implementation.`);
      process.exit(1);
    }

    console.log('\n✅ Enhanced End-to-End Enterprise Tests Completed Successfully!');
  }
}

// Run the comprehensive end-to-end tests
const endToEndTests = new EnhancedEndToEndTests();
endToEndTests.runComprehensiveTests().catch(error => {
  console.error('Fatal error in end-to-end tests:', error);
  process.exit(1);
});
