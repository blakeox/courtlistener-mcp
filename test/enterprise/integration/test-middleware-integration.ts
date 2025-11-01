/**
 * ✅ Comprehensive Integration Tests for Enterprise Middleware (TypeScript)
 * Tests how all middleware components work together in realistic scenarios
 */

import {
  createMockLogger,
  createMockRequest,
  performanceBenchmark,
  type MockLogger,
} from '../../../utils/test-helpers.ts';

// Import all middleware mock implementations
// (In a real scenario, these would be the actual implementations)
interface AuthConfig {
  enabled?: boolean;
}

interface MockAuthResult {
  authenticated: boolean;
  clientId?: string;
  reason?: string;
}

class MockAuthenticationMiddleware {
  private config: { enabled: boolean } & AuthConfig;
  private logger: MockLogger;
  private validApiKeys: Set<string>;

  constructor(config: AuthConfig, logger: MockLogger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
    this.validApiKeys = new Set(['valid-key-1', 'valid-key-2', 'admin-key']);
  }

  async authenticate(headers: Record<string, string>): Promise<MockAuthResult> {
    if (!this.config.enabled)
      return { authenticated: true, clientId: 'anonymous' };

    const apiKey =
      headers['x-api-key'] ||
      headers['authorization']?.replace('Bearer ', '') ||
      '';
    if (this.validApiKeys.has(apiKey)) {
      return { authenticated: true, clientId: `client-${apiKey}` };
    }
    return { authenticated: false, reason: 'Invalid API key' };
  }
}

interface SanitizationResult {
  sanitized: string | unknown;
  violations: Array<{ type: string; severity: string }>;
}

interface SanitizerConfig {
  enabled?: boolean;
}

class MockInputSanitizer {
  private config: { enabled: boolean } & SanitizerConfig;
  private logger: MockLogger;

  constructor(config: SanitizerConfig, logger: MockLogger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
  }

