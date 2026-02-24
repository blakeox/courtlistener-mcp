/**
 * Request correlation and audit logging for Legal MCP Server
 * Provides request tracking and compliance audit trails
 */

import { Logger } from '../infrastructure/logger.js';
import { AuthContext } from './authentication.js';
import { cryptoId } from '../common/utils.js';

export interface CorrelationConfig {
  enabled: boolean;
  headerName: string;
  generateId: boolean;
}

export interface AuditConfig {
  enabled: boolean;
  logLevel: string;
  includeRequestBody: boolean;
  includeResponseBody: boolean;
  maxBodyLength: number;
  sensitiveFields: string[];
}

export interface AuditEvent {
  correlationId: string;
  timestamp: string;
  method: string;
  toolName?: string;
  clientId?: string;
  authContext: AuthContext;
  requestArgs?: Record<string, unknown>;
  responseData?: unknown;
  duration: number;
  success: boolean;
  error?: string;
  userAgent?: string;
  ipAddress?: string;
}

export class RequestCorrelation {
  private static currentId: string | null = null;

  /**
   * Generate a new correlation ID
   */
  static generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = cryptoId();
    return `${timestamp}-${random}`;
  }

  /**
   * Set the current correlation ID for this request
   */
  static setId(id: string): void {
    RequestCorrelation.currentId = id;
  }

  /**
   * Get the current correlation ID
   */
  static getId(): string {
    return RequestCorrelation.currentId || 'no-correlation';
  }

  /**
   * Clear the current correlation ID
   */
  static clear(): void {
    RequestCorrelation.currentId = null;
  }
}

export class AuditLogger {
  private logger: Logger;
  private correlationConfig: CorrelationConfig;
  private auditConfig: AuditConfig;

  constructor(logger: Logger, correlationConfig: CorrelationConfig, auditConfig: AuditConfig) {
    this.logger = logger.child('Audit');
    this.correlationConfig = correlationConfig;
    this.auditConfig = auditConfig;

    if (this.auditConfig.enabled) {
      this.logger.info('Audit logging enabled', {
        includeRequestBody: this.auditConfig.includeRequestBody,
        includeResponseBody: this.auditConfig.includeResponseBody,
        maxBodyLength: this.auditConfig.maxBodyLength,
      });
    }
  }

  /**
   * Extract or generate correlation ID from headers
   */
  extractCorrelationId(headers: Record<string, string>): string {
    if (!this.correlationConfig.enabled) {
      return 'correlation-disabled';
    }

    const existingId = headers[this.correlationConfig.headerName.toLowerCase()];

    if (existingId) {
      return existingId;
    }

    if (this.correlationConfig.generateId) {
      return RequestCorrelation.generateId();
    }

    return 'no-correlation';
  }

  /**
   * Log an audit event
   */
  logAuditEvent(event: AuditEvent): void {
    if (!this.auditConfig.enabled) {
      return;
    }

    // Remove sensitive data
    const sanitizedEvent = this.sanitizeAuditEvent(event);

    // Log at specified level
    const logMethod = this.logger[this.auditConfig.logLevel as keyof Logger] as Function;
    if (typeof logMethod === 'function') {
      logMethod.call(this.logger, 'MCP Audit Event', sanitizedEvent);
    } else {
      this.logger.info('MCP Audit Event', sanitizedEvent as unknown as Record<string, unknown>);
    }
  }

  /**
   * Create audit event for tool execution
   */
  createToolAuditEvent(
    correlationId: string,
    toolName: string,
    authContext: AuthContext,
    requestArgs: Record<string, unknown>,
    responseData: unknown,
    duration: number,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return {
      correlationId,
      timestamp: new Date().toISOString(),
      method: 'tools/call',
      toolName,
      clientId: authContext.clientId,
      authContext: {
        isAuthenticated: authContext.isAuthenticated,
        permissions: authContext.permissions,
      },
      requestArgs: this.auditConfig.includeRequestBody
        ? (this.truncateData(requestArgs) as Record<string, unknown>)
        : undefined,
      responseData: this.auditConfig.includeResponseBody
        ? this.truncateData(responseData)
        : undefined,
      duration,
      success,
      error,
      ...metadata,
    };
  }

