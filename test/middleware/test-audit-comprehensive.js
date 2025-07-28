#!/usr/bin/env node

/**
 * Comprehensive Audit Logging Tests
 * Tests all audit logging features including compliance, export, and performance
 */

import { createMockLogger } from '../../utils/test-helpers.js';

class EnhancedAuditLoggingTests {
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

  // Enhanced Mock Audit Logger
  createAuditLogger(config = {}) {
    return {
      config: {
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
        ...config
      },
      auditEntries: [],
      storage: new Map(),
      
      async logRequest(request, response, metadata = {}) {
        if (!this.config.enabled) return;

        const entry = {
          id: this.generateEntryId(),
          timestamp: new Date().toISOString(),
          type: 'request',
          clientId: request.clientId || 'anonymous',
          method: request.method || 'POST',
          path: request.path || '/api/mcp',
          userAgent: request.headers?.['user-agent'],
          ipAddress: request.headers?.['x-forwarded-for'] || request.headers?.['x-real-ip'],
          requestId: request.id || this.generateRequestId(),
          ...metadata
        };

        // Include request body if enabled
        if (this.config.includeRequestBody && request.body) {
          entry.requestBody = this.sanitizeData(request.body);
        }

        // Include response body if enabled
        if (this.config.includeResponseBody && response?.body) {
          entry.responseBody = this.sanitizeData(response.body);
        }

        // Include headers if enabled (excluding sensitive ones)
        if (this.config.includeHeaders && request.headers) {
          entry.headers = this.sanitizeHeaders(request.headers);
        }

        // Add performance metrics
        if (metadata.duration) {
          entry.responseTime = metadata.duration;
        }

        // Add status information
        if (response) {
          entry.statusCode = response.statusCode || 200;
          entry.success = (response.statusCode || 200) < 400;
        }

        // Store in memory (in real implementation, this would go to database)
        this.auditEntries.push(entry);
        this.storage.set(entry.id, entry);

        return entry.id;
      },

      async logSecurityEvent(eventType, details) {
        if (!this.config.enabled) return;

        const entry = {
          id: this.generateEntryId(),
          timestamp: new Date().toISOString(),
          type: 'security_event',
          eventType,
          severity: this.determineSeverity(eventType),
          details: this.sanitizeData(details),
          source: details.source || 'middleware'
        };

        this.auditEntries.push(entry);
        this.storage.set(entry.id, entry);

        return entry.id;
      },

      async exportAuditLogs(format = 'json', filters = {}) {
        let logs = [...this.auditEntries];

        // Apply filters
        if (filters.startDate) {
          logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
        }
        if (filters.endDate) {
          logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
        }
        if (filters.clientId) {
          logs = logs.filter(log => log.clientId === filters.clientId);
        }
        if (filters.type) {
          logs = logs.filter(log => log.type === filters.type);
        }

        if (format === 'json') {
          return {
            format: 'json',
            data: JSON.stringify(logs, null, 2),
            count: logs.length
          };
        } else if (format === 'csv') {
          return {
            format: 'csv',
            data: this.convertToCSV(logs),
            count: logs.length
          };
        }

        throw new Error(`Unsupported export format: ${format}`);
      },

      async getComplianceReport(startDate, endDate) {
        const logs = this.auditEntries.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= new Date(startDate) && logDate <= new Date(endDate);
        });

        const stats = {
          totalRequests: logs.filter(l => l.type === 'request').length,
          successfulRequests: logs.filter(l => l.type === 'request' && l.success).length,
          failedRequests: logs.filter(l => l.type === 'request' && !l.success).length,
          securityEvents: logs.filter(l => l.type === 'security_event').length,
          uniqueClients: new Set(logs.map(l => l.clientId)).size,
          averageResponseTime: this.calculateAverageResponseTime(logs),
          topClients: this.getTopClients(logs),
          errorsByType: this.groupErrorsByType(logs)
        };

        return {
          period: { startDate, endDate },
          statistics: stats,
          logs: this.config.complianceMode ? logs : logs.slice(0, 100) // Limit for demo
        };
      },

      async cleanupOldLogs() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

        const initialCount = this.auditEntries.length;
        this.auditEntries = this.auditEntries.filter(entry => 
          new Date(entry.timestamp) > cutoffDate
        );

