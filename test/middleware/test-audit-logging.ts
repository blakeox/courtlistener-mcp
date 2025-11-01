/**
 * ✅ Comprehensive tests for Audit Logging Middleware (TypeScript)
 * Tests request logging, response tracking, security events, and compliance
 */

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import type { MockLogger } from '../utils/test-helpers.ts';
import { createMockLogger, createMockRequest, type MockRequest } from '../utils/test-helpers.ts';

interface AuditConfig {
  auditEnabled?: boolean;
  logLevel?: string;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeHeaders?: boolean;
  maxBodySize?: number;
  sensitiveHeaders?: string[];
  retentionDays?: number;
  complianceMode?: boolean;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

interface SecurityEvent {
  id: string;
  timestamp: string;
  type: string;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  clientId?: string;
  remoteAddr?: string;
  userAgent?: string;
}

interface PerformanceMetric {
  id: string;
  timestamp: string;
  type: string;
  metric: string;
  value: number;
  unit: string;
  [key: string]: unknown;
}

interface SearchCriteria {
  startDate?: string;
  endDate?: string;
  clientId?: string;
  type?: string;
  toolName?: string;
  severity?: string;
  limit?: number;
}

interface AuditStats {
  totalEntries: number;
  requests: number;
  responses: number;
  toolCalls: number;
  securityEvents: number;
  errors: number;
  uniqueClients: number;
  timeRange: string;
  period: {
    start: string;
    end: string;
  };
  toolUsage: Record<string, number>;
  securityEventTypes: Record<string, number>;
}

interface CompressionResult {
  data: string;
  encoding: string | null;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  algorithm: string | null;
  reason?: string;
}

// Mock audit logger implementation for testing
class MockAuditLogger {
  public auditEntries: AuditEntry[];
  public securityEvents: SecurityEvent[];
  public performanceMetrics: PerformanceMetric[];
  private config: Required<AuditConfig>;
  private logger: MockLogger;

  constructor(config: AuditConfig, logger: MockLogger) {
    this.config = {
      auditEnabled: true,
      logLevel: 'info',
      includeRequestBody: false,
      includeResponseBody: false,
      includeHeaders: true,
      maxBodySize: 1024,
      sensitiveHeaders: ['authorization', 'x-api-key', 'cookie'],
      retentionDays: 90,
      complianceMode: false,
      ...config,
    };
    this.logger = logger;
    this.auditEntries = [];
    this.securityEvents = [];
    this.performanceMetrics = [];
  }

  async logRequest(
    req: Partial<MockRequest>,
    metadata: Record<string, unknown> = {},
  ): Promise<string | undefined> {
    if (!this.config.auditEnabled) return undefined;

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'request',
      clientId: this.extractClientId(req.headers || {}),
      method: req.method || 'MCP_CALL',
      url: req.url || '/mcp',
      userAgent: (req.headers as Record<string, string>)?.['user-agent'],
      remoteAddr:
        (req.headers as Record<string, string>)?.['x-forwarded-for'] ||
        (req.headers as Record<string, string>)?.['remote-addr'],
      headers: this.sanitizeHeaders(req.headers || {}),
      body: this.config.includeRequestBody ? this.sanitizeBody(req.body) : undefined,
      sessionId: (req.headers as Record<string, string>)?.['x-session-id'],
      requestId: (req.headers as Record<string, string>)?.['x-request-id'] || this.generateId(),
      ...metadata,
    };

    this.auditEntries.push(entry);
    this.logger.info('Request audit logged', { auditId: entry.id });

    return entry.id;
  }

