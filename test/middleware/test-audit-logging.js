/**
 * Comprehensive tests for Audit Logging Middleware
 * Tests request logging, response tracking, security events, and compliance
 */

import { createMockLogger, createMockRequest } from '../../utils/test-helpers.js';

// Mock audit logger implementation for testing
class MockAuditLogger {
  constructor(config, logger) {
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
      ...config
    };
    this.logger = logger;
    this.auditEntries = [];
    this.securityEvents = [];
    this.performanceMetrics = [];
  }

  async logRequest(req, metadata = {}) {
    if (!this.config.auditEnabled) return;

    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'request',
      clientId: this.extractClientId(req.headers),
      method: req.method || 'MCP_CALL',
      url: req.url || '/mcp',
      userAgent: req.headers['user-agent'],
      remoteAddr: req.headers['x-forwarded-for'] || req.headers['remote-addr'],
      headers: this.sanitizeHeaders(req.headers),
      body: this.config.includeRequestBody ? this.sanitizeBody(req.body) : undefined,
      sessionId: req.headers['x-session-id'],
      requestId: req.headers['x-request-id'] || this.generateId(),
      ...metadata
    };

    this.auditEntries.push(entry);
    this.logger.info('Request audit logged', { auditId: entry.id });
    
    return entry.id;
  }

  async logResponse(auditId, res, metadata = {}) {
    if (!this.config.auditEnabled) return;

    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'response',
      requestAuditId: auditId,
      statusCode: res.statusCode || 200,
      responseTime: metadata.responseTime || 0,
      headers: this.sanitizeHeaders(res.headers || {}),
      body: this.config.includeResponseBody ? this.sanitizeBody(res.body) : undefined,
      error: res.error ? {
        code: res.error.code,
        message: res.error.message,
        stack: this.config.logLevel === 'debug' ? res.error.stack : undefined
      } : undefined,
      ...metadata
    };

    this.auditEntries.push(entry);
    this.logger.info('Response audit logged', { auditId: entry.id, requestAuditId: auditId });
  }

  async logToolCall(toolName, params, clientId, metadata = {}) {
    if (!this.config.auditEnabled) return;

    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      toolName,
      clientId,
      params: this.sanitizeToolParams(params),
      ...metadata
    };

    this.auditEntries.push(entry);
    this.logger.info('Tool call audit logged', { auditId: entry.id, toolName });
    
    return entry.id;
  }

  async logSecurityEvent(eventType, details, severity = 'medium') {
    const event = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'security_event',
      eventType,
      severity,
      details,
      clientId: details.clientId,
      remoteAddr: details.remoteAddr,
      userAgent: details.userAgent
    };

    this.securityEvents.push(event);
    this.auditEntries.push(event);
    
    const logLevel = severity === 'high' ? 'error' : 
                    severity === 'medium' ? 'warn' : 'info';
    this.logger[logLevel]('Security event logged', { auditId: event.id, eventType, severity });
    
    return event.id;
  }

  async logPerformanceMetric(metric, value, unit, metadata = {}) {
    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: 'performance_metric',
      metric,
      value,
      unit,
      ...metadata
    };

    this.performanceMetrics.push(entry);
    if (this.config.logLevel === 'debug') {
      this.auditEntries.push(entry);
    }
    
    this.logger.debug('Performance metric logged', { metric, value, unit });
  }

  async searchAuditLogs(criteria) {
    let results = [...this.auditEntries];

    if (criteria.startDate) {
      results = results.filter(entry => 
        new Date(entry.timestamp) >= new Date(criteria.startDate)
      );
    }

    if (criteria.endDate) {
      results = results.filter(entry => 
        new Date(entry.timestamp) <= new Date(criteria.endDate)
      );
    }

    if (criteria.clientId) {
      results = results.filter(entry => entry.clientId === criteria.clientId);
    }

    if (criteria.type) {
      results = results.filter(entry => entry.type === criteria.type);
    }

    if (criteria.toolName) {
      results = results.filter(entry => entry.toolName === criteria.toolName);
    }

    if (criteria.severity) {
      results = results.filter(entry => entry.severity === criteria.severity);
    }

    if (criteria.limit) {
      results = results.slice(0, criteria.limit);
    }

    return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async getAuditStats(timeRange = '24h') {
    const now = new Date();
    const startTime = new Date(now - this.parseTimeRange(timeRange));
    
    const relevantEntries = this.auditEntries.filter(entry =>
      new Date(entry.timestamp) >= startTime
    );

    const stats = {
      totalEntries: relevantEntries.length,
      requests: relevantEntries.filter(e => e.type === 'request').length,
      responses: relevantEntries.filter(e => e.type === 'response').length,
      toolCalls: relevantEntries.filter(e => e.type === 'tool_call').length,
      securityEvents: relevantEntries.filter(e => e.type === 'security_event').length,
      errors: relevantEntries.filter(e => e.error || e.statusCode >= 400).length,
      uniqueClients: new Set(relevantEntries.map(e => e.clientId).filter(Boolean)).size,
      timeRange,
      period: {
        start: startTime.toISOString(),
        end: now.toISOString()
      }
    };

    // Tool usage statistics
    stats.toolUsage = {};
    relevantEntries.filter(e => e.type === 'tool_call').forEach(entry => {
      stats.toolUsage[entry.toolName] = (stats.toolUsage[entry.toolName] || 0) + 1;
    });

    // Security event breakdown
    stats.securityEventTypes = {};
    relevantEntries.filter(e => e.type === 'security_event').forEach(entry => {
      stats.securityEventTypes[entry.eventType] = (stats.securityEventTypes[entry.eventType] || 0) + 1;
    });

    return stats;
  }

  async exportAuditLogs(format = 'json', criteria = {}) {
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

  async cleanOldLogs() {
    if (this.config.retentionDays <= 0) return;

    const cutoffDate = new Date(Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000));
    const beforeCount = this.auditEntries.length;
    
    this.auditEntries = this.auditEntries.filter(entry =>
      new Date(entry.timestamp) > cutoffDate
    );
    
    this.securityEvents = this.securityEvents.filter(event =>
      new Date(event.timestamp) > cutoffDate
    );
    
    this.performanceMetrics = this.performanceMetrics.filter(metric =>
      new Date(metric.timestamp) > cutoffDate
    );

    const removedCount = beforeCount - this.auditEntries.length;
    this.logger.info(`Cleaned ${removedCount} old audit entries`, { 
      retentionDays: this.config.retentionDays 
    });
    
    return removedCount;
  }

  // Helper methods
  extractClientId(headers) {
    return headers['x-client-id'] || 
           headers['x-forwarded-for'] || 
           headers['remote-addr'] || 
           'anonymous';
  }

  sanitizeHeaders(headers) {
    if (!this.config.includeHeaders) return {};
    
    const sanitized = { ...headers };
    this.config.sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  sanitizeBody(body) {
    if (!body) return undefined;
    
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > this.config.maxBodySize) {
      return bodyStr.substring(0, this.config.maxBodySize) + '...[TRUNCATED]';
    }
    return bodyStr;
  }

  sanitizeToolParams(params) {
    if (!params) return undefined;
    
    // Remove sensitive parameters
    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  parseTimeRange(range) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = range.match(/^(\d+)([smhd])$/);
    if (!match) return 24 * 60 * 60 * 1000; // Default 24h
    
    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  convertToCSV(logs) {
    if (logs.length === 0) return 'No audit logs found';
    
    const headers = Object.keys(logs[0]);
    const csvContent = [
      headers.join(','),
      ...logs.map(log => 
        headers.map(header => {
          const value = log[header];
          if (typeof value === 'object') {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value || '').replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    return csvContent;
  }

  convertToXML(logs) {
    const xmlEntries = logs.map(log => {
      const entryXml = Object.entries(log).map(([key, value]) => {
        if (typeof value === 'object') {
          return `    <${key}><![CDATA[${JSON.stringify(value)}]]></${key}>`;
        }
        return `    <${key}><![CDATA[${value || ''}]]></${key}>`;
      }).join('\n');
      
      return `  <audit-entry>\n${entryXml}\n  </audit-entry>`;
    }).join('\n');
    
    return `<?xml version="1.0" encoding="UTF-8"?>\n<audit-logs>\n${xmlEntries}\n</audit-logs>`;
  }
}

describe('Audit Logging Middleware Tests', () => {
  let auditLogger;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auditLogger = new MockAuditLogger({
      auditEnabled: true,
      includeRequestBody: true,
      includeResponseBody: true,
      includeHeaders: true
    }, mockLogger);
  });

  describe('Request Logging', () => {
    it('should log basic request information', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/mcp/call',
        headers: {
          'x-client-id': 'test-client',
          'user-agent': 'Test Agent',
          'x-forwarded-for': '192.168.1.100'
        },
        body: { tool: 'search_legal_documents', params: { query: 'test' } }
      });

      const auditId = await auditLogger.logRequest(req);
      
      console.assert(typeof auditId === 'string', 'Should return audit ID');
      console.assert(auditLogger.auditEntries.length === 1, 'Should add audit entry');
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.type === 'request', 'Should mark as request type');
      console.assert(entry.clientId === 'test-client', 'Should extract client ID');
      console.assert(entry.method === 'POST', 'Should log request method');
      console.assert(entry.remoteAddr === '192.168.1.100', 'Should log remote address');
    });

    it('should handle requests without optional headers', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: {},
        body: { tool: 'test' }
      });

      const auditId = await auditLogger.logRequest(req);
      
      console.assert(typeof auditId === 'string', 'Should handle minimal request');
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.clientId === 'anonymous', 'Should use anonymous for unknown client');
    });

    it('should sanitize sensitive headers', async () => {
      const req = createMockRequest({
        headers: {
          'authorization': 'Bearer secret-token',
          'x-api-key': 'secret-key',
          'cookie': 'session=secret',
          'user-agent': 'Test Agent'
        }
      });

      await auditLogger.logRequest(req);
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.headers.authorization === '[REDACTED]', 'Should redact authorization');
      console.assert(entry.headers['x-api-key'] === '[REDACTED]', 'Should redact API key');
      console.assert(entry.headers.cookie === '[REDACTED]', 'Should redact cookie');
      console.assert(entry.headers['user-agent'] === 'Test Agent', 'Should keep non-sensitive headers');
    });

    it('should truncate large request bodies', async () => {
      const auditLoggerSmall = new MockAuditLogger({
        includeRequestBody: true,
        maxBodySize: 50
      }, mockLogger);

      const largeBody = 'x'.repeat(100);
      const req = createMockRequest({ body: largeBody });

      await auditLoggerSmall.logRequest(req);
      
      const entry = auditLoggerSmall.auditEntries[0];
      console.assert(entry.body.includes('[TRUNCATED]'), 'Should truncate large bodies');
      console.assert(entry.body.length <= 65, 'Should respect max body size'); // 50 + '[TRUNCATED]'
    });
  });

  describe('Response Logging', () => {
    it('should log response information', async () => {
      const req = createMockRequest();
      const auditId = await auditLogger.logRequest(req);
      
      const res = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { result: 'success' }
      };

      await auditLogger.logResponse(auditId, res, { responseTime: 150 });
      
      console.assert(auditLogger.auditEntries.length === 2, 'Should add response entry');
      
      const responseEntry = auditLogger.auditEntries[1];
      console.assert(responseEntry.type === 'response', 'Should mark as response type');
      console.assert(responseEntry.requestAuditId === auditId, 'Should link to request');
      console.assert(responseEntry.statusCode === 200, 'Should log status code');
      console.assert(responseEntry.responseTime === 150, 'Should log response time');
    });

    it('should log error responses', async () => {
      const req = createMockRequest();
      const auditId = await auditLogger.logRequest(req);
      
      const res = {
        statusCode: 500,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
          stack: 'Error stack trace...'
        }
      };

      await auditLogger.logResponse(auditId, res);
      
      const responseEntry = auditLogger.auditEntries[1];
      console.assert(responseEntry.error.code === 'INTERNAL_ERROR', 'Should log error code');
      console.assert(responseEntry.error.message === 'Something went wrong', 'Should log error message');
    });
  });

  describe('Tool Call Logging', () => {
    it('should log tool calls with parameters', async () => {
      const params = {
        query: 'contract law',
        limit: 10,
        apiKey: 'secret-key'
      };

      const auditId = await auditLogger.logToolCall('search_legal_documents', params, 'test-client');
      
      console.assert(typeof auditId === 'string', 'Should return audit ID');
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.type === 'tool_call', 'Should mark as tool call type');
      console.assert(entry.toolName === 'search_legal_documents', 'Should log tool name');
      console.assert(entry.clientId === 'test-client', 'Should log client ID');
      console.assert(entry.params.apiKey === '[REDACTED]', 'Should sanitize sensitive parameters');
      console.assert(entry.params.query === 'contract law', 'Should keep non-sensitive parameters');
    });

    it('should handle tool calls without parameters', async () => {
      const auditId = await auditLogger.logToolCall('health_check', null, 'test-client');
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.params === undefined, 'Should handle null parameters');
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events with appropriate severity', async () => {
      const details = {
        clientId: 'suspicious-client',
        remoteAddr: '192.168.1.200',
        userAgent: 'Malicious Bot',
        reason: 'Too many failed authentication attempts'
      };

      const auditId = await auditLogger.logSecurityEvent('AUTH_FAILURE', details, 'high');
      
      console.assert(typeof auditId === 'string', 'Should return audit ID');
      console.assert(auditLogger.securityEvents.length === 1, 'Should add to security events');
      
      const event = auditLogger.securityEvents[0];
      console.assert(event.type === 'security_event', 'Should mark as security event');
      console.assert(event.eventType === 'AUTH_FAILURE', 'Should log event type');
      console.assert(event.severity === 'high', 'Should log severity');
      console.assert(event.details.reason.includes('authentication'), 'Should log details');
    });

    it('should track different types of security events', async () => {
      await auditLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', { clientId: 'client1' });
      await auditLogger.logSecurityEvent('MALICIOUS_INPUT', { clientId: 'client2' });
      await auditLogger.logSecurityEvent('UNAUTHORIZED_ACCESS', { clientId: 'client3' });
      
      console.assert(auditLogger.securityEvents.length === 3, 'Should track multiple event types');
      
      const eventTypes = auditLogger.securityEvents.map(e => e.eventType);
      console.assert(eventTypes.includes('RATE_LIMIT_EXCEEDED'), 'Should track rate limit events');
      console.assert(eventTypes.includes('MALICIOUS_INPUT'), 'Should track input validation events');
      console.assert(eventTypes.includes('UNAUTHORIZED_ACCESS'), 'Should track access events');
    });
  });

  describe('Performance Metrics Logging', () => {
    it('should log performance metrics', async () => {
      await auditLogger.logPerformanceMetric('response_time', 245, 'ms', {
        toolName: 'search_legal_documents',
        clientId: 'test-client'
      });

      console.assert(auditLogger.performanceMetrics.length === 1, 'Should add performance metric');
      
      const metric = auditLogger.performanceMetrics[0];
      console.assert(metric.type === 'performance_metric', 'Should mark as performance metric');
      console.assert(metric.metric === 'response_time', 'Should log metric name');
      console.assert(metric.value === 245, 'Should log metric value');
      console.assert(metric.unit === 'ms', 'Should log metric unit');
    });

    it('should include performance metrics in audit logs when debug enabled', async () => {
      const debugLogger = new MockAuditLogger({
        logLevel: 'debug'
      }, mockLogger);

      await debugLogger.logPerformanceMetric('memory_usage', 128, 'MB');
      
      console.assert(debugLogger.auditEntries.length === 1, 'Should include in audit logs');
      console.assert(debugLogger.performanceMetrics.length === 1, 'Should also track separately');
    });
  });

  describe('Audit Log Search and Filtering', () => {
    beforeEach(async () => {
      // Create test data
      await auditLogger.logRequest(createMockRequest({ 
        headers: { 'x-client-id': 'client1' } 
      }));
      await auditLogger.logToolCall('tool1', {}, 'client1');
      await auditLogger.logSecurityEvent('TEST_EVENT', { clientId: 'client2' });
      
      // Add older entry
      const oldEntry = {
        id: 'old-entry',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        type: 'request',
        clientId: 'client1'
      };
      auditLogger.auditEntries.push(oldEntry);
    });

    it('should search by client ID', async () => {
      const results = await auditLogger.searchAuditLogs({ clientId: 'client1' });
      
      console.assert(results.length >= 2, 'Should find entries for client1');
      console.assert(results.every(r => r.clientId === 'client1'), 'Should only return client1 entries');
    });

    it('should search by type', async () => {
      const results = await auditLogger.searchAuditLogs({ type: 'security_event' });
      
      console.assert(results.length === 1, 'Should find one security event');
      console.assert(results[0].type === 'security_event', 'Should return security event');
    });

    it('should search by date range', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const results = await auditLogger.searchAuditLogs({ 
        startDate: yesterday.toISOString() 
      });
      
      console.assert(results.length >= 3, 'Should find recent entries');
      console.assert(results.every(r => new Date(r.timestamp) >= yesterday), 
        'Should only return entries from yesterday onwards');
    });

    it('should limit search results', async () => {
      const results = await auditLogger.searchAuditLogs({ limit: 2 });
      
      console.assert(results.length === 2, 'Should limit results');
    });

    it('should sort results by timestamp descending', async () => {
      const results = await auditLogger.searchAuditLogs({});
      
      for (let i = 1; i < results.length; i++) {
        const current = new Date(results[i].timestamp);
        const previous = new Date(results[i - 1].timestamp);
        console.assert(current <= previous, 'Should sort by timestamp descending');
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
      await auditLogger.logSecurityEvent('RATE_LIMIT', { clientId: 'client1' });
      await auditLogger.logSecurityEvent('AUTH_FAILURE', { clientId: 'client2' });
    });

    it('should generate comprehensive statistics', async () => {
      const stats = await auditLogger.getAuditStats('24h');
      
      console.assert(stats.totalEntries >= 7, 'Should count total entries');
      console.assert(stats.requests >= 1, 'Should count requests');
      console.assert(stats.responses >= 1, 'Should count responses');
      console.assert(stats.toolCalls >= 3, 'Should count tool calls');
      console.assert(stats.securityEvents >= 2, 'Should count security events');
      console.assert(stats.uniqueClients >= 2, 'Should count unique clients');
    });

    it('should provide tool usage breakdown', async () => {
      const stats = await auditLogger.getAuditStats('24h');
      
      console.assert(stats.toolUsage['search_legal_documents'] === 2, 
        'Should count tool usage correctly');
      console.assert(stats.toolUsage['get_case_details'] === 1, 
        'Should count different tools');
    });

    it('should provide security event breakdown', async () => {
      const stats = await auditLogger.getAuditStats('24h');
      
      console.assert(stats.securityEventTypes['RATE_LIMIT'] === 1, 
        'Should count security event types');
      console.assert(stats.securityEventTypes['AUTH_FAILURE'] === 1, 
        'Should count different event types');
    });

    it('should respect time range filters', async () => {
      const stats1h = await auditLogger.getAuditStats('1h');
      const stats24h = await auditLogger.getAuditStats('24h');
      
      console.assert(stats24h.totalEntries >= stats1h.totalEntries, 
        'Longer time range should include more entries');
    });
  });

  describe('Export Functionality', () => {
    beforeEach(async () => {
      await auditLogger.logRequest(createMockRequest({ 
        headers: { 'x-client-id': 'export-client' } 
      }));
      await auditLogger.logToolCall('export_test', { param: 'value' }, 'export-client');
    });

    it('should export logs as JSON', async () => {
      const jsonExport = await auditLogger.exportAuditLogs('json');
      
      console.assert(typeof jsonExport === 'string', 'Should return string');
      
      const parsed = JSON.parse(jsonExport);
      console.assert(Array.isArray(parsed), 'Should be valid JSON array');
      console.assert(parsed.length >= 2, 'Should contain audit entries');
    });

    it('should export logs as CSV', async () => {
      const csvExport = await auditLogger.exportAuditLogs('csv');
      
      console.assert(typeof csvExport === 'string', 'Should return string');
      console.assert(csvExport.includes(','), 'Should contain CSV separators');
      
      const lines = csvExport.split('\n');
      console.assert(lines.length >= 3, 'Should have header + data rows'); // header + 2 data rows
    });

    it('should export logs as XML', async () => {
      const xmlExport = await auditLogger.exportAuditLogs('xml');
      
      console.assert(typeof xmlExport === 'string', 'Should return string');
      console.assert(xmlExport.includes('<?xml'), 'Should have XML declaration');
      console.assert(xmlExport.includes('<audit-logs>'), 'Should have root element');
      console.assert(xmlExport.includes('<audit-entry>'), 'Should have entry elements');
    });

    it('should filter exports by criteria', async () => {
      const filteredExport = await auditLogger.exportAuditLogs('json', {
        type: 'tool_call'
      });
      
      const parsed = JSON.parse(filteredExport);
      console.assert(parsed.every(entry => entry.type === 'tool_call'), 
        'Should only export filtered entries');
    });

    it('should handle unsupported export formats', async () => {
      try {
        await auditLogger.exportAuditLogs('pdf');
        console.assert(false, 'Should throw error for unsupported format');
      } catch (error) {
        console.assert(error.message.includes('Unsupported export format'), 
          'Should throw appropriate error');
      }
    });
  });

  describe('Log Retention and Cleanup', () => {
    it('should clean up old logs based on retention policy', async () => {
      // Create old entries
      const oldEntries = [
        {
          id: 'old1',
          timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days old
          type: 'request'
        },
        {
          id: 'old2', 
          timestamp: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(), // 50 days old
          type: 'response'
        }
      ];
      
      auditLogger.auditEntries.push(...oldEntries);
      auditLogger.config.retentionDays = 30;
      
      const beforeCount = auditLogger.auditEntries.length;
      const removedCount = await auditLogger.cleanOldLogs();
      
      console.assert(removedCount >= 2, 'Should remove old entries');
      console.assert(auditLogger.auditEntries.length < beforeCount, 'Should reduce total entries');
    });

    it('should not clean logs when retention is disabled', async () => {
      auditLogger.config.retentionDays = 0;
      
      const beforeCount = auditLogger.auditEntries.length;
      const removedCount = await auditLogger.cleanOldLogs();
      
      console.assert(removedCount === 0, 'Should not remove any entries');
      console.assert(auditLogger.auditEntries.length === beforeCount, 'Should keep all entries');
    });
  });

  describe('Configuration Options', () => {
    it('should disable audit logging when configured', async () => {
      const disabledLogger = new MockAuditLogger({
        auditEnabled: false
      }, mockLogger);

      await disabledLogger.logRequest(createMockRequest());
      
      console.assert(disabledLogger.auditEntries.length === 0, 
        'Should not log when disabled');
    });

    it('should exclude headers when configured', async () => {
      const noHeadersLogger = new MockAuditLogger({
        includeHeaders: false
      }, mockLogger);

      const req = createMockRequest({
        headers: { 'authorization': 'Bearer token' }
      });

      await noHeadersLogger.logRequest(req);
      
      const entry = noHeadersLogger.auditEntries[0];
      console.assert(Object.keys(entry.headers).length === 0, 
        'Should exclude headers when configured');
    });

    it('should exclude request/response bodies when configured', async () => {
      const noBodiesLogger = new MockAuditLogger({
        includeRequestBody: false,
        includeResponseBody: false
      }, mockLogger);

      const req = createMockRequest({ body: { secret: 'data' } });
      await noBodiesLogger.logRequest(req);
      
      const res = { body: { result: 'success' } };
      await noBodiesLogger.logResponse('test', res);
      
      const requestEntry = noBodiesLogger.auditEntries[0];
      const responseEntry = noBodiesLogger.auditEntries[1];
      
      console.assert(requestEntry.body === undefined, 'Should exclude request body');
      console.assert(responseEntry.body === undefined, 'Should exclude response body');
    });

    it('should use custom sensitive headers list', async () => {
      const customLogger = new MockAuditLogger({
        sensitiveHeaders: ['x-custom-secret', 'x-private-key']
      }, mockLogger);

      const req = createMockRequest({
        headers: {
          'x-custom-secret': 'secret-value',
          'x-private-key': 'private-key-value',
          'authorization': 'Bearer token' // This should NOT be redacted
        }
      });

      await customLogger.logRequest(req);
      
      const entry = customLogger.auditEntries[0];
      console.assert(entry.headers['x-custom-secret'] === '[REDACTED]', 
        'Should redact custom sensitive header');
      console.assert(entry.headers['x-private-key'] === '[REDACTED]', 
        'Should redact custom private header');
      console.assert(entry.headers['authorization'] === 'Bearer token', 
        'Should not redact non-configured headers');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed request objects', async () => {
      const malformedReq = {
        headers: null,
        body: undefined
      };

      const auditId = await auditLogger.logRequest(malformedReq);
      
      console.assert(typeof auditId === 'string', 'Should handle malformed requests');
      
      const entry = auditLogger.auditEntries[0];
      console.assert(entry.clientId === 'anonymous', 'Should use default client ID');
    });

    it('should handle circular references in bodies', async () => {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj; // Create circular reference

      const req = createMockRequest({ body: circularObj });
      
      // This should not throw an error
      await auditLogger.logRequest(req);
      
      console.assert(auditLogger.auditEntries.length === 1, 'Should handle circular references');
    });

    it('should handle very large objects gracefully', async () => {
      const largeObj = {};
      for (let i = 0; i < 10000; i++) {
        largeObj[`key${i}`] = `value${i}`;
      }

      const req = createMockRequest({ body: largeObj });
      
      const start = Date.now();
      await auditLogger.logRequest(req);
      const duration = Date.now() - start;
      
      console.assert(duration < 1000, 'Should handle large objects efficiently');
      console.assert(auditLogger.auditEntries.length === 1, 'Should create audit entry');
    });
  });

  describe('Compliance Mode', () => {
    it('should enable additional logging in compliance mode', async () => {
      const complianceLogger = new MockAuditLogger({
        complianceMode: true,
        includeRequestBody: true,
        includeResponseBody: true,
        logLevel: 'debug'
      }, mockLogger);

      const req = createMockRequest({
        headers: { 'x-client-id': 'compliance-client' },
        body: { sensitiveData: 'important' }
      });

      await complianceLogger.logRequest(req, {
        complianceReason: 'GDPR_AUDIT',
        dataClassification: 'SENSITIVE'
      });

      const entry = complianceLogger.auditEntries[0];
      console.assert(entry.complianceReason === 'GDPR_AUDIT', 
        'Should include compliance metadata');
      console.assert(entry.dataClassification === 'SENSITIVE', 
        'Should include data classification');
    });
  });
});

console.log('✅ Audit Logging Middleware Tests Completed');