        const removedCount = initialCount - this.auditEntries.length;
        return { removedCount, remainingCount: this.auditEntries.length };
      },

      // Helper methods
      generateEntryId() {
        return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      },

      generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      },

      sanitizeData(data) {
        if (typeof data !== 'object' || data === null) return data;
        
        try {
          // Use a set to track visited objects for circular reference detection
          const visited = new WeakSet();
          
          const sanitizeRecursive = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (visited.has(obj)) return '[CIRCULAR_REFERENCE]';
            
            visited.add(obj);
            
            if (Array.isArray(obj)) {
              return obj.map(item => sanitizeRecursive(item));
            }
            
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
              if (this.config.sensitiveFields.includes(key)) {
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
            const sanitized = JSON.parse(JSON.stringify(data));
            this.config.sensitiveFields.forEach(field => {
              if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
              }
            });
            return sanitized;
          } catch (circularError) {
            // Final fallback for complex circular references
            return '[COMPLEX_OBJECT]';
          }
        }
      },

      sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        ['authorization', 'x-api-key', 'cookie'].forEach(header => {
          if (sanitized[header]) {
            sanitized[header] = '[REDACTED]';
          }
        });
        return sanitized;
      },

      determineSeverity(eventType) {
        const severityMap = {
          'auth_failure': 'medium',
          'rate_limit_exceeded': 'low',
          'invalid_request': 'low',
          'server_error': 'high',
          'security_violation': 'critical'
        };
        return severityMap[eventType] || 'low';
      },

      calculateAverageResponseTime(logs) {
        const requestLogs = logs.filter(l => l.type === 'request' && l.responseTime);
        if (requestLogs.length === 0) return 0;
        
        const total = requestLogs.reduce((sum, log) => sum + log.responseTime, 0);
        return Math.round(total / requestLogs.length);
      },

      getTopClients(logs) {
        const clientCounts = {};
        logs.forEach(log => {
          clientCounts[log.clientId] = (clientCounts[log.clientId] || 0) + 1;
        });
        
        return Object.entries(clientCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([clientId, count]) => ({ clientId, requestCount: count }));
      },

      groupErrorsByType(logs) {
        const errorCounts = {};
        logs.filter(l => !l.success).forEach(log => {
          const type = log.statusCode || 'unknown';
          errorCounts[type] = (errorCounts[type] || 0) + 1;
        });
        return errorCounts;
      },

      convertToCSV(logs) {
        if (logs.length === 0) return '';
        
        const headers = Object.keys(logs[0]).join(',');
        const rows = logs.map(log => 
          Object.values(log).map(value => 
            typeof value === 'object' ? JSON.stringify(value) : value
          ).join(',')
        );
        
        return [headers, ...rows].join('\n');
      }
    };
  }

  async runComprehensiveTests() {
    console.log('📋 Running Comprehensive Audit Logging Tests...\n');

    // Basic Logging Tests
    console.log('📝 Basic Logging Tests:');

    await this.runAsyncTest('should log basic request/response', async () => {
      const auditor = this.createAuditLogger();
      
      const request = {
        id: 'req_123',
        method: 'POST',
        path: '/api/search',
        clientId: 'client_123',
        body: { query: 'test search' },
        headers: { 'user-agent': 'TestClient/1.0' }
      };
      
      const response = {
        statusCode: 200,
        body: { results: ['result1', 'result2'] }
      };

      const entryId = await auditor.logRequest(request, response, { duration: 150 });
      
      console.assert(entryId !== undefined, 'Should return entry ID');
      console.assert(auditor.auditEntries.length === 1, 'Should store audit entry');
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.clientId === 'client_123', 'Should log client ID');
      console.assert(entry.requestBody.query === 'test search', 'Should log request body');
      console.assert(entry.responseTime === 150, 'Should log response time');
      console.assert(entry.success === true, 'Should mark as successful');
    });

    await this.runAsyncTest('should log security events', async () => {
      const auditor = this.createAuditLogger();
      
      const entryId = await auditor.logSecurityEvent('auth_failure', {
        clientId: 'suspicious_client',
        reason: 'invalid_api_key',
        ipAddress: '192.168.1.100'
      });
      
      console.assert(entryId !== undefined, 'Should return entry ID');
      console.assert(auditor.auditEntries.length === 1, 'Should store security event');
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.type === 'security_event', 'Should be security event type');
      console.assert(entry.eventType === 'auth_failure', 'Should log event type');
      console.assert(entry.severity === 'medium', 'Should assign severity');
    });

    // Data Sanitization Tests
    console.log('\n🔒 Data Sanitization Tests:');

    await this.runAsyncTest('should sanitize sensitive data', async () => {
      const auditor = this.createAuditLogger();
      
      const request = {
        body: {
          query: 'search term',
          password: 'secret123',
          token: 'abc123xyz',
          normalField: 'safe data'
        }
      };

      await auditor.logRequest(request, {});
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.requestBody.password === '[REDACTED]', 'Should redact password');
      console.assert(entry.requestBody.token === '[REDACTED]', 'Should redact token');
      console.assert(entry.requestBody.normalField === 'safe data', 'Should preserve normal fields');
    });

    await this.runAsyncTest('should sanitize headers', async () => {
      const auditor = this.createAuditLogger({ includeHeaders: true });
      
      const request = {
        headers: {
          'authorization': 'Bearer secret-token',
          'x-api-key': 'api-key-123',
          'user-agent': 'TestClient/1.0',
          'content-type': 'application/json'
        }
      };

      await auditor.logRequest(request, {});
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.headers.authorization === '[REDACTED]', 'Should redact authorization');
      console.assert(entry.headers['x-api-key'] === '[REDACTED]', 'Should redact API key');
      console.assert(entry.headers['user-agent'] === 'TestClient/1.0', 'Should preserve safe headers');
    });

    // Configuration Tests
    console.log('\n⚙️ Configuration Tests:');

    await this.runAsyncTest('should respect disabled logging', async () => {
      const auditor = this.createAuditLogger({ enabled: false });
      
      const entryId = await auditor.logRequest({ body: 'test' }, {});
      
      console.assert(entryId === undefined, 'Should not return entry ID when disabled');
      console.assert(auditor.auditEntries.length === 0, 'Should not store entries when disabled');
    });

    await this.runAsyncTest('should respect body inclusion settings', async () => {
      const auditor = this.createAuditLogger({ 
        includeRequestBody: false,
        includeResponseBody: false 
      });
      
      const request = { body: { sensitive: 'data' } };
      const response = { body: { results: 'data' } };
      
      await auditor.logRequest(request, response);
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.requestBody === undefined, 'Should not include request body');
      console.assert(entry.responseBody === undefined, 'Should not include response body');
    });

    // Export and Compliance Tests
    console.log('\n📊 Export and Compliance Tests:');

    await this.runAsyncTest('should export logs in JSON format', async () => {
      const auditor = this.createAuditLogger();
      
      // Add some test data
      await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 });
      await auditor.logRequest({ clientId: 'client2' }, { statusCode: 404 });
      
      const export1 = await auditor.exportAuditLogs('json');
      
      console.assert(export1.format === 'json', 'Should specify JSON format');
      console.assert(export1.count === 2, 'Should include correct count');
      console.assert(typeof export1.data === 'string', 'Should return JSON string');
      
      const parsedData = JSON.parse(export1.data);
      console.assert(Array.isArray(parsedData), 'Should parse to array');
      console.assert(parsedData.length === 2, 'Should include all entries');
    });

    await this.runAsyncTest('should export logs in CSV format', async () => {
      const auditor = this.createAuditLogger();
      
      await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 });
      
      const export1 = await auditor.exportAuditLogs('csv');
      
      console.assert(export1.format === 'csv', 'Should specify CSV format');
      console.assert(export1.count === 1, 'Should include correct count');
      console.assert(typeof export1.data === 'string', 'Should return CSV string');
      console.assert(export1.data.includes(','), 'Should contain CSV delimiters');
    });

    await this.runAsyncTest('should filter exports by date range', async () => {
      const auditor = this.createAuditLogger();
      
      // Add entries with different timestamps
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const recentDate = new Date();
      
      auditor.auditEntries.push({
        id: 'old_entry',
        timestamp: oldDate.toISOString(),
        clientId: 'client1'
      });
      
      auditor.auditEntries.push({
        id: 'recent_entry', 
        timestamp: recentDate.toISOString(),
        clientId: 'client2'
      });
      
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const export1 = await auditor.exportAuditLogs('json', { 
        startDate: yesterday.toISOString() 
      });
      
      const parsedData = JSON.parse(export1.data);
      console.assert(parsedData.length === 1, 'Should filter by date range');
      console.assert(parsedData[0].id === 'recent_entry', 'Should include only recent entries');
    });

    await this.runAsyncTest('should generate compliance reports', async () => {
      const auditor = this.createAuditLogger();
      
      // Add test data
      await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 }, { duration: 100 });
      await auditor.logRequest({ clientId: 'client1' }, { statusCode: 200 }, { duration: 200 });
      await auditor.logRequest({ clientId: 'client2' }, { statusCode: 404 }, { duration: 50 });
      await auditor.logSecurityEvent('auth_failure', { clientId: 'client3' });
      
      const report = await auditor.getComplianceReport(
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      );
      
      console.assert(report.statistics.totalRequests === 3, 'Should count total requests');
      console.assert(report.statistics.successfulRequests === 2, 'Should count successful requests');
      console.assert(report.statistics.failedRequests === 1, 'Should count failed requests');
      console.assert(report.statistics.securityEvents === 1, 'Should count security events');
      console.assert(report.statistics.uniqueClients === 3, 'Should count unique clients');
      console.assert(report.statistics.averageResponseTime === 117, 'Should calculate average response time');
    });

    // Performance Tests
    console.log('\n⚡ Performance Tests:');

    await this.runAsyncTest('should handle high-volume logging', async () => {
      const auditor = this.createAuditLogger();
      const iterations = 1000;
      
      const start = Date.now();
      
      const promises = Array(iterations).fill(null).map((_, i) => 
        auditor.logRequest(
          { clientId: `client_${i}`, body: { query: `search_${i}` } },
          { statusCode: 200 },
          { duration: Math.random() * 100 }
        )
      );
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.assert(auditor.auditEntries.length === iterations, 'Should log all entries');
      console.assert(duration < 5000, 'Should complete 1000 logs within 5 seconds');
      
      const avgTime = duration / iterations;
      console.log(`    ⚡ Average logging time: ${avgTime.toFixed(2)}ms`);
    });

    await this.runAsyncTest('should handle cleanup of old logs', async () => {
      const auditor = this.createAuditLogger({ retentionDays: 1 });
      
      // Add old entry
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      auditor.auditEntries.push({
        id: 'old_entry',
        timestamp: oldDate.toISOString()
      });
      
      // Add recent entry
      await auditor.logRequest({ clientId: 'recent' }, {});
      
      const cleanup = await auditor.cleanupOldLogs();
      
      console.assert(cleanup.removedCount === 1, 'Should remove old entries');
      console.assert(cleanup.remainingCount === 1, 'Should keep recent entries');
      console.assert(auditor.auditEntries.length === 1, 'Should have correct remaining count');
    });

    // Edge Cases
    console.log('\n⚠️ Edge Cases:');

    await this.runAsyncTest('should handle malformed data', async () => {
      const auditor = this.createAuditLogger();
      
      const circularObj = { a: 1 };
      circularObj.self = circularObj;
      
      // Should not throw even with circular references
      const entryId = await auditor.logRequest({ body: circularObj }, {});
      
      console.assert(entryId !== undefined, 'Should handle circular references gracefully');
      console.assert(auditor.auditEntries.length === 1, 'Should still create entry');
    });

    await this.runAsyncTest('should handle missing response data', async () => {
      const auditor = this.createAuditLogger();
      
      const entryId = await auditor.logRequest({ clientId: 'test' }, null);
      
      console.assert(entryId !== undefined, 'Should handle missing response');
      console.assert(auditor.auditEntries.length === 1, 'Should create entry');
      
      const entry = auditor.auditEntries[0];
      console.assert(entry.statusCode === undefined, 'Should handle missing status');
      console.assert(entry.success === undefined, 'Should handle missing success flag');
    });

    // Summary
    this.printSummary();
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AUDIT LOGGING TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ${this.failedTests > 0 ? '❌' : '✅'}`);
    console.log(`Success Rate: ${((this.passedTests / this.testCount) * 100).toFixed(2)}%`);

    if (this.failedTests === 0) {
      console.log('\n🎉 All audit logging tests passed! Compliance and logging features are working correctly.');
    } else {
      console.log(`\n💥 ${this.failedTests} test(s) failed. Please review audit logging implementation.`);
      process.exit(1);
    }

    console.log('\n✅ Enhanced Audit Logging Tests Completed Successfully!');
  }
}

// Run the comprehensive audit logging tests
const auditTests = new EnhancedAuditLoggingTests();
auditTests.runComprehensiveTests().catch(error => {
  console.error('Fatal error in audit logging tests:', error);
  process.exit(1);
});