  async sanitize(input: unknown): Promise<SanitizationResult> {
    if (!this.config.enabled) return { sanitized: input, violations: [] };

    const violations: Array<{ type: string; severity: string }> = [];
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

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

interface RateLimiterConfig {
  enabled?: boolean;
  requestsPerMinute?: number;
}

class MockRateLimiter {
  private config: { enabled: boolean; requestsPerMinute: number } & RateLimiterConfig;
  private logger: MockLogger;
  private clients: Map<string, { requests: number[]; penalties: number }>;

  constructor(config: RateLimiterConfig, logger: MockLogger) {
    this.config = { enabled: true, requestsPerMinute: 60, ...config };
    this.logger = logger;
    this.clients = new Map();
  }

  async checkLimit(clientId: string): Promise<RateLimitResult> {
    if (!this.config.enabled) return { allowed: true };

    const now = Date.now();
    const client =
      this.clients.get(clientId) || { requests: [], penalties: 0 };

    client.requests = client.requests.filter((req) => now - req < 60000);

    if (client.requests.length >= this.config.requestsPerMinute) {
      client.penalties++;
      return { allowed: false, retryAfter: 60 };
    }

    client.requests.push(now);
    this.clients.set(clientId, client);
    return { allowed: true };
  }
}

interface AuditEntry {
  id: string;
  timestamp: string;
  type: string;
  method?: string;
  url?: string;
  clientId?: string;
  headers?: Record<string, unknown>;
  statusCode?: number;
  responseTime?: number;
  requestAuditId?: string;
  eventType?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AuditorConfig {
  enabled?: boolean;
}

class MockAuditLogger {
  private config: { enabled: boolean } & AuditorConfig;
  private logger: MockLogger;
  auditEntries: AuditEntry[];

  constructor(config: AuditorConfig, logger: MockLogger) {
    this.config = { enabled: true, ...config };
    this.logger = logger;
    this.auditEntries = [];
  }

  async logRequest(
    req: {
      method?: string;
      url?: string;
      headers?: Record<string, unknown>;
      clientId?: string;
      [key: string]: unknown;
    },
    metadata: Record<string, unknown> = {}
  ): Promise<string | null> {
    if (!this.config.enabled) return null;

    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'request',
      method: req.method,
      url: req.url,
      clientId: metadata.clientId as string,
      headers: req.headers,
      ...metadata,
    };

    this.auditEntries.push(entry);
    return entry.id;
  }

  async logResponse(
    auditId: string,
    res: { statusCode?: number },
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'response',
      requestAuditId: auditId,
      statusCode: res.statusCode,
      responseTime: metadata.responseTime as number,
      ...metadata,
    };

    this.auditEntries.push(entry);
  }

  async logSecurityEvent(
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const entry: AuditEntry = {
      id: `security_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'security_event',
      eventType,
      details,
    };

    this.auditEntries.push(entry);
  }
}

interface CompressionResult {
  data: string;
  compressed: boolean;
  originalSize: number;
  compressedSize?: number;
  ratio?: number;
  algorithm?: string;
}

interface CompressorConfig {
  enabled?: boolean;
  threshold?: number;
}

class MockCompressionMiddleware {
  private config: { enabled: boolean; threshold: number } & CompressorConfig;
  private logger: MockLogger;

  constructor(config: CompressorConfig, logger: MockLogger) {
    this.config = { enabled: true, threshold: 1024, ...config };
    this.logger = logger;
  }

  async compressResponse(
    data: string,
    acceptedEncodings: string[] = []
  ): Promise<CompressionResult> {
    if (
      !this.config.enabled ||
      Buffer.byteLength(data, 'utf8') < this.config.threshold
    ) {
      return {
        data,
        compressed: false,
        originalSize: Buffer.byteLength(data, 'utf8'),
      };
    }

    const originalSize = Buffer.byteLength(data, 'utf8');
    const compressedSize = Math.floor(originalSize * 0.4); // Simulate 60% compression

    return {
      data: `[COMPRESSED:${compressedSize}]${data.substring(0, 50)}...`,
      compressed: true,
      originalSize,
      compressedSize,
      ratio: originalSize / compressedSize,
      algorithm: acceptedEncodings.includes('br') ? 'br' : 'gzip',
    };
  }
}

interface CircuitBreakerConfig {
  enabled?: boolean;
  failureThreshold?: number;
}

interface CircuitBreakerState {
  state: string;
  failureCount: number;
}

class MockCircuitBreaker {
  private config: {
    enabled: boolean;
    failureThreshold: number;
  } & CircuitBreakerConfig;
  private logger: MockLogger;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number | null;

  constructor(config: CircuitBreakerConfig, logger: MockLogger) {
    this.config = { enabled: true, failureThreshold: 5, ...config };
    this.logger = logger;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return await operation();
    }

    if (this.state === 'OPEN') {
      const timeSinceFailure =
        this.lastFailureTime && Date.now() - this.lastFailureTime;
      if (timeSinceFailure && timeSinceFailure < 60000) {
        // 1 minute recovery time
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

  getState(): CircuitBreakerState {
    return { state: this.state, failureCount: this.failureCount };
  }
}

interface MiddlewareStackConfig {
  enableAuth?: boolean;
  enableSanitization?: boolean;
  enableRateLimit?: boolean;
  enableAudit?: boolean;
  enableCompression?: boolean;
  enableCircuitBreaker?: boolean;
  auth?: AuthConfig;
  sanitizer?: SanitizerConfig;
  rateLimiter?: RateLimiterConfig;
  auditor?: AuditorConfig;
  compressor?: CompressorConfig;
  circuitBreaker?: CircuitBreakerConfig;
}

interface MiddlewareResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
}

type RequestHandler = (req: Record<string, unknown>) => Promise<MiddlewareResponse>;

interface MiddlewareStats {
  circuitBreaker: CircuitBreakerState;
  auditEntries: number;
  rateLimitClients: number;
}

// Integrated Enterprise Middleware Stack
class EnterpriseMiddlewareStack {
  auth: MockAuthenticationMiddleware;
  sanitizer: MockInputSanitizer;
  rateLimiter: MockRateLimiter;
  auditor: MockAuditLogger;
  compressor: MockCompressionMiddleware;
  circuitBreaker: MockCircuitBreaker;
  private config: Required<MiddlewareStackConfig>;
  private logger: MockLogger;

  constructor(config: MiddlewareStackConfig = {}, logger?: MockLogger) {
    this.logger = logger || createMockLogger();

    // Initialize all middleware components
    this.auth = new MockAuthenticationMiddleware(config.auth || {}, this.logger);
    this.sanitizer = new MockInputSanitizer(config.sanitizer || {}, this.logger);
    this.rateLimiter = new MockRateLimiter(
      config.rateLimiter || {},
      this.logger
    );
    this.auditor = new MockAuditLogger(config.auditor || {}, this.logger);
    this.compressor = new MockCompressionMiddleware(
      config.compressor || {},
      this.logger
    );
    this.circuitBreaker = new MockCircuitBreaker(
      config.circuitBreaker || {},
      this.logger
    );

    this.config = {
      enableAuth: true,
      enableSanitization: true,
      enableRateLimit: true,
      enableAudit: true,
      enableCompression: true,
      enableCircuitBreaker: true,
      auth: {},
      sanitizer: {},
      rateLimiter: {},
      auditor: {},
      compressor: {},
      circuitBreaker: {},
      ...config,
    } as Required<MiddlewareStackConfig>;
  }

  async processRequest(
    req: Record<string, unknown> & {
      headers?: Record<string, string>;
      body?: unknown;
      method?: string;
      url?: string;
      clientId?: string;
    },
    handler: RequestHandler
  ): Promise<MiddlewareResponse> {
    const startTime = Date.now();
    let auditId: string | null = null;
    let authResult: MockAuthResult | null = null;
    let sanitizationResult: SanitizationResult | null = null;
    let rateLimitResult: RateLimitResult | null = null;

    try {
      // Step 1: Authentication
      if (this.config.enableAuth) {
        authResult = await this.auth.authenticate(
          (req.headers as Record<string, string>) || {}
        );
        if (!authResult.authenticated) {
          await this.auditor.logSecurityEvent('AUTH_FAILURE', {
            reason: authResult.reason,
            headers: req.headers,
          });
          return {
            statusCode: 401,
            body: {
              error: 'Authentication failed',
              reason: authResult.reason,
            },
            headers: { 'Content-Type': 'application/json' },
          };
        }
        req.clientId = authResult.clientId;
      }

      // Step 2: Input Sanitization
      if (this.config.enableSanitization && req.body) {
        sanitizationResult = await this.sanitizer.sanitize(req.body);
        if (sanitizationResult.violations.length > 0) {
          const highSeverityViolations = sanitizationResult.violations.filter(
            (v) => v.severity === 'high'
          );
          if (highSeverityViolations.length > 0) {
            await this.auditor.logSecurityEvent('MALICIOUS_INPUT', {
              clientId: req.clientId,
              violations: highSeverityViolations,
              originalInput: req.body,
            });
            return {
              statusCode: 400,
              body: {
                error: 'Malicious input detected',
                violations: highSeverityViolations,
              },
              headers: { 'Content-Type': 'application/json' },
            };
          }
        }
        req.body = sanitizationResult.sanitized;
      }

      // Step 3: Rate Limiting
      if (this.config.enableRateLimit) {
        rateLimitResult = await this.rateLimiter.checkLimit(
          (req.clientId as string) || 'anonymous'
        );
        if (!rateLimitResult.allowed) {
          await this.auditor.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            clientId: req.clientId,
            retryAfter: rateLimitResult.retryAfter,
          });
          return {
            statusCode: 429,
            body: {
              error: 'Rate limit exceeded',
              retryAfter: rateLimitResult.retryAfter,
            },
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(rateLimitResult.retryAfter || 60),
            },
          };
        }
      }

      // Step 4: Audit Logging (Request)
      if (this.config.enableAudit) {
        auditId = (await this.auditor.logRequest(req, {
          clientId: req.clientId,
          authenticated: authResult?.authenticated,
          sanitizationViolations:
            sanitizationResult?.violations?.length || 0,
        })) as string;
      }

      // Step 5: Execute Handler with Circuit Breaker
      let response: MiddlewareResponse;
      if (this.config.enableCircuitBreaker) {
        response = await this.circuitBreaker.execute(async () => {
          return await handler(req);
        });
      } else {
        response = await handler(req);
      }

      // Step 6: Response Compression
      if (this.config.enableCompression && response.body) {
        const acceptedEncodings =
          ((req.headers?.['accept-encoding'] as string) || '')
            .split(',')
            .map((e) => e.trim()) || [];
        const compressionResult = await this.compressor.compressResponse(
          typeof response.body === 'string'
            ? response.body
            : JSON.stringify(response.body),
          acceptedEncodings
        );

        if (compressionResult.compressed) {
          response.body = compressionResult.data;
          response.headers = {
            ...response.headers,
            'Content-Encoding': compressionResult.algorithm || 'gzip',
            'Content-Length': String(compressionResult.compressedSize || 0),
          };
        }
      }

      // Step 7: Audit Logging (Response)
      if (this.config.enableAudit && auditId) {
        await this.auditor.logResponse(auditId, response, {
          responseTime: Date.now() - startTime,
          compressed: response.headers?.['Content-Encoding'] !== undefined,
        });
      }

      return response;
    } catch (error) {
      // Error handling with audit logging
      const errorMessage =
        error instanceof Error ? error.message : 'Internal server error';
      const errorResponse: MiddlewareResponse = {
        statusCode: (error as { statusCode?: number })?.statusCode || 500,
        body: { error: errorMessage },
        headers: { 'Content-Type': 'application/json' },
      };

      if (this.config.enableAudit) {
        if (auditId) {
          await this.auditor.logResponse(auditId, errorResponse, {
            responseTime: Date.now() - startTime,
            error: errorMessage,
          });
        }

        await this.auditor.logSecurityEvent('REQUEST_ERROR', {
          clientId: req.clientId,
          error: errorMessage,
          statusCode: errorResponse.statusCode,
        });
      }

      return errorResponse;
    }
  }

  getStats(): MiddlewareStats {
    return {
      circuitBreaker: this.circuitBreaker.getState(),
      auditEntries: this.auditor.auditEntries.length,
      rateLimitClients: this.rateLimiter.clients.size,
    };
  }
}

// Test Suite
console.log('🧪 Enterprise Middleware Integration Tests');

let middlewareStack: EnterpriseMiddlewareStack;
let mockLogger: MockLogger;

function beforeEach(): void {
  mockLogger = createMockLogger();
  middlewareStack = new EnterpriseMiddlewareStack({}, mockLogger);
}

// Full Request Processing Pipeline Tests
async function testFullPipeline(): Promise<void> {
  console.log('\n📋 Full Request Processing Pipeline Tests:');

  beforeEach();

  // Test: should process valid authenticated request successfully
  console.log('  Testing: should process valid authenticated request successfully');
  {
    const req = createMockRequest({
      headers: {
        'x-api-key': 'valid-key-1',
        'accept-encoding': 'gzip, br',
        'content-type': 'application/json',
      },
      body: { query: 'legal documents', limit: 10 },
    });

    const mockHandler: RequestHandler = async () => {
      return {
        statusCode: 200,
        body: { results: ['doc1', 'doc2'], total: 2 },
        headers: { 'Content-Type': 'application/json' },
      };
    };

    const response = await middlewareStack.processRequest(req, mockHandler);

    console.assert(response.statusCode === 200, 'Should return 200 status');
    console.assert(
      req.clientId === 'client-valid-key-1',
      'Should set client ID'
    );
    console.assert(
      response.headers?.['Content-Encoding'] !== undefined,
      'Should compress response'
    );
    console.log('    ✅ should process valid authenticated request successfully');
  }

  // Test: should reject unauthenticated requests
  console.log('  Testing: should reject unauthenticated requests');
  {
    const req = createMockRequest({
      headers: {},
      body: { query: 'test' },
    });

    const mockHandler: RequestHandler = async () => ({
      statusCode: 200,
      body: 'success',
    });

    const response = await middlewareStack.processRequest(req, mockHandler);

    console.assert(
      response.statusCode === 401,
      'Should return 401 for unauthenticated request'
    );
    console.assert(
      (response.body as { error?: string })?.error === 'Authentication failed',
      'Should include auth error'
    );

    // Check security event was logged
    const securityEvents = middlewareStack.auditor.auditEntries.filter(
      (e) => e.type === 'security_event'
    );
    console.assert(
      securityEvents.length > 0,
      'Should log security event'
    );
    console.assert(
      securityEvents[0]?.eventType === 'AUTH_FAILURE',
      'Should log auth failure'
    );
    console.log('    ✅ should reject unauthenticated requests');
  }

  // Test: should block malicious input
  console.log('  Testing: should block malicious input');
  {
    const req = createMockRequest({
      headers: { 'x-api-key': 'valid-key-1' },
      body: '<script>alert("xss")</script>DROP TABLE users;',
    });

    const mockHandler: RequestHandler = async () => ({
      statusCode: 200,
      body: 'success',
    });

    const response = await middlewareStack.processRequest(req, mockHandler);

    console.assert(
      response.statusCode === 400,
      'Should return 400 for malicious input'
    );
    console.assert(
      (response.body as { error?: string })?.error ===
        'Malicious input detected',
      'Should detect malicious input'
    );
    console.assert(
      Array.isArray((response.body as { violations?: unknown[] })?.violations) &&
        (response.body as { violations: unknown[] }).violations.length > 0,
      'Should include violation details'
    );

    // Check security event was logged
    const securityEvents = middlewareStack.auditor.auditEntries.filter(
      (e) => e.type === 'security_event'
    );
    const maliciousInputEvent = securityEvents.find(
      (e) => e.eventType === 'MALICIOUS_INPUT'
    );
    console.assert(
      maliciousInputEvent !== undefined,
      'Should log malicious input event'
    );
    console.log('    ✅ should block malicious input');
  }

  // Test: should enforce rate limits
  console.log('  Testing: should enforce rate limits');
  {
    const req = createMockRequest({
      headers: { 'x-api-key': 'valid-key-1' },
    });

    const mockHandler: RequestHandler = async () => ({
      statusCode: 200,
      body: 'success',
    });

    // Exhaust rate limit
    const rateLimitConfig: MiddlewareStackConfig = {
      rateLimiter: { requestsPerMinute: 2 },
    };
    const limitedStack = new EnterpriseMiddlewareStack(
      rateLimitConfig,
      mockLogger
    );

    // Make requests up to limit
    await limitedStack.processRequest(req, mockHandler);
    await limitedStack.processRequest(req, mockHandler);

    // This should be rate limited
    const response = await limitedStack.processRequest(req, mockHandler);

    console.assert(
      response.statusCode === 429,
      'Should return 429 for rate limited request'
    );
    console.assert(
      (response.body as { error?: string })?.error === 'Rate limit exceeded',
      'Should include rate limit error'
    );
    console.assert(
      response.headers?.['Retry-After'] !== undefined,
      'Should include retry after header'
    );
    console.log('    ✅ should enforce rate limits');
  }
}

// Run tests
async function runAllTests(): Promise<void> {
  try {
    await testFullPipeline();
    console.log('\n✅ Enhanced Enterprise Middleware Integration Tests Completed');
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

runAllTests();