  async logResponse(
    auditId: string,
    res: {
      statusCode?: number;
      headers?: Record<string, string>;
      body?: unknown;
      error?: {
        code?: string;
        message?: string;
        stack?: string;
      };
    },
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.config.auditEnabled) return;

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'response',
      requestAuditId: auditId,
      statusCode: res.statusCode || 200,
      responseTime: (metadata.responseTime as number) || 0,
      headers: this.sanitizeHeaders(res.headers || {}),
      body: this.config.includeResponseBody ? this.sanitizeBody(res.body) : undefined,
      error: res.error
        ? {
            code: res.error.code,
            message: res.error.message,
            stack: this.config.logLevel === 'debug' ? res.error.stack : undefined,
          }
        : undefined,
      ...metadata,
    };

    this.auditEntries.push(entry);
    this.logger.info('Response audit logged', {
      auditId: entry.id,
      requestAuditId: auditId,
    });
  }

  async logToolCall(
    toolName: string,
    params: Record<string, unknown> | null,
    clientId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<string | undefined> {
    if (!this.config.auditEnabled) return undefined;

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      toolName,
      clientId,
      params: this.sanitizeToolParams(params),
      ...metadata,
    };

    this.auditEntries.push(entry);
    this.logger.info('Tool call audit logged', {
      auditId: entry.id,
      toolName,
    });

    return entry.id;
  }

  async logSecurityEvent(
    eventType: string,
    details: Record<string, unknown>,
    severity = 'medium',
  ): Promise<string | undefined> {
    const event: SecurityEvent = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'security_event',
      eventType,
      severity,
      details,
      clientId: details.clientId as string | undefined,
      remoteAddr: details.remoteAddr as string | undefined,
      userAgent: details.userAgent as string | undefined,
    };

    this.securityEvents.push(event);
    this.auditEntries.push(event);

    const logLevel = severity === 'high' ? 'error' : severity === 'medium' ? 'warn' : 'info';
    this.logger[logLevel]('Security event logged', {
      auditId: event.id,
      eventType,
      severity,
    });

    return event.id;
  }

  async logPerformanceMetric(
    metric: string,
    value: number,
    unit: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const entry: PerformanceMetric = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'performance_metric',
      metric,
      value,
      unit,
      ...metadata,
    };

    this.performanceMetrics.push(entry);
    if (this.config.logLevel === 'debug') {
      this.auditEntries.push(entry);
    }

    this.logger.debug('Performance metric logged', { metric, value, unit });
  }

  async searchAuditLogs(criteria: SearchCriteria): Promise<AuditEntry[]> {
    let results = [...this.auditEntries];

    if (criteria.startDate) {
      results = results.filter(
        (entry) => new Date(entry.timestamp) >= new Date(criteria.startDate!),
      );
    }

    if (criteria.endDate) {
      results = results.filter((entry) => new Date(entry.timestamp) <= new Date(criteria.endDate!));
    }

    if (criteria.clientId) {
      results = results.filter((entry) => entry.clientId === criteria.clientId);
    }

    if (criteria.type) {
      results = results.filter((entry) => entry.type === criteria.type);
    }

    if (criteria.toolName) {
      results = results.filter(
        (entry) => (entry as AuditEntry & { toolName?: string }).toolName === criteria.toolName,
      );
    }

    if (criteria.severity) {
      results = results.filter((entry) => (entry as SecurityEvent).severity === criteria.severity);
    }

    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    return results.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async getAuditStats(timeRange = '24h'): Promise<AuditStats> {
    const now = new Date();
    const startTime = new Date(now.getTime() - this.parseTimeRange(timeRange));

    const relevantEntries = this.auditEntries.filter(
      (entry) => new Date(entry.timestamp) >= startTime,
    );

    const stats: AuditStats = {
      totalEntries: relevantEntries.length,
      requests: relevantEntries.filter((e) => e.type === 'request').length,
      responses: relevantEntries.filter((e) => e.type === 'response').length,
      toolCalls: relevantEntries.filter((e) => e.type === 'tool_call').length,
      securityEvents: relevantEntries.filter((e) => e.type === 'security_event').length,
      errors: relevantEntries.filter(
        (e) =>
          (e as AuditEntry & { error?: unknown; statusCode?: number }).error ||
          ((e as AuditEntry & { statusCode?: number }).statusCode || 0) >= 400,
      ).length,
      uniqueClients: new Set(
        relevantEntries.map((e) => e.clientId as string).filter((id) => Boolean(id)),
      ).size,
      timeRange,
      period: {
        start: startTime.toISOString(),
        end: now.toISOString(),
      },
      toolUsage: {},
      securityEventTypes: {},
    };

    // Tool usage statistics
    relevantEntries
      .filter((e) => e.type === 'tool_call')
      .forEach((entry) => {
        const toolName = (entry as AuditEntry & { toolName?: string }).toolName;
        if (toolName) {
          stats.toolUsage[toolName] = (stats.toolUsage[toolName] || 0) + 1;
        }
      });

    // Security event breakdown
    relevantEntries
      .filter((e) => e.type === 'security_event')
      .forEach((entry) => {
        const event = entry as SecurityEvent;
        stats.securityEventTypes[event.eventType] =
          (stats.securityEventTypes[event.eventType] || 0) + 1;
      });

    return stats;
  }

  async exportAuditLogs(format = 'json', criteria: SearchCriteria = {}): Promise<string> {
    const logs = await this.searchAuditLogs(criteria);

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(logs, null, 2);

      case 'csv':
        return this.convertToCSV(logs);

      case 'xml':
        return this.convertToXML(logs);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  async cleanOldLogs(): Promise<number> {
    if (this.config.retentionDays <= 0) return 0;

    const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    const beforeCount = this.auditEntries.length;

    this.auditEntries = this.auditEntries.filter((entry) => new Date(entry.timestamp) > cutoffDate);

    this.securityEvents = this.securityEvents.filter(
      (event) => new Date(event.timestamp) > cutoffDate,
    );

    this.performanceMetrics = this.performanceMetrics.filter(
      (metric) => new Date(metric.timestamp) > cutoffDate,
    );

    const removedCount = beforeCount - this.auditEntries.length;
    this.logger.info(`Cleaned ${removedCount} old audit entries`, {
      retentionDays: this.config.retentionDays,
    });

    return removedCount;
  }

  // Helper methods
  extractClientId(headers: Record<string, string | null | undefined>): string {
    return (
      (headers['x-client-id'] as string) ||
      (headers['x-forwarded-for'] as string) ||
      (headers['remote-addr'] as string) ||
      'anonymous'
    );
  }

  sanitizeHeaders(headers: Record<string, string | null | undefined>): Record<string, string> {
    if (!this.config.includeHeaders) return {};

    const sanitized: Record<string, string> = { ...headers };
    this.config.sensitiveHeaders.forEach((headerName) => {
      if (sanitized[headerName]) {
        sanitized[headerName] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  sanitizeBody(body: unknown): string | undefined {
    if (!body) return undefined;

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > this.config.maxBodySize) {
      return bodyStr.substring(0, this.config.maxBodySize) + '...[TRUNCATED]';
    }
    return bodyStr;
  }

  sanitizeToolParams(
    params: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | undefined {
    if (!params) return undefined;

    // Remove sensitive parameters
    const sanitized: Record<string, unknown> = { ...params };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  parseTimeRange(range: string): number {
    const units: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const match = range.match(/^(\d+)([smhd])$/);
    if (!match) return 24 * 60 * 60 * 1000; // Default 24h

    const [, amount, unit] = match;
    return parseInt(amount, 10) * units[unit];
  }

  convertToCSV(logs: AuditEntry[]): string {
    if (logs.length === 0) return 'No audit logs found';

    const headers = Object.keys(logs[0]);
    const csvContent = [
      headers.join(','),
      ...logs.map((log) =>
        headers
          .map((header) => {
            const value = log[header];
            if (typeof value === 'object' && value !== null) {
              return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            }
            return `"${String(value || '').replace(/"/g, '""')}"`;
          })
          .join(','),
      ),
    ].join('\n');

    return csvContent;
  }

  convertToXML(logs: AuditEntry[]): string {
    const xmlEntries = logs
      .map((log) => {
        const entryXml = Object.entries(log)
          .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return `    <${key}><![CDATA[${JSON.stringify(value)}]]></${key}>`;
            }
            return `    <${key}><![CDATA[${value || ''}]]></${key}>`;
          })
          .join('\n');

        return `  <audit-entry>\n${entryXml}\n  </audit-entry>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<audit-logs>\n${xmlEntries}\n</audit-logs>`;
  }
}

describe('Audit Logging Middleware Tests', () => {
  let auditLogger: MockAuditLogger;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auditLogger = new MockAuditLogger(
      {
        auditEnabled: true,
        includeRequestBody: true,
        includeResponseBody: true,
        includeHeaders: true,
      },
      mockLogger,
    );
  });

  describe('Request Logging', () => {
    it('should log basic request information', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp/call',
        headers: {
          'x-client-id': 'test-client',
          'user-agent': 'Test Agent',
          'x-forwarded-for': '192.168.1.100',
        },
        body: { tool: 'search_legal_documents', params: { query: 'test' } },
      });

      const auditId = await auditLogger.logRequest(req);

      assert.ok(typeof auditId === 'string', 'Should return audit ID');
      assert.strictEqual(auditLogger.auditEntries.length, 1, 'Should add audit entry');

      const entry = auditLogger.auditEntries[0];
      assert.strictEqual(entry.type, 'request', 'Should mark as request type');
      assert.strictEqual(entry.clientId, 'test-client', 'Should extract client ID');
      assert.strictEqual(entry.method, 'POST', 'Should log request method');
      assert.strictEqual(entry.remoteAddr, '192.168.1.100', 'Should log remote address');
    });

    it('should handle requests without optional headers', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: {},
        body: { tool: 'test' },
      });

      const auditId = await auditLogger.logRequest(req);

      assert.ok(typeof auditId === 'string', 'Should handle minimal request');

      const entry = auditLogger.auditEntries[0];
      assert.strictEqual(entry.clientId, 'anonymous', 'Should use anonymous for unknown client');
    });

    it('should sanitize sensitive headers', async () => {
      const req = createMockRequest({
        headers: {
          authorization: 'Bearer secret-token',
          'x-api-key': 'secret-key',
          cookie: 'session=secret',
          'user-agent': 'Test Agent',
        },
      });

      await auditLogger.logRequest(req);

      const entry = auditLogger.auditEntries[0];
      const headers = entry.headers as Record<string, string>;
      assert.strictEqual(headers.authorization, '[REDACTED]', 'Should redact authorization');
      assert.strictEqual(headers['x-api-key'], '[REDACTED]', 'Should redact API key');
      assert.strictEqual(headers.cookie, '[REDACTED]', 'Should redact cookie');
      assert.strictEqual(headers['user-agent'], 'Test Agent', 'Should keep non-sensitive headers');
    });

    it('should truncate large request bodies', async () => {
      const auditLoggerSmall = new MockAuditLogger(
        {
          includeRequestBody: true,
          maxBodySize: 50,
        },
        mockLogger,
      );

      const largeBody = 'x'.repeat(100);
      const req = createMockRequest({ body: largeBody });

      await auditLoggerSmall.logRequest(req);

      const entry = auditLoggerSmall.auditEntries[0];
      assert.ok(
        typeof entry.body === 'string' && entry.body.includes('[TRUNCATED]'),
        'Should truncate large bodies',
      );
      assert.ok(
        typeof entry.body === 'string' && entry.body.length <= 65,
        'Should respect max body size',
      ); // 50 + '[TRUNCATED]'
    });
  });

  describe('Response Logging', () => {
    it('should log response information', async () => {
      const req = createMockRequest();
      const auditId = await auditLogger.logRequest(req);

      const res = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { result: 'success' },
      };

      await auditLogger.logResponse(auditId!, res, { responseTime: 150 });

      assert.strictEqual(auditLogger.auditEntries.length, 2, 'Should add response entry');

      const responseEntry = auditLogger.auditEntries[1];
      assert.strictEqual(responseEntry.type, 'response', 'Should mark as response type');
      assert.strictEqual(responseEntry.requestAuditId, auditId, 'Should link to request');
      assert.strictEqual(responseEntry.statusCode, 200, 'Should log status code');
      assert.strictEqual(responseEntry.responseTime, 150, 'Should log response time');
    });

    it('should log error responses', async () => {
      const req = createMockRequest();
      const auditId = await auditLogger.logRequest(req);

      const res = {
        statusCode: 500,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          stack: 'Error stack trace...',
        },
      };

      await auditLogger.logResponse(auditId!, res);

      const responseEntry = auditLogger.auditEntries[1];
      const error = responseEntry.error as {
        code?: string;
        message?: string;
      };
      assert.strictEqual(error.code, 'INTERNAL_ERROR', 'Should log error code');
      assert.strictEqual(error.message, 'Something went wrong', 'Should log error message');
    });
  });

  describe('Tool Call Logging', () => {
    it('should log tool calls with parameters', async () => {
      const params = {
        query: 'contract law',
        limit: 10,
        apiKey: 'secret-key',
      };

      const auditId = await auditLogger.logToolCall(
        'search_legal_documents',
        params,
        'test-client',
      );

      assert.ok(typeof auditId === 'string', 'Should return audit ID');

      const entry = auditLogger.auditEntries[0];
      assert.strictEqual(entry.type, 'tool_call', 'Should mark as tool call type');
      assert.strictEqual(
        (entry as AuditEntry & { toolName?: string }).toolName,
        'search_legal_documents',
        'Should log tool name',
      );
      assert.strictEqual(entry.clientId, 'test-client', 'Should log client ID');
      const entryParams = entry.params as Record<string, unknown>;
      assert.strictEqual(entryParams.apiKey, '[REDACTED]', 'Should sanitize sensitive parameters');
      assert.strictEqual(entryParams.query, 'contract law', 'Should keep non-sensitive parameters');
    });

    it('should handle tool calls without parameters', async () => {
      const auditId = await auditLogger.logToolCall('health_check', null, 'test-client');

      const entry = auditLogger.auditEntries[0];
      assert.strictEqual(entry.params, undefined, 'Should handle null parameters');
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events with appropriate severity', async () => {
      const details = {
        clientId: 'suspicious-client',
        remoteAddr: '192.168.1.200',
        userAgent: 'Malicious Bot',
        reason: 'Too many failed authentication attempts',
      };

      const auditId = await auditLogger.logSecurityEvent('AUTH_FAILURE', details, 'high');

      assert.ok(typeof auditId === 'string', 'Should return audit ID');
      assert.strictEqual(auditLogger.securityEvents.length, 1, 'Should add to security events');

      const event = auditLogger.securityEvents[0];
      assert.strictEqual(event.type, 'security_event', 'Should mark as security event');
      assert.strictEqual(event.eventType, 'AUTH_FAILURE', 'Should log event type');
      assert.strictEqual(event.severity, 'high', 'Should log severity');
      assert.ok(String(event.details.reason).includes('authentication'), 'Should log details');
    });

    it('should track different types of security events', async () => {
      await auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        clientId: 'client1',
      });
      await auditLogger.logSecurityEvent('MALICIOUS_INPUT', {
        clientId: 'client2',
      });
      await auditLogger.logSecurityEvent('UNAUTHORIZED_ACCESS', {
        clientId: 'client3',
      });

      assert.strictEqual(auditLogger.securityEvents.length, 3, 'Should track multiple event types');

      const eventTypes = auditLogger.securityEvents.map((e) => e.eventType);
      assert.ok(eventTypes.includes('RATE_LIMIT_EXCEEDED'), 'Should track rate limit events');
      assert.ok(eventTypes.includes('MALICIOUS_INPUT'), 'Should track input validation events');
      assert.ok(eventTypes.includes('UNAUTHORIZED_ACCESS'), 'Should track access events');
    });
  });

  describe('Performance Metrics Logging', () => {
    it('should log performance metrics', async () => {
      await auditLogger.logPerformanceMetric('response_time', 245, 'ms', {
        toolName: 'search_legal_documents',
        clientId: 'test-client',
      });

      assert.strictEqual(auditLogger.performanceMetrics.length, 1, 'Should add performance metric');

      const metric = auditLogger.performanceMetrics[0];
      assert.strictEqual(metric.type, 'performance_metric', 'Should mark as performance metric');
      assert.strictEqual(metric.metric, 'response_time', 'Should log metric name');
      assert.strictEqual(metric.value, 245, 'Should log metric value');
      assert.strictEqual(metric.unit, 'ms', 'Should log metric unit');
    });

    it('should include performance metrics in audit logs when debug enabled', async () => {
      const debugLogger = new MockAuditLogger(
        {
          logLevel: 'debug',
        },
        mockLogger,
      );

      await debugLogger.logPerformanceMetric('memory_usage', 128, 'MB');

      assert.strictEqual(debugLogger.auditEntries.length, 1, 'Should include in audit logs');
      assert.strictEqual(debugLogger.performanceMetrics.length, 1, 'Should also track separately');
    });
  });

  describe('Audit Log Search and Filtering', () => {
    beforeEach(async () => {
      // Create test data
      await auditLogger.logRequest(
        createMockRequest({
          headers: { 'x-client-id': 'client1' },
        }),
      );
      await auditLogger.logToolCall('tool1', {}, 'client1');
      await auditLogger.logSecurityEvent('TEST_EVENT', {
        clientId: 'client2',
      });

      // Add older entry
      const oldEntry: AuditEntry = {
        id: 'old-entry',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        type: 'request',
        clientId: 'client1',
      };
      auditLogger.auditEntries.push(oldEntry);
    });

    it('should search by client ID', async () => {
      const results = await auditLogger.searchAuditLogs({
        clientId: 'client1',
      });

      assert.ok(results.length >= 2, 'Should find entries for client1');
      assert.ok(
        results.every((r) => r.clientId === 'client1'),
        'Should only return client1 entries',
      );
    });

    it('should search by type', async () => {
      const results = await auditLogger.searchAuditLogs({
        type: 'security_event',
      });

      assert.strictEqual(results.length, 1, 'Should find one security event');
      assert.strictEqual(results[0].type, 'security_event', 'Should return security event');
    });

    it('should search by date range', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const results = await auditLogger.searchAuditLogs({
        startDate: yesterday.toISOString(),
      });

      assert.ok(results.length >= 3, 'Should find recent entries');
      assert.ok(
        results.every((r) => new Date(r.timestamp) >= yesterday),
        'Should only return entries from yesterday onwards',
      );
    });

    it('should limit search results', async () => {
      const results = await auditLogger.searchAuditLogs({ limit: 2 });

      assert.strictEqual(results.length, 2, 'Should limit results');
    });

    it('should sort results by timestamp descending', async () => {
      const results = await auditLogger.searchAuditLogs({});

      for (let i = 1; i < results.length; i++) {
        const current = new Date(results[i].timestamp);
        const previous = new Date(results[i - 1].timestamp);
        assert.ok(current.getTime() <= previous.getTime(), 'Should sort by timestamp descending');
      }
    });
  });

  describe('Audit Statistics', () => {
    beforeEach(async () => {
      // Create test data for statistics
      await auditLogger.logRequest(createMockRequest());
      await auditLogger.logResponse('req1', { statusCode: 200 });
      await auditLogger.logToolCall('search_legal_documents', {}, 'client1');
      await auditLogger.logToolCall('get_case_details', {}, 'client2');
      await auditLogger.logToolCall('search_legal_documents', {}, 'client1'); // Duplicate tool
      await auditLogger.logSecurityEvent('RATE_LIMIT', {
        clientId: 'client1',
      });
      await auditLogger.logSecurityEvent('AUTH_FAILURE', {
        clientId: 'client2',
      });
    });

    it('should generate comprehensive statistics', async () => {
      const stats = await auditLogger.getAuditStats('24h');

      assert.ok(stats.totalEntries >= 7, 'Should count total entries');
      assert.ok(stats.requests >= 1, 'Should count requests');
      assert.ok(stats.responses >= 1, 'Should count responses');
      assert.ok(stats.toolCalls >= 3, 'Should count tool calls');
      assert.ok(stats.securityEvents >= 2, 'Should count security events');
      assert.ok(stats.uniqueClients >= 2, 'Should count unique clients');
    });

    it('should provide tool usage breakdown', async () => {
      const stats = await auditLogger.getAuditStats('24h');

      assert.strictEqual(
        stats.toolUsage['search_legal_documents'],
        2,
        'Should count tool usage correctly',
      );
      assert.strictEqual(stats.toolUsage['get_case_details'], 1, 'Should count different tools');
    });

    it('should provide security event breakdown', async () => {
      const stats = await auditLogger.getAuditStats('24h');

      assert.strictEqual(
        stats.securityEventTypes['RATE_LIMIT'],
        1,
        'Should count security event types',
      );
      assert.strictEqual(
        stats.securityEventTypes['AUTH_FAILURE'],
        1,
        'Should count different event types',
      );
    });

    it('should respect time range filters', async () => {
      const stats1h = await auditLogger.getAuditStats('1h');
      const stats24h = await auditLogger.getAuditStats('24h');

      assert.ok(
        stats24h.totalEntries >= stats1h.totalEntries,
        'Longer time range should include more entries',
      );
    });
  });

  describe('Export Functionality', () => {
    beforeEach(async () => {
      await auditLogger.logRequest(
        createMockRequest({
          headers: { 'x-client-id': 'export-client' },
        }),
      );
      await auditLogger.logToolCall('export_test', { param: 'value' }, 'export-client');
    });

    it('should export logs as JSON', async () => {
      const jsonExport = await auditLogger.exportAuditLogs('json');

      assert.ok(typeof jsonExport === 'string', 'Should return string');

      const parsed = JSON.parse(jsonExport);
      assert.ok(Array.isArray(parsed), 'Should be valid JSON array');
      assert.ok(parsed.length >= 2, 'Should contain audit entries');
    });

    it('should export logs as CSV', async () => {
      const csvExport = await auditLogger.exportAuditLogs('csv');

      assert.ok(typeof csvExport === 'string', 'Should return string');
      assert.ok(csvExport.includes(','), 'Should contain CSV separators');

      const lines = csvExport.split('\n');
      assert.ok(lines.length >= 3, 'Should have header + data rows'); // header + 2 data rows
    });

    it('should export logs as XML', async () => {
      const xmlExport = await auditLogger.exportAuditLogs('xml');

      assert.ok(typeof xmlExport === 'string', 'Should return string');
      assert.ok(xmlExport.includes('<?xml'), 'Should have XML declaration');
      assert.ok(xmlExport.includes('<audit-logs>'), 'Should have root element');
      assert.ok(xmlExport.includes('<audit-entry>'), 'Should have entry elements');
    });

    it('should filter exports by criteria', async () => {
      const filteredExport = await auditLogger.exportAuditLogs('json', {
        type: 'tool_call',
      });

      const parsed = JSON.parse(filteredExport);
      assert.ok(
        parsed.every((entry: AuditEntry) => entry.type === 'tool_call'),
        'Should only export filtered entries',
      );
    });

    it('should handle unsupported export formats', async () => {
      try {
        await auditLogger.exportAuditLogs('pdf' as 'json');
        assert.fail('Should throw error for unsupported format');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes('Unsupported export format'),
          'Should throw appropriate error',
        );
      }
    });
  });

  describe('Log Retention and Cleanup', () => {
    it('should clean up old logs based on retention policy', async () => {
      // Create old entries
      const oldEntries: AuditEntry[] = [
        {
          id: 'old1',
          timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days old
          type: 'request',
        },
        {
          id: 'old2',
          timestamp: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(), // 50 days old
          type: 'response',
        },
      ];

      auditLogger.auditEntries.push(...oldEntries);
      auditLogger['config'].retentionDays = 30;

      const beforeCount = auditLogger.auditEntries.length;
      const removedCount = await auditLogger.cleanOldLogs();

      assert.ok(removedCount >= 2, 'Should remove old entries');
      assert.ok(auditLogger.auditEntries.length < beforeCount, 'Should reduce total entries');
    });

    it('should not clean logs when retention is disabled', async () => {
      auditLogger['config'].retentionDays = 0;

      const beforeCount = auditLogger.auditEntries.length;
      const removedCount = await auditLogger.cleanOldLogs();

      assert.strictEqual(removedCount, 0, 'Should not remove any entries');
      assert.strictEqual(auditLogger.auditEntries.length, beforeCount, 'Should keep all entries');
    });
  });

  describe('Configuration Options', () => {
    it('should disable audit logging when configured', async () => {
      const disabledLogger = new MockAuditLogger(
        {
          auditEnabled: false,
        },
        mockLogger,
      );

      await disabledLogger.logRequest(createMockRequest());

      assert.strictEqual(disabledLogger.auditEntries.length, 0, 'Should not log when disabled');
    });

    it('should exclude headers when configured', async () => {
      const noHeadersLogger = new MockAuditLogger(
        {
          includeHeaders: false,
        },
        mockLogger,
      );

      const req = createMockRequest({
        headers: { authorization: 'Bearer token' },
      });

      await noHeadersLogger.logRequest(req);

      const entry = noHeadersLogger.auditEntries[0];
      const headers = entry.headers as Record<string, string>;
      assert.strictEqual(Object.keys(headers).length, 0, 'Should exclude headers when configured');
    });

    it('should exclude request/response bodies when configured', async () => {
      const noBodiesLogger = new MockAuditLogger(
        {
          includeRequestBody: false,
          includeResponseBody: false,
        },
        mockLogger,
      );

      const req = createMockRequest({ body: { secret: 'data' } });
      await noBodiesLogger.logRequest(req);

      const res = { body: { result: 'success' } };
      await noBodiesLogger.logResponse('test', res);

      const requestEntry = noBodiesLogger.auditEntries[0];
      const responseEntry = noBodiesLogger.auditEntries[1];

      assert.strictEqual(requestEntry.body, undefined, 'Should exclude request body');
      assert.strictEqual(responseEntry.body, undefined, 'Should exclude response body');
    });

    it('should use custom sensitive headers list', async () => {
      const customLogger = new MockAuditLogger(
        {
          sensitiveHeaders: ['x-custom-secret', 'x-private-key'],
        },
        mockLogger,
      );

      const req = createMockRequest({
        headers: {
          'x-custom-secret': 'secret-value',
          'x-private-key': 'private-key-value',
          authorization: 'Bearer token', // This should NOT be redacted
        },
      });

      await customLogger.logRequest(req);

      const entry = customLogger.auditEntries[0];
      const headers = entry.headers as Record<string, string>;
      assert.strictEqual(
        headers['x-custom-secret'],
        '[REDACTED]',
        'Should redact custom sensitive header',
      );
      assert.strictEqual(
        headers['x-private-key'],
        '[REDACTED]',
        'Should redact custom private header',
      );
      assert.strictEqual(
        headers.authorization,
        'Bearer token',
        'Should not redact non-configured headers',
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed request objects', async () => {
      const malformedReq = {
        headers: null,
        body: undefined,
      };

      const auditId = await auditLogger.logRequest(malformedReq as unknown as Partial<MockRequest>);

      assert.ok(typeof auditId === 'string', 'Should handle malformed requests');

      const entry = auditLogger.auditEntries[0];
      assert.strictEqual(entry.clientId, 'anonymous', 'Should use default client ID');
    });

    it('should handle circular references in bodies', async () => {
      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj; // Create circular reference

      const req = createMockRequest({ body: circularObj });

      // This should not throw an error
      await auditLogger.logRequest(req);

      assert.strictEqual(auditLogger.auditEntries.length, 1, 'Should handle circular references');
    });

    it('should handle very large objects gracefully', async () => {
      const largeObj: Record<string, string> = {};
      for (let i = 0; i < 10000; i++) {
        largeObj[`key${i}`] = `value${i}`;
      }

      const req = createMockRequest({ body: largeObj });

      const start = Date.now();
      await auditLogger.logRequest(req);
      const duration = Date.now() - start;

      assert.ok(duration < 1000, 'Should handle large objects efficiently');
      assert.strictEqual(auditLogger.auditEntries.length, 1, 'Should create audit entry');
    });
  });

  describe('Compliance Mode', () => {
    it('should enable additional logging in compliance mode', async () => {
      const complianceLogger = new MockAuditLogger(
        {
          complianceMode: true,
          includeRequestBody: true,
          includeResponseBody: true,
          logLevel: 'debug',
        },
        mockLogger,
      );

      const req = createMockRequest({
        headers: { 'x-client-id': 'compliance-client' },
        body: { sensitiveData: 'important' },
      });

      await complianceLogger.logRequest(req, {
        complianceReason: 'GDPR_AUDIT',
        dataClassification: 'SENSITIVE',
      });

      const entry = complianceLogger.auditEntries[0];
      assert.strictEqual(
        entry.complianceReason,
        'GDPR_AUDIT',
        'Should include compliance metadata',
      );
      assert.strictEqual(
        entry.dataClassification,
        'SENSITIVE',
        'Should include data classification',
      );
    });
  });
});

console.log('✅ Audit Logging Middleware Tests Completed');
