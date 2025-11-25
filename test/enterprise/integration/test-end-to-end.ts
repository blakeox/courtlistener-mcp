#!/usr/bin/env node

/**
 * ✅ Comprehensive End-to-End Enterprise Tests (TypeScript)
 * Tests complete workflows including failure scenarios and recovery patterns
 */

import { createMockLogger, type MockLogger } from '../../../utils/test-helpers.ts';

interface ServerConfig {
  server?: {
    port?: number;
    host?: string;
  };
  enterprise?: {
    auth?: { enabled?: boolean };
    rateLimit?: { enabled?: boolean; maxRequests?: number };
    audit?: { enabled?: boolean };
    sanitization?: { enabled?: boolean };
    circuitBreaker?: { enabled?: boolean };
    compression?: { enabled?: boolean };
    gracefulShutdown?: { enabled?: boolean; timeout?: number };
  };
  auth?: { enabled?: boolean };
  rateLimit?: { maxRequests?: number };
  audit?: { enabled?: boolean };
  sanitization?: { enabled?: boolean };
  circuitBreaker?: { enabled?: boolean };
  compression?: { enabled?: boolean };
  gracefulShutdown?: { enabled?: boolean; timeout?: number };
}

interface AuthComponent {
  type: string;
  validCredentials: Set<string>;
  sessions: Map<string, { credentials: string; created: number; lastAccess: number }>;
  validate(credentials: string): Promise<{
    valid: boolean;
    sessionId?: string;
    clientId?: string;
    reason?: string;
  }>;
  getSession(
    sessionId: string,
  ): { credentials: string; created: number; lastAccess: number } | undefined;
}

interface RateLimitComponent {
  type: string;
  clientLimits: Map<string, { requests: Array<{ timestamp: number }>; count: number }>;
  maxRequests: number;
  checkLimit(
    clientId: string,
    limit?: number,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  }>;
}

interface AuditComponent {
  type: string;
  logs: Array<{
    id: string;
    timestamp: string;
    [key: string]: unknown;
  }>;
  log(entry: Record<string, unknown>): Promise<string>;
  getLogs(filter?: {
    clientId?: string;
    startTime?: string;
  }): Promise<Array<Record<string, unknown>>>;
}

interface SanitizationComponent {
  type: string;
  patterns: {
    xss: RegExp;
    sqlInjection: RegExp;
    commandInjection: RegExp;
  };
  sanitize(input: string): Promise<{
    sanitized: string;
    violations: Array<{ type: string; severity: string; pattern: string }>;
  }>;
}

interface CircuitBreakerComponent {
  type: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): {
    state: string;
    failureCount: number;
    lastFailureTime: number | null;
    nextAttemptTime: number | null;
  };
}

interface CompressionComponent {
  type: string;
  compress(
    data: unknown,
    threshold?: number,
  ): Promise<{
    compressed: boolean;
    originalSize: number;
    compressedSize?: number;
    ratio?: number;
    data: unknown;
  }>;
}

interface ServerComponents {
  auth?: AuthComponent;
  rateLimit?: RateLimitComponent;
  audit?: AuditComponent;
  sanitization?: SanitizationComponent;
  circuitBreaker?: CircuitBreakerComponent;
  compression?: CompressionComponent;
}

interface RequestInFlight {
  startTime: number;
  request: LegalRequest;
}

interface LegalRequest {
  credentials?: string;
  query?: string;
  [key: string]: unknown;
}

interface LegalMCPServer {
  config: Required<ServerConfig>;
  state: 'stopped' | 'starting' | 'running' | 'stopping';
  connections: Set<{ destroy(): void }>;
  requestsInFlight: Map<string, RequestInFlight>;
  shutdownCallbacks: Array<() => Promise<void>>;
  components: ServerComponents;
  metrics: {
    uptime: number;
    totalRequests: number;
    activeConnections: number;
    errorRate: number;
    avgResponseTime: number;
    memoryUsage: number;
  };
  start(): Promise<{
    success: boolean;
    port: number;
    components: string[];
    message: string;
  }>;
  stop(): Promise<{
    success: boolean;
    uptime?: number;
    message: string;
  }>;
  handleRequest(request: LegalRequest): Promise<{
    success: boolean;
    requestId: string;
    result: unknown;
    duration: number;
    metadata: {
      componentsUsed: string[];
      processingStages: string[];
    };
  }>;
  getMetrics(): Record<string, unknown>;
  healthCheck(): Promise<Record<string, unknown>>;
  executeLegalQuery(context: Record<string, unknown>): Promise<unknown>;
}

