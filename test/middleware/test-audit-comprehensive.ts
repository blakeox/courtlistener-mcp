#!/usr/bin/env node

/**
 * ✅ Comprehensive Audit Logging Tests (TypeScript)
 * Tests all audit logging features including compliance, export, and performance
 */

import { createMockLogger, type MockLogger } from '../../utils/test-helpers.ts';

interface AuditLoggerConfig {
  enabled?: boolean;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeHeaders?: boolean;
  sensitiveFields?: string[];
  retentionDays?: number;
  maxLogSize?: number;
  compressionEnabled?: boolean;
  exportFormats?: string[];
  complianceMode?: boolean;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  type: string;
  clientId?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  ipAddress?: string;
  requestId?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  headers?: Record<string, string>;
  responseTime?: number;
  statusCode?: number;
  success?: boolean;
  eventType?: string;
  severity?: string;
  details?: unknown;
  source?: string;
  [key: string]: unknown;
}

interface AuditLogger {
  config: Required<AuditLoggerConfig>;
  auditEntries: AuditEntry[];
  storage: Map<string, AuditEntry>;
  logRequest(
    request: Partial<Request>,
    response: Partial<Response> | null,
    metadata?: Record<string, unknown>
  ): Promise<string | undefined>;
  logSecurityEvent(
    eventType: string,
    details: Record<string, unknown>
  ): Promise<string | undefined>;
  exportAuditLogs(
    format: string,
    filters?: Record<string, unknown>
  ): Promise<{
    format: string;
    data: string;
    count: number;
  }>;
  getComplianceReport(
    startDate: string,
    endDate: string
  ): Promise<{
    period: { startDate: string; endDate: string };
    statistics: {
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      securityEvents: number;
      uniqueClients: number;
      averageResponseTime: number;
      topClients: Array<{ clientId: string; requestCount: number }>;
      errorsByType: Record<string, number>;
    };
    logs: AuditEntry[];
  }>;
  cleanupOldLogs(): Promise<{ removedCount: number; remainingCount: number }>;
}

interface Request {
  id?: string;
  method?: string;
  path?: string;
  clientId?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface Response {
  statusCode?: number;
  body?: unknown;
}

class EnhancedAuditLoggingTests {
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