  /**
   * Create audit event for authentication
   */
  createAuthAuditEvent(
    correlationId: string,
    authContext: AuthContext,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>,
  ): AuditEvent {
    return {
      correlationId,
      timestamp: new Date().toISOString(),
      method: 'authenticate',
      clientId: authContext.clientId,
      authContext: {
        isAuthenticated: authContext.isAuthenticated,
        permissions: authContext.permissions,
      },
      duration: 0,
      success,
      error,
      ...metadata,
    };
  }

  /**
   * Remove sensitive information from audit events
   */
  private sanitizeAuditEvent(event: AuditEvent): AuditEvent {
    const sanitized = { ...event };

    // Remove sensitive fields from request args
    if (sanitized.requestArgs) {
      sanitized.requestArgs = this.removeSensitiveFields(sanitized.requestArgs) as Record<
        string,
        unknown
      >;
    }

    // Remove sensitive fields from response data
    if (sanitized.responseData) {
      sanitized.responseData = this.removeSensitiveFields(sanitized.responseData);
    }

    // Never log API keys in full
    if (sanitized.authContext?.apiKey) {
      sanitized.authContext = {
        ...sanitized.authContext,
        apiKey: sanitized.authContext.apiKey.substring(0, 8) + '...',
      };
    }

    return sanitized;
  }

  /**
   * Remove sensitive fields from data
   */
  private removeSensitiveFields(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const cleaned: Record<string, unknown> = Array.isArray(data)
      ? ([...data] as unknown as Record<string, unknown>)
      : { ...(data as Record<string, unknown>) };

    for (const field of this.auditConfig.sensitiveFields) {
      if (field in cleaned) {
        cleaned[field] = '[REDACTED]';
      }
    }

    // Recursively clean nested objects
    for (const [key, value] of Object.entries(cleaned)) {
      if (value && typeof value === 'object') {
        cleaned[key] = this.removeSensitiveFields(value);
      }
    }

    return cleaned;
  }

  /**
   * Truncate data to maximum length
   */
  private truncateData(data: unknown): unknown {
    if (!data) {
      return data;
    }

    const jsonString = JSON.stringify(data);

    if (jsonString.length <= this.auditConfig.maxBodyLength) {
      return data;
    }

    const truncated = jsonString.substring(0, this.auditConfig.maxBodyLength);

    try {
      return JSON.parse(truncated + '"}') as unknown;
    } catch {
      return {
        _truncated: true,
        _originalLength: jsonString.length,
        _data: truncated,
      };
    }
  }
}

/**
 * Create correlation and audit components from environment
 */
export function createAuditComponents(logger: Logger): {
  correlation: CorrelationConfig;
  audit: AuditLogger;
} {
  const correlationConfig: CorrelationConfig = {
    enabled: process.env.CORRELATION_ENABLED !== 'false',
    headerName: process.env.CORRELATION_HEADER_NAME || 'x-correlation-id',
    generateId: process.env.CORRELATION_GENERATE_ID !== 'false',
  };

  const auditConfig: AuditConfig = {
    enabled: process.env.AUDIT_ENABLED === 'true',
    logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
    includeRequestBody: process.env.AUDIT_INCLUDE_REQUEST_BODY === 'true',
    includeResponseBody: process.env.AUDIT_INCLUDE_RESPONSE_BODY === 'true',
    maxBodyLength: parseInt(process.env.AUDIT_MAX_BODY_LENGTH || '2000'),
    sensitiveFields: process.env.AUDIT_SENSITIVE_FIELDS
      ? process.env.AUDIT_SENSITIVE_FIELDS.split(',').map((f) => f.trim())
      : ['password', 'token', 'secret', 'key', 'auth'],
  };

  const audit = new AuditLogger(logger, correlationConfig, auditConfig);

  return { correlation: correlationConfig, audit };
}