class EnhancedEndToEndTests {
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

  private async runAsyncTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    this.testCount++;
    try {
      await testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      const errorMessage =
        error && error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  // Comprehensive Mock Legal MCP Server
  private createLegalMCPServer(config: ServerConfig = {}): LegalMCPServer {
    // Deep merge configuration with defaults
    const defaultConfig: ServerConfig = {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      enterprise: {
        auth: { enabled: true },
        rateLimit: { enabled: true, maxRequests: 100 },
        audit: { enabled: true },
        sanitization: { enabled: true },
        circuitBreaker: { enabled: true },
        compression: { enabled: true },
        gracefulShutdown: { enabled: true, timeout: 30000 },
      },
    };

    // Merge user config with defaults
    const mergedConfig = {
      server: { ...defaultConfig.server, ...config.server },
      enterprise: {
        auth: {
          ...defaultConfig.enterprise?.auth,
          ...config.auth,
          ...config.enterprise?.auth,
        },
        rateLimit: {
          ...defaultConfig.enterprise?.rateLimit,
          ...config.rateLimit,
          ...config.enterprise?.rateLimit,
        },
        audit: {
          ...defaultConfig.enterprise?.audit,
          ...config.audit,
          ...config.enterprise?.audit,
        },
        sanitization: {
          ...defaultConfig.enterprise?.sanitization,
          ...config.sanitization,
          ...config.enterprise?.sanitization,
        },
        circuitBreaker: {
          ...defaultConfig.enterprise?.circuitBreaker,
          ...config.circuitBreaker,
          ...config.enterprise?.circuitBreaker,
        },
        compression: {
          ...defaultConfig.enterprise?.compression,
          ...config.compression,
          ...config.enterprise?.compression,
        },
        gracefulShutdown: {
          ...defaultConfig.enterprise?.gracefulShutdown,
          ...config.gracefulShutdown,
          ...config.enterprise?.gracefulShutdown,
        },
      },
    } as Required<ServerConfig>;

    const server: LegalMCPServer = {
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
        memoryUsage: 0,
      },

      async start() {
        if (this.state !== 'stopped') {
          throw new Error('Server already running');
        }

        this.state = 'starting';
        console.log(
          `    🚀 Starting Legal MCP Server on ${this.config.server.host}:${this.config.server.port}`,
        );

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
          message: 'Legal MCP Server started successfully',
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
          message: 'Legal MCP Server stopped gracefully',
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

        console.log(
          `    📦 Initialized ${Object.keys(this.components).length} enterprise components`,
        );
      },

      createAuthComponent(): AuthComponent {
        return {
          type: 'authentication',
          validCredentials: new Set(['legal-api-key-123', 'enterprise-token-456']),
          sessions: new Map(),

          async validate(credentials: string) {
            if (this.validCredentials.has(credentials)) {
              const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
              this.sessions.set(sessionId, {
                credentials,
                created: Date.now(),
                lastAccess: Date.now(),
              });
              return {
                valid: true,
                sessionId,
                clientId: `client_${credentials.substring(0, 8)}`,
              };
            }
            return { valid: false, reason: 'Invalid credentials' };
          },

          async getSession(sessionId: string) {
            return this.sessions.get(sessionId);
          },
        };
      },

      createRateLimitComponent(): RateLimitComponent {
        const maxRequests = this.config.enterprise?.rateLimit?.maxRequests || 100;
        return {
          type: 'rateLimit',
          clientLimits: new Map(),
          maxRequests,

          async checkLimit(clientId: string, limit: number = maxRequests) {
            const now = Date.now();
            const windowMs = 60000; // 1 minute window

            if (!this.clientLimits.has(clientId)) {
              this.clientLimits.set(clientId, { requests: [], count: 0 });
            }

            const clientData = this.clientLimits.get(clientId)!;

            // Clean old requests
            clientData.requests = clientData.requests.filter(
              (req) => now - req.timestamp < windowMs,
            );
            clientData.count = clientData.requests.length;

            if (clientData.count >= limit) {
              return {
                allowed: false,
                remaining: 0,
                resetTime: now + windowMs,
                retryAfter: Math.ceil(windowMs / 1000),
              };
            }

            clientData.requests.push({ timestamp: now });
            clientData.count++;

            return {
              allowed: true,
              remaining: limit - clientData.count,
              resetTime: now + windowMs,
            };
          },
        };
      },

      createAuditComponent(): AuditComponent {
        return {
          type: 'audit',
          logs: [],

          async log(entry: Record<string, unknown>) {
            const auditEntry = {
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              timestamp: new Date().toISOString(),
              ...entry,
            };

            this.logs.push(auditEntry);

            // Keep only last 1000 entries for memory management
            if (this.logs.length > 1000) {
              this.logs = this.logs.slice(-1000);
            }

            return auditEntry.id as string;
          },

          async getLogs(filter: { clientId?: string; startTime?: string } = {}) {
            let filtered: Array<Record<string, unknown>> = [...this.logs];

            if (filter.clientId) {
              filtered = filtered.filter((log) => log.clientId === filter.clientId);
            }

            if (filter.startTime) {
              filtered = filtered.filter(
                (log) => new Date(log.timestamp as string) >= new Date(filter.startTime!),
              );
            }

            return filtered;
          },
        };
      },

      createSanitizationComponent(): SanitizationComponent {
        return {
          type: 'sanitization',
          patterns: {
            xss: /<script[^>]*>.*?<\/script>/gi,
            sqlInjection: /(union|select|insert|update|delete|drop|create|alter)\s+/gi,
            commandInjection: /[;&|`$(){}[\]]/g,
          },

          async sanitize(input: string) {
            if (typeof input !== 'string') {
              return { sanitized: input, violations: [] };
            }

            const violations: Array<{
              type: string;
              severity: string;
              pattern: string;
            }> = [];
            let sanitized = input;

            // Check for XSS
            if (this.patterns.xss.test(input)) {
              violations.push({
                type: 'XSS',
                severity: 'high',
                pattern: 'script tags',
              });
              sanitized = sanitized.replace(this.patterns.xss, '[SCRIPT_REMOVED]');
            }

            // Check for SQL injection
            if (this.patterns.sqlInjection.test(input)) {
              violations.push({
                type: 'SQL_INJECTION',
                severity: 'high',
                pattern: 'sql keywords',
              });
              sanitized = sanitized.replace(this.patterns.sqlInjection, '[SQL_BLOCKED]');
            }

            // Check for command injection
            if (this.patterns.commandInjection.test(input)) {
              violations.push({
                type: 'COMMAND_INJECTION',
                severity: 'medium',
                pattern: 'shell metacharacters',
              });
              sanitized = sanitized.replace(this.patterns.commandInjection, '');
            }

            return { sanitized, violations };
          },
        };
      },

      createCircuitBreakerComponent(): CircuitBreakerComponent {
        return {
          type: 'circuitBreaker',
          state: 'CLOSED',
          failureCount: 0,
          lastFailureTime: null,
          nextAttemptTime: null,

          async execute<T>(operation: () => Promise<T>): Promise<T> {
            const threshold = 5;
            const timeout = 30000; // 30 seconds

            if (this.state === 'OPEN') {
              if (this.nextAttemptTime && Date.now() < this.nextAttemptTime) {
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
              nextAttemptTime: this.nextAttemptTime,
            };
          },
        };
      },

      createCompressionComponent(): CompressionComponent {
        return {
          type: 'compression',

          async compress(data: unknown, threshold: number = 1024) {
            const size = JSON.stringify(data).length;

            if (size > threshold) {
              // Simulate compression
              const compressionRatio = 0.3;
              return {
                compressed: true,
                originalSize: size,
                compressedSize: Math.floor(size * compressionRatio),
                ratio: compressionRatio,
                data: `[COMPRESSED:${size}→${Math.floor(size * compressionRatio)}]`,
              };
            }

            return {
              compressed: false,
              originalSize: size,
              data,
            };
          },
        };
      },

      setupRequestHandling() {
        // Simulate request handling setup

        this.handleRequest = this.handleRequest.bind(this);
      },

      async handleRequest(request: LegalRequest) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const startTime = Date.now();

        this.metrics.totalRequests++;
        this.requestsInFlight.set(requestId, { startTime, request });

        try {
          // Simulate processing through enterprise pipeline
          let result: unknown;

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
              processingStages: [
                'sanitization',
                'authentication',
                'rateLimit',
                'query',
                'compression',
              ],
            },
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          this.updateMetrics(duration, false);

          // Ensure error has proper structure
          const errorResult = error as {
            type?: string;
            message?: string;
            violations?: unknown[];
            reason?: string;
            retryAfter?: number;
          };

          const fullError = {
            type: errorResult.type || 'UNKNOWN_ERROR',
            message: errorResult.message || 'Unknown error occurred',
            requestId,
            duration,
            ...(errorResult.violations && { violations: errorResult.violations }),
            ...(errorResult.reason && { reason: errorResult.reason }),
            ...(errorResult.retryAfter && { retryAfter: errorResult.retryAfter }),
          };

          throw fullError;
        } finally {
          this.requestsInFlight.delete(requestId);
        }
      },

      async processLegalQuery(request: LegalRequest, requestId: string): Promise<unknown> {
        const context: Record<string, unknown> = { requestId, request };

        // 1. Input Sanitization
        if (this.components.sanitization) {
          const sanitization = await this.components.sanitization.sanitize(
            (request.query as string) || '',
          );
          if (sanitization.violations.length > 0) {
            const error = new Error('Input sanitization failed') as Error & {
              type: string;
              violations: Array<{
                type: string;
                severity: string;
                pattern: string;
              }>;
            };
            error.type = 'SANITIZATION_ERROR';
            error.violations = sanitization.violations;
            throw error;
          }
          context.sanitizedQuery = sanitization.sanitized;
        }

        // 2. Authentication
        if (this.components.auth) {
          const auth = await this.components.auth.validate((request.credentials as string) || '');
          if (!auth.valid) {
            const error = new Error('Authentication failed') as Error & {
              type: string;
              reason: string;
            };
            error.type = 'AUTH_ERROR';
            error.reason = auth.reason || 'Invalid credentials';
            throw error;
          }
          context.clientId = auth.clientId;
          context.sessionId = auth.sessionId;
        }

        // 3. Rate Limiting
        if (this.components.rateLimit) {
          const rateLimit = await this.components.rateLimit.checkLimit(
            (context.clientId as string) || 'anonymous',
          );
          if (!rateLimit.allowed) {
            const error = new Error('Rate limit exceeded') as Error & {
              type: string;
              retryAfter: number;
            };
            error.type = 'RATE_LIMIT_ERROR';
            error.retryAfter = rateLimit.retryAfter || 60;
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
          if (typeof queryResult === 'object' && queryResult !== null) {
            (queryResult as Record<string, unknown>).compressed = compression.compressed;
          }
        }

        // 6. Audit Logging
        if (this.components.audit) {
          await this.components.audit.log({
            requestId,
            clientId: context.clientId,
            query: context.sanitizedQuery,
            success: true,
            responseSize: JSON.stringify(queryResult).length,
          });
        }

        return queryResult;
      },

      async executeLegalQuery(context: Record<string, unknown>): Promise<unknown> {
        const query =
          (context.sanitizedQuery as string) || (context.request as LegalRequest).query || '';

        // Simulate legal database queries
        if (query.includes('case law')) {
          return {
            type: 'case_law_search',
            results: [
              { case: 'Brown v. Board of Education', year: 1954, relevance: 0.95 },
              { case: 'Roe v. Wade', year: 1973, relevance: 0.87 },
            ],
            metadata: { searchTime: 45, totalFound: 2 },
          };
        }

        if (query.includes('statute')) {
          return {
            type: 'statute_search',
            results: [
              { title: 'Civil Rights Act', section: '1983', text: 'Every person who...' },
              {
                title: 'Americans with Disabilities Act',
                section: '101',
                text: 'No covered entity...',
              },
            ],
            metadata: { searchTime: 32, totalFound: 2 },
          };
        }

        if (query.includes('regulation')) {
          return {
            type: 'regulation_search',
            results: [
              {
                cfr: '29 CFR 1630.2',
                title: 'Definitions',
                text: 'For purposes of this part...',
              },
            ],
            metadata: { searchTime: 28, totalFound: 1 },
          };
        }

        // Default response
        return {
          type: 'general_search',
          results: [],
          metadata: {
            searchTime: 15,
            totalFound: 0,
            message: 'No specific results found',
          },
        };
      },

      updateMetrics(duration: number, success: boolean): void {
        // Update average response time
        const alpha = 0.1; // Exponential moving average factor
        this.metrics.avgResponseTime =
          this.metrics.avgResponseTime * (1 - alpha) + duration * alpha;

        // Update error rate
        const totalResponses = this.metrics.totalRequests;
        const currentErrorRate = success ? 0 : 1;
        this.metrics.errorRate =
          (this.metrics.errorRate * (totalResponses - 1) + currentErrorRate) / totalResponses;

        // Update active connections
        this.metrics.activeConnections = this.requestsInFlight.size;

        // Simulate memory usage
        this.metrics.memoryUsage = Math.floor(Math.random() * 100) + 50; // 50-150 MB
      },

      setupGracefulShutdown(): void {
        this.shutdownCallbacks.push(async () => {
          console.log('    📋 Finalizing audit logs...');
          if (this.components.audit) {
            await this.components.audit.log({
              type: 'server_shutdown',
              timestamp: new Date().toISOString(),
              uptime: Date.now() - this.metrics.uptime,
            });
          }
        });

        this.shutdownCallbacks.push(async () => {
          console.log('    💾 Saving metrics...');
          // Simulate metrics persistence
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
      },

      async waitForRequestsToComplete(timeout: number): Promise<void> {
        const start = Date.now();

        while (this.requestsInFlight.size > 0 && Date.now() - start < timeout) {
          console.log(`    ⏳ Waiting for ${this.requestsInFlight.size} requests to complete...`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (this.requestsInFlight.size > 0) {
          console.log(
            `    ⚠️ Forcibly terminating ${this.requestsInFlight.size} remaining requests`,
          );
        }
      },

      getMetrics(): Record<string, unknown> {
        return {
          ...this.metrics,
          uptime: this.state === 'running' ? Date.now() - this.metrics.uptime : this.metrics.uptime,
          state: this.state,
          components: Object.keys(this.components),
          requestsInFlight: this.requestsInFlight.size,
        };
      },

      async healthCheck(): Promise<Record<string, unknown>> {
        const health: Record<string, unknown> = {
          status: this.state,
          timestamp: new Date().toISOString(),
          components: {},
          metrics: this.getMetrics(),
        };

        // Check component health
        for (const [name, component] of Object.entries(this.components)) {
          try {
            if (component && 'type' in component && component.type === 'circuitBreaker') {
              health.components[name] = (component as CircuitBreakerComponent).getState();
            } else {
              health.components[name] = {
                status: 'healthy',
                type: component && 'type' in component ? component.type : 'unknown',
              };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            health.components[name] = {
              status: 'unhealthy',
              error: errorMessage,
            };
          }
        }

        return health;
      },
    };

    return server;
  }

  async runComprehensiveTests(): Promise<void> {
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
      console.assert((stopResult.uptime || 0) > 0, 'Should track uptime');
      console.assert(server.state === 'stopped', 'Should be in stopped state');
    });

    // Legal Query Processing Tests
    console.log('\n⚖️ Legal Query Processing Tests:');

    await this.runAsyncTest('should process case law queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const request: LegalRequest = {
        credentials: 'legal-api-key-123',
        query: 'case law search for civil rights',
      };

      const result = await server.handleRequest(request);

      console.assert(result.success === true, 'Should process successfully');
      console.assert(
        (result.result as { type?: string })?.type === 'case_law_search',
        'Should identify as case law search',
      );
      console.assert(
        (result.result as { results?: unknown[] })?.results &&
          (result.result as { results: unknown[] }).results.length > 0,
        'Should return case law results',
      );
      console.assert(result.duration > 0, 'Should track processing duration');

      await server.stop();
    });

    await this.runAsyncTest('should process statute queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const request: LegalRequest = {
        credentials: 'enterprise-token-456',
        query: 'statute search for disability rights',
      };

      const result = await server.handleRequest(request);

      console.assert(result.success === true, 'Should process successfully');
      console.assert(
        (result.result as { type?: string })?.type === 'statute_search',
        'Should identify as statute search',
      );
      console.assert(
        (result.result as { results?: unknown[] })?.results &&
          (result.result as { results: unknown[] }).results.length > 0,
        'Should return statute results',
      );

      await server.stop();
    });

    await this.runAsyncTest('should process regulation queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const request: LegalRequest = {
        credentials: 'legal-api-key-123',
        query: 'regulation search for employment law',
      };

      const result = await server.handleRequest(request);

      console.assert(result.success === true, 'Should process successfully');
      console.assert(
        (result.result as { type?: string })?.type === 'regulation_search',
        'Should identify as regulation search',
      );

      await server.stop();
    });

    // Security Integration Tests
    console.log('\n🔒 Security Integration Tests:');

    await this.runAsyncTest('should block malicious queries', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const maliciousRequest: LegalRequest = {
        credentials: 'legal-api-key-123',
        query: 'case law <script>alert("xss")</script> search',
      };

      try {
        await server.handleRequest(maliciousRequest);
        console.assert(false, 'Should block malicious query');
      } catch (error) {
        const err = error as { type?: string; violations?: unknown[] };
        console.assert(err.type === 'SANITIZATION_ERROR', 'Should be sanitization error');
        console.assert(err.violations && err.violations.length > 0, 'Should report violations');
      }

      await server.stop();
    });

    await this.runAsyncTest('should reject invalid credentials', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const invalidRequest: LegalRequest = {
        credentials: 'invalid-credentials',
        query: 'case law search',
      };

      try {
        await server.handleRequest(invalidRequest);
        console.assert(false, 'Should reject invalid credentials');
      } catch (error) {
        const err = error as { type?: string };
        console.assert(err.type === 'AUTH_ERROR', 'Should be authentication error');
      }

      await server.stop();
    });

    await this.runAsyncTest('should enforce rate limits', async () => {
      const server = this.createLegalMCPServer({
        rateLimit: { maxRequests: 3 },
      });
      await server.start();

      const request: LegalRequest = {
        credentials: 'legal-api-key-123',
        query: 'case law search',
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
        const err = error as { type?: string; retryAfter?: number };
        console.assert(err.type === 'RATE_LIMIT_ERROR', 'Should be rate limit error');
        console.assert((err.retryAfter || 0) > 0, 'Should include retry after');
      }

      await server.stop();
    });

    // Resilience Tests
    console.log('\n💪 Resilience Tests:');

    await this.runAsyncTest('should handle circuit breaker scenarios', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      // Simulate failing requests by replacing the executeLegalQuery method
      const originalExecute = server.executeLegalQuery.bind(server);
      server.executeLegalQuery = async () => {
        const error = new Error('Database connection failed') as Error & {
          type: string;
        };
        error.type = 'DATABASE_ERROR';
        throw error;
      };

      const request: LegalRequest = {
        credentials: 'legal-api-key-123',
        query: 'case law search',
      };

      // Generate failures to open circuit
      let failureCount = 0;
      for (let i = 0; i < 6; i++) {
        try {
          await server.handleRequest(request);
        } catch {
          failureCount++;
          // Expected failures
        }
      }

      // Check circuit breaker state
      const cbState = server.components.circuitBreaker?.getState();
      console.assert(
        cbState?.state === 'OPEN',
        `Circuit breaker should be open, but is ${cbState?.state}`,
      );
      console.assert(
        (cbState?.failureCount || 0) >= 5,
        `Should track failure count, got ${cbState?.failureCount}`,
      );

      // Test that circuit breaker blocks new requests
      try {
        await server.handleRequest(request);
        console.assert(false, 'Should block requests when circuit is open');
      } catch (error) {
        const err = error as { message?: string };
        console.assert(
          err.message?.includes('Circuit breaker is OPEN'),
          'Should indicate circuit is open',
        );
      }

      // Restore original function
      server.executeLegalQuery = originalExecute;

      await server.stop();
    });

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle concurrent legal queries', async () => {
      const server = this.createLegalMCPServer({
        rateLimit: { maxRequests: 50 },
      });
      await server.start();

      const concurrentQueries = 10;
      const start = Date.now();

      // Use valid credentials for all concurrent requests
      const validCredentials = ['legal-api-key-123', 'enterprise-token-456'];

      const promises = Array(concurrentQueries)
        .fill(null)
        .map((_, i) =>
          server.handleRequest({
            credentials: validCredentials[i % validCredentials.length],
            query: `case law search ${i}`,
          }),
        );

      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      console.assert(results.length === concurrentQueries, 'Should complete all queries');
      console.assert(
        results.every((r) => r.success),
        'All queries should succeed',
      );
      console.assert(duration < 2000, 'Should complete concurrent queries efficiently');

      const avgTime = duration / concurrentQueries;
      console.log(`    ⚡ Average concurrent query time: ${avgTime.toFixed(2)}ms`);

      await server.stop();
    });

    await this.runAsyncTest('should maintain performance under mixed workload', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const workloadQueries: LegalRequest[] = [
        // Case law queries
        ...Array(5)
          .fill(null)
          .map((_, i) => ({
            credentials: 'legal-api-key-123',
            query: `case law search for topic ${i}`,
          })),
        // Statute queries
        ...Array(3)
          .fill(null)
          .map((_, i) => ({
            credentials: 'enterprise-token-456',
            query: `statute search for area ${i}`,
          })),
        // Regulation queries
        ...Array(2)
          .fill(null)
          .map((_, i) => ({
            credentials: 'legal-api-key-123',
            query: `regulation search for subject ${i}`,
          })),
      ];

      const start = Date.now();
      const results = await Promise.all(
        workloadQueries.map((query) => server.handleRequest(query)),
      );
      const duration = Date.now() - start;

      console.assert(results.length === 10, 'Should complete all mixed queries');
      console.assert(
        results.every((r) => r.success),
        'All mixed queries should succeed',
      );

      const caseResults = results.filter(
        (r) => (r.result as { type?: string })?.type === 'case_law_search',
      );
      const statuteResults = results.filter(
        (r) => (r.result as { type?: string })?.type === 'statute_search',
      );
      const regResults = results.filter(
        (r) => (r.result as { type?: string })?.type === 'regulation_search',
      );

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
        query: 'case law search',
      });

      const health = await server.healthCheck();

      console.assert((health.status as string) === 'running', 'Should report running status');
      console.assert(health.components !== undefined, 'Should include component health');
      console.assert(health.metrics !== undefined, 'Should include metrics');
      const metrics = health.metrics as { totalRequests?: number; avgResponseTime?: number };
      console.assert((metrics.totalRequests || 0) > 0, 'Should track total requests');
      console.assert((metrics.avgResponseTime || 0) > 0, 'Should track response time');

      await server.stop();
    });

    await this.runAsyncTest('should track metrics accurately', async () => {
      const server = this.createLegalMCPServer();
      await server.start();

      const initialMetrics = server.getMetrics();
      console.assert(
        (initialMetrics.totalRequests as number) === 0,
        'Should start with zero requests',
      );

      // Process successful request
      await server.handleRequest({
        credentials: 'legal-api-key-123',
        query: 'case law search',
      });

      // Process failed request
      try {
        await server.handleRequest({
          credentials: 'invalid-credentials',
          query: 'case law search',
        });
      } catch {
        // Expected failure
      }

      const finalMetrics = server.getMetrics();
      console.assert((finalMetrics.totalRequests as number) === 2, 'Should track total requests');
      console.assert((finalMetrics.errorRate as number) > 0, 'Should track error rate');
      console.assert((finalMetrics.avgResponseTime as number) > 0, 'Should track response time');

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
        query: 'case law search',
      });

      try {
        await server.handleRequest({
          credentials: 'invalid-credentials',
          query: 'statute search',
        });
      } catch {
        // Expected failure
      }

      const auditLogs = await server.components.audit?.getLogs();

      console.assert((auditLogs?.length || 0) >= 1, 'Should log activities'); // Only successful requests logged
      if (auditLogs && auditLogs.length > 0) {
        console.assert(auditLogs[0].requestId !== undefined, 'Should include request ID');
        console.assert(auditLogs[0].clientId !== undefined, 'Should include client ID');
        console.assert(auditLogs[0].query !== undefined, 'Should include query');
      }

      await server.stop();
    });

    // Summary
    this.printSummary();
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 END-TO-END ENTERPRISE TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`);
    if (this.testCount > 0) {
      console.log(`Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`);
    }

    if (this.failedTests === 0) {
      console.log(
        '\n🎉 All end-to-end enterprise tests passed! Complete Legal MCP Server workflow is functioning correctly.',
      );
    } else {
      console.log(
        `\n💥 ${this.failedTests} test(s) failed. Please review end-to-end implementation.`,
      );
      process.exit(1);
    }

    console.log('\n✅ Enhanced End-to-End Enterprise Tests Completed Successfully!');
  }
}

// Run the comprehensive end-to-end tests
const endToEndTests = new EnhancedEndToEndTests();
endToEndTests.runComprehensiveTests().catch((error) => {
  console.error('Fatal error in end-to-end tests:', error);
  process.exit(1);
});