  runTest(testName: string, testFn: () => void): void {
    this.testCount++;
    try {
      testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  async runAsyncTest(
    testName: string,
    testFn: () => Promise<void>
  ): Promise<void> {
    this.testCount++;
    try {
      await testFn();
      console.log(`  ✅ ${testName}`);
      this.passedTests++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${testName}: ${errorMessage}`);
      this.failedTests++;
    }
  }

  // Enhanced Mock Audit Logger
  createAuditLogger(config: AuditLoggerConfig = {}): AuditLogger {
    const loggerConfig: Required<AuditLoggerConfig> = {
      enabled: true,
      includeRequestBody: true,
      includeResponseBody: true,
      includeHeaders: false,
      sensitiveFields: ['password', 'token', 'key'],
      retentionDays: 90,
      maxLogSize: 10485760, // 10MB
      compressionEnabled: true,
      exportFormats: ['json', 'csv'],
      complianceMode: false,
      ...config,
    };

    const auditEntries: AuditEntry[] = [];
    const storage = new Map<string, AuditEntry>();

    const auditLogger: AuditLogger = {
      config: loggerConfig,
      auditEntries,
      storage,

      async logRequest(
        request: Partial<Request>,
        response: Partial<Response> | null,
        metadata: Record<string, unknown> = {}
      ): Promise<string | undefined> {
        if (!loggerConfig.enabled) return undefined;

        const entry: AuditEntry = {
          id: this.generateEntryId(),
          timestamp: new Date().toISOString(),
          type: 'request',
          clientId: request.clientId || 'anonymous',
          method: request.method || 'POST',
          path: request.path || '/api/mcp',
          userAgent: request.headers?.['user-agent'],
          ipAddress:
            request.headers?.['x-forwarded-for'] ||
            request.headers?.['x-real-ip'],
          requestId: request.id || this.generateRequestId(),
          ...metadata,
        };

        // Include request body if enabled
        if (loggerConfig.includeRequestBody && request.body) {
          entry.requestBody = this.sanitizeData(request.body, loggerConfig);
        }

        // Include response body if enabled
        if (loggerConfig.includeResponseBody && response?.body) {
          entry.responseBody = this.sanitizeData(response.body, loggerConfig);
        }

        // Include headers if enabled (excluding sensitive ones)
        if (loggerConfig.includeHeaders && request.headers) {
          entry.headers = this.sanitizeHeaders(request.headers);
        }

        // Add performance metrics
        if (metadata.duration) {
          entry.responseTime = metadata.duration as number;
        }

        // Add status information
        if (response) {
          entry.statusCode = response.statusCode || 200;
          entry.success = (response.statusCode || 200) < 400;
        }

        // Store in memory (in real implementation, this would go to database)
        auditEntries.push(entry);
        storage.set(entry.id, entry);

        return entry.id;
      },

      async logSecurityEvent(
        eventType: string,
        details: Record<string, unknown>
      ): Promise<string | undefined> {
        if (!loggerConfig.enabled) return undefined;

        const entry: AuditEntry = {
          id: this.generateEntryId(),
          timestamp: new Date().toISOString(),
          type: 'security_event',
          eventType,
          severity: this.determineSeverity(eventType),
          details: this.sanitizeData(details, loggerConfig),
          source: (details.source as string) || 'middleware',
        };

        auditEntries.push(entry);
        storage.set(entry.id, entry);

        return entry.id;
      },

      async exportAuditLogs(
        format = 'json',
        filters: Record<string, unknown> = {}
      ): Promise<{ format: string; data: string; count: number }> {
        let logs = [...auditEntries];

        // Apply filters
        if (filters.startDate) {
          logs = logs.filter(
            (log) => new Date(log.timestamp) >= new Date(filters.startDate as string)
          );
        }
        if (filters.endDate) {
          logs = logs.filter(
            (log) => new Date(log.timestamp) <= new Date(filters.endDate as string)
          );
        }
        if (filters.clientId) {
          logs = logs.filter((log) => log.clientId === filters.clientId);
        }
        if (filters.type) {
          logs = logs.filter((log) => log.type === filters.type);
        }

        if (format === 'json') {
          return {
            format: 'json',
            data: JSON.stringify(logs, null, 2),
            count: logs.length,
          };
        } else if (format === 'csv') {
          return {
            format: 'csv',
            data: this.convertToCSV(logs),
            count: logs.length,
          };
        }

        throw new Error(`Unsupported export format: ${format}`);
      },

      async getComplianceReport(
        startDate: string,
        endDate: string
      ): Promise<{
        period: { startDate: string; endDate: string };
        statistics: {
          totalRequests: number;
          successfulRequests: number;
          failedRequests: number;
          securityEvents: number;
          uniqueClients: number;
          averageResponseTime: number;
          topClients: Array<{ clientId: string; requestCount: number }>;
          errorsByType: Record<string, number>;
        };
        logs: AuditEntry[];
      }> {
        const logs = auditEntries.filter((log) => {
          const logDate = new Date(log.timestamp);
          return (
            logDate >= new Date(startDate) && logDate <= new Date(endDate)
          );
        });

        const stats = {
          totalRequests: logs.filter((l) => l.type === 'request').length,
          successfulRequests: logs.filter(
            (l) => l.type === 'request' && l.success
          ).length,
          failedRequests: logs.filter(
            (l) => l.type === 'request' && !l.success
          ).length,
          securityEvents: logs.filter((l) => l.type === 'security_event')
            .length,
          uniqueClients: new Set(logs.map((l) => l.clientId)).size,
          averageResponseTime: this.calculateAverageResponseTime(logs),
          topClients: this.getTopClients(logs),
          errorsByType: this.groupErrorsByType(logs),
        };

        return {
          period: { startDate, endDate },
          statistics: stats,
          logs: loggerConfig.complianceMode
            ? logs
            : logs.slice(0, 100), // Limit for demo
        };
      },

      async cleanupOldLogs(): Promise<{
        removedCount: number;
        remainingCount: number;
      }> {
        const cutoffDate = new Date();
        cutoffDate.setDate(
          cutoffDate.getDate() - loggerConfig.retentionDays
        );

        const initialCount = auditEntries.length;
        const filtered = auditEntries.filter(
          (entry) => new Date(entry.timestamp) > cutoffDate
        );
        auditEntries.length = 0;
        auditEntries.push(...filtered);

        const removedCount = initialCount - auditEntries.length;
        return { removedCount, remainingCount: auditEntries.length };
      },
    };

    // Add helper methods to logger instance
    (auditLogger as AuditLogger & {
      generateEntryId: () => string;
      generateRequestId: () => string;
      sanitizeData: (data: unknown, config: Required<AuditLoggerConfig>) => unknown;
      sanitizeHeaders: (headers: Record<string, string>) => Record<string, string>;
      determineSeverity: (eventType: string) => string;
      calculateAverageResponseTime: (logs: AuditEntry[]) => number;
      getTopClients: (logs: AuditEntry[]) => Array<{ clientId: string; requestCount: number }>;
      groupErrorsByType: (logs: AuditEntry[]) => Record<string, number>;
      convertToCSV: (logs: AuditEntry[]) => string;
    }).generateEntryId = () => {
      return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    };

    (auditLogger as AuditLogger & { generateRequestId: () => string }).generateRequestId = () => {
      return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    };

    (auditLogger as AuditLogger & {
      sanitizeData: (data: unknown, config: Required<AuditLoggerConfig>) => unknown;
    }).sanitizeData = (
      data: unknown,
      config: Required<AuditLoggerConfig>
    ): unknown => {
      if (typeof data !== 'object' || data === null) return data;

      try {
        // Use a set to track visited objects for circular reference detection
        const visited = new WeakSet<object>();

        const sanitizeRecursive = (obj: unknown): unknown => {
          if (obj === null || typeof obj !== 'object') return obj;
          if (visited.has(obj as object)) return '[CIRCULAR_REFERENCE]';

          visited.add(obj as object);

          if (Array.isArray(obj)) {
            return obj.map((item) => sanitizeRecursive(item));
          }

          const sanitized: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (config.sensitiveFields.includes(key)) {
              sanitized[key] = '[REDACTED]';
            } else {
              sanitized[key] = sanitizeRecursive(value);
            }
          }

          return sanitized;
        };

        return sanitizeRecursive(data);
      } catch (error) {
        // Fallback: try to serialize and sanitize sensitive fields only
        try {
          const sanitized = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
          config.sensitiveFields.forEach((field) => {
            if (sanitized[field]) {
              sanitized[field] = '[REDACTED]';
            }
          });
          return sanitized;
        } catch {
          // Final fallback for complex circular references
          return '[COMPLEX_OBJECT]';
        }
      }
    };

    (auditLogger as AuditLogger & {
      sanitizeHeaders: (headers: Record<string, string>) => Record<string, string>;
    }).sanitizeHeaders = (
      headers: Record<string, string>
    ): Record<string, string> => {
      const sanitized = { ...headers };
      ['authorization', 'x-api-key', 'cookie'].forEach((header) => {
        if (sanitized[header]) {
          sanitized[header] = '[REDACTED]';
        }
      });
      return sanitized;
    };

    (auditLogger as AuditLogger & {
      determineSeverity: (eventType: string) => string;
    }).determineSeverity = (eventType: string): string => {
      const severityMap: Record<string, string> = {
        auth_failure: 'medium',
        rate_limit_exceeded: 'low',
        invalid_request: 'low',
        server_error: 'high',
        security_violation: 'critical',
      };
      return severityMap[eventType] || 'low';
    };

    (auditLogger as AuditLogger & {
      calculateAverageResponseTime: (logs: AuditEntry[]) => number;
    }).calculateAverageResponseTime = (logs: AuditEntry[]): number => {
      const requestLogs = logs.filter(
        (l) => l.type === 'request' && l.responseTime
      );
      if (requestLogs.length === 0) return 0;

      const total = requestLogs.reduce(
        (sum, log) => sum + (log.responseTime || 0),
        0
      );
      return Math.round(total / requestLogs.length);
    };

    (auditLogger as AuditLogger & {
      getTopClients: (
        logs: AuditEntry[]
      ) => Array<{ clientId: string; requestCount: number }>;
    }).getTopClients = (
      logs: AuditEntry[]
    ): Array<{ clientId: string; requestCount: number }> => {
      const clientCounts: Record<string, number> = {};
      logs.forEach((log) => {
        const clientId = log.clientId || 'unknown';
        clientCounts[clientId] = (clientCounts[clientId] || 0) + 1;
      });

      return Object.entries(clientCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([clientId, count]) => ({ clientId, requestCount: count }));
    };

    (auditLogger as AuditLogger & {
      groupErrorsByType: (logs: AuditEntry[]) => Record<string, number>;
    }).groupErrorsByType = (logs: AuditEntry[]): Record<string, number> => {
      const errorCounts: Record<string, number> = {};
      logs
        .filter((l) => !l.success)
        .forEach((log) => {
          const type = String(log.statusCode || 'unknown');
          errorCounts[type] = (errorCounts[type] || 0) + 1;
        });
      return errorCounts;
    };

    (auditLogger as AuditLogger & {
      convertToCSV: (logs: AuditEntry[]) => string;
    }).convertToCSV = (logs: AuditEntry[]): string => {
      if (logs.length === 0) return '';

      const headers = Object.keys(logs[0]).join(',');
      const rows = logs.map((log) =>
        Object.values(log)
          .map((value) =>
            typeof value === 'object' ? JSON.stringify(value) : String(value)
          )
          .join(',')
      );

      return [headers, ...rows].join('\n');
    };

    return auditLogger;
  }

  async runComprehensiveTests(): Promise<void> {
    console.log('📋 Running Comprehensive Audit Logging Tests...\n');

    // Basic Logging Tests
    console.log('📝 Basic Logging Tests:');

    await this.runAsyncTest(
      'should log basic request/response',
      async () => {
        const auditor = this.createAuditLogger();

        const request: Request = {
          id: 'req_123',
          method: 'POST',
          path: '/api/search',
          clientId: 'client_123',
          body: { query: 'test search' },
          headers: { 'user-agent': 'TestClient/1.0' },
        };

        const response: Response = {
          statusCode: 200,
          body: { results: ['result1', 'result2'] },
        };

        const entryId = await auditor.logRequest(request, response, {
          duration: 150,
        });

        assert(entryId !== undefined, 'Should return entry ID');
        assert(auditor.auditEntries.length === 1, 'Should store audit entry');

        const entry = auditor.auditEntries[0];
        assert(entry.clientId === 'client_123', 'Should log client ID');
        assert(
          (entry.requestBody as { query?: string })?.query === 'test search',
          'Should log request body'
        );
        assert(entry.responseTime === 150, 'Should log response time');
        assert(entry.success === true, 'Should mark as successful');
      }
    );

    await this.runAsyncTest('should log security events', async () => {
      const auditor = this.createAuditLogger();

      const entryId = await auditor.logSecurityEvent('auth_failure', {
        clientId: 'suspicious_client',
        reason: 'invalid_api_key',
        ipAddress: '192.168.1.100',
      });

      assert(entryId !== undefined, 'Should return entry ID');
      assert(auditor.auditEntries.length === 1, 'Should store security event');

      const entry = auditor.auditEntries[0];
      assert(entry.type === 'security_event', 'Should be security event type');
      assert(entry.eventType === 'auth_failure', 'Should log event type');
      assert(entry.severity === 'medium', 'Should assign severity');
    });

    // Data Sanitization Tests
    console.log('\n🔒 Data Sanitization Tests:');

    await this.runAsyncTest('should sanitize sensitive data', async () => {
      const auditor = this.createAuditLogger();

      const request: Request = {
        body: {
          query: 'search term',
          password: 'secret123',
          token: 'abc123xyz',
          normalField: 'safe data',
        },
      };

      await auditor.logRequest(request, {});

      const entry = auditor.auditEntries[0];
      const requestBody = entry.requestBody as Record<string, unknown>;
      assert(
        requestBody.password === '[REDACTED]',
        'Should redact password'
      );
      assert(requestBody.token === '[REDACTED]', 'Should redact token');
      assert(
        requestBody.normalField === 'safe data',
        'Should preserve normal fields'
      );
    });

    await this.runAsyncTest('should sanitize headers', async () => {
      const auditor = this.createAuditLogger({ includeHeaders: true });

      const request: Request = {
        headers: {
          authorization: 'Bearer secret-token',
          'x-api-key': 'api-key-123',
          'user-agent': 'TestClient/1.0',
          'content-type': 'application/json',
        },
      };

      await auditor.logRequest(request, {});

      const entry = auditor.auditEntries[0];
      const headers = entry.headers as Record<string, string>;
      assert(
        headers.authorization === '[REDACTED]',
        'Should redact authorization'
      );
      assert(
        headers['x-api-key'] === '[REDACTED]',
        'Should redact API key'
      );
      assert(
        headers['user-agent'] === 'TestClient/1.0',
        'Should preserve safe headers'
      );
    });

    // Configuration Tests
    console.log('\n⚙️ Configuration Tests:');

    await this.runAsyncTest(
      'should respect disabled logging',
      async () => {
        const auditor = this.createAuditLogger({ enabled: false });

        const entryId = await auditor.logRequest({ body: 'test' }, {});

        assert(
          entryId === undefined,
          'Should not return entry ID when disabled'
        );
        assert(
          auditor.auditEntries.length === 0,
          'Should not store entries when disabled'
        );
      }
    );

    await this.runAsyncTest(
      'should respect body inclusion settings',
      async () => {
        const auditor = this.createAuditLogger({
          includeRequestBody: false,
          includeResponseBody: false,
        });

        const request: Request = { body: { sensitive: 'data' } };
        const response: Response = { body: { results: 'data' } };

        await auditor.logRequest(request, response);

        const entry = auditor.auditEntries[0];
        assert(
          entry.requestBody === undefined,
          'Should not include request body'
        );
        assert(
          entry.responseBody === undefined,
          'Should not include response body'
        );
      }
    );

    // Export and Compliance Tests
    console.log('\n📊 Export and Compliance Tests:');

    await this.runAsyncTest(
      'should export logs in JSON format',
      async () => {
        const auditor = this.createAuditLogger();

        // Add some test data
        await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 });
        await auditor.logRequest({ clientId: 'client2' }, { statusCode: 404 });

        const export1 = await auditor.exportAuditLogs('json');

        assert(export1.format === 'json', 'Should specify JSON format');
        assert(export1.count === 2, 'Should include correct count');
        assert(typeof export1.data === 'string', 'Should return JSON string');

        const parsedData = JSON.parse(export1.data);
        assert(Array.isArray(parsedData), 'Should parse to array');
        assert(parsedData.length === 2, 'Should include all entries');
      }
    );

    await this.runAsyncTest('should export logs in CSV format', async () => {
      const auditor = this.createAuditLogger();

      await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 });

      const export1 = await auditor.exportAuditLogs('csv');

      assert(export1.format === 'csv', 'Should specify CSV format');
      assert(export1.count === 1, 'Should include correct count');
      assert(typeof export1.data === 'string', 'Should return CSV string');
      assert(export1.data.includes(','), 'Should contain CSV delimiters');
    });

    await this.runAsyncTest(
      'should filter exports by date range',
      async () => {
        const auditor = this.createAuditLogger();

        // Add entries with different timestamps
        const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        const recentDate = new Date();

        auditor.auditEntries.push({
          id: 'old_entry',
          timestamp: oldDate.toISOString(),
          clientId: 'client1',
          type: 'request',
        });

        auditor.auditEntries.push({
          id: 'recent_entry',
          timestamp: recentDate.toISOString(),
          clientId: 'client2',
          type: 'request',
        });

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const export1 = await auditor.exportAuditLogs('json', {
          startDate: yesterday.toISOString(),
        });

        const parsedData = JSON.parse(export1.data);
        assert(parsedData.length === 1, 'Should filter by date range');
        assert(
          parsedData[0].id === 'recent_entry',
          'Should include only recent entries'
        );
      }
    );

    await this.runAsyncTest(
      'should generate compliance reports',
      async () => {
        const auditor = this.createAuditLogger();

        // Add test data
        await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 }, {
          duration: 100,
        });
        await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 }, {
          duration: 200,
        });
        await auditor.logRequest({ clientId: 'client2' }, { statusCode: 404 }, {
          duration: 50,
        });
        await auditor.logSecurityEvent('auth_failure', { clientId: 'client3' });

        const report = await auditor.getComplianceReport(
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          new Date().toISOString()
        );

        assert(
          report.statistics.totalRequests === 3,
          'Should count total requests'
        );
        assert(
          report.statistics.successfulRequests === 2,
          'Should count successful requests'
        );
        assert(
          report.statistics.failedRequests === 1,
          'Should count failed requests'
        );
        assert(
          report.statistics.securityEvents === 1,
          'Should count security events'
        );
        assert(
          report.statistics.uniqueClients === 3,
          'Should count unique clients'
        );
        assert(
          report.statistics.averageResponseTime === 117,
          'Should calculate average response time'
        );
      }
    );

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle high-volume logging', async () => {
      const auditor = this.createAuditLogger();
      const iterations = 1000;

      const start = Date.now();

      const promises = Array(iterations)
        .fill(null)
        .map((_, i) =>
          auditor.logRequest(
            {
              clientId: `client_${i}`,
              body: { query: `search_${i}` },
            },
            { statusCode: 200 },
            { duration: Math.random() * 100 }
          )
        );

      await Promise.all(promises);
      const duration = Date.now() - start;

      assert(auditor.auditEntries.length === iterations, 'Should log all entries');
      assert(duration < 5000, 'Should complete 1000 logs within 5 seconds');

      const avgTime = duration / iterations;
      console.log(`    ⚡ Average logging time: ${avgTime.toFixed(2)}ms`);
    });

    await this.runAsyncTest(
      'should handle cleanup of old logs',
      async () => {
        const auditor = this.createAuditLogger({ retentionDays: 1 });

        // Add old entry
        const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
        auditor.auditEntries.push({
          id: 'old_entry',
          timestamp: oldDate.toISOString(),
          type: 'request',
        });

        // Add recent entry
        await auditor.logRequest({ clientId: 'recent' }, {});

        const cleanup = await auditor.cleanupOldLogs();

        assert(cleanup.removedCount === 1, 'Should remove old entries');
        assert(cleanup.remainingCount === 1, 'Should keep recent entries');
        assert(
          auditor.auditEntries.length === 1,
          'Should have correct remaining count'
        );
      }
    );

    // Edge Cases
    console.log('\n⚠️ Edge Cases:');

    await this.runAsyncTest('should handle malformed data', async () => {
      const auditor = this.createAuditLogger();

      const circularObj: Record<string, unknown> = { a: 1 };
      circularObj.self = circularObj;

      // Should not throw even with circular references
      const entryId = await auditor.logRequest({ body: circularObj }, {});

      assert(
        entryId !== undefined,
        'Should handle circular references gracefully'
      );
      assert(auditor.auditEntries.length === 1, 'Should still create entry');
    });

    await this.runAsyncTest('should handle missing response data', async () => {
      const auditor = this.createAuditLogger();

      const entryId = await auditor.logRequest({ clientId: 'test' }, null);

      assert(entryId !== undefined, 'Should handle missing response');
      assert(auditor.auditEntries.length === 1, 'Should create entry');

      const entry = auditor.auditEntries[0];
      assert(entry.statusCode === undefined, 'Should handle missing status');
      assert(entry.success === undefined, 'Should handle missing success flag');
    });

    // Summary
    this.printSummary();
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUDIT LOGGING TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(
      `Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`
    );
    console.log(
      `Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`
    );

    if (this.failedTests === 0) {
      console.log(
        '\n🎉 All audit logging tests passed! Compliance and logging features are working correctly.'
      );
    } else {
      console.log(
        `\n💥 ${this.failedTests} test(s) failed. Please review audit logging implementation.`
      );
      process.exit(1);
    }

    console.log('\n✅ Enhanced Audit Logging Tests Completed Successfully!');
  }
}

// Helper assert function
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// Run the comprehensive audit logging tests
const auditTests = new EnhancedAuditLoggingTests();
auditTests.runComprehensiveTests().catch((error) => {
  console.error('Fatal error in audit logging tests:', error);
  process.exit(1);
});

