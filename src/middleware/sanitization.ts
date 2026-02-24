/**
 * Enhanced input sanitization and validation for Legal MCP Server
 * Provides protection against injection attacks and malformed input
 */

import { Logger } from '../infrastructure/logger.js';
import { getConfig } from '../infrastructure/config.js';

export interface SanitizationConfig {
  enabled: boolean;
  maxStringLength: number;
  maxArrayLength: number;
  maxObjectDepth: number;
  allowedTags: string[];
  blockedPatterns: RegExp[];
}

/**
 * Sanitizable value types - recursive union for any JSON-like structure
 */
export type SanitizableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SanitizableValue[]
  | { [key: string]: SanitizableValue };

/**
 * JSON Schema for validation
 */
export interface JsonSchema {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  required?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface SanitizationResult {
  sanitized: SanitizableValue;
  warnings: string[];
  blocked: boolean;
  reason?: string;
}

export class InputSanitizer {
  private logger: Logger;
  private config: SanitizationConfig;

  // Common injection patterns to detect and block
  private static readonly INJECTION_PATTERNS = [
    /<script[\s>\/]/gi, // Script tags (opening)
    /(javascript:|data:|vbscript:)/gi, // Protocol handlers
    /(on\w+\s*=)/gi, // Event handlers
    /(<iframe|<object|<embed|<link|<meta)/gi, // Dangerous HTML tags
    /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/gi, // SQL injection
    /(eval\s*\(|function\s*\(|setTimeout\s*\(|setInterval\s*\()/gi, // Code execution
    /(\$\{.*\}|<%.*%>|{{.*}})/gi, // Template injection
  ];

  constructor(logger: Logger, config?: Partial<SanitizationConfig>) {
    this.logger = logger.child('InputSanitizer');

    this.config = {
      enabled: true,
      maxStringLength: 10000,
      maxArrayLength: 1000,
      maxObjectDepth: 10,
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
      blockedPatterns: InputSanitizer.INJECTION_PATTERNS,
      ...config,
    };

    if (this.config.enabled) {
      this.logger.info('Input sanitization enabled', {
        maxStringLength: this.config.maxStringLength,
        maxArrayLength: this.config.maxArrayLength,
        maxObjectDepth: this.config.maxObjectDepth,
        blockedPatterns: this.config.blockedPatterns.length,
      });
    }
  }

  /**
   * Sanitize and validate input data
   */
  sanitize(input: unknown, path: string = 'root'): SanitizationResult {
    if (!this.config.enabled) {
      return {
        sanitized: input as SanitizableValue,
        warnings: [],
        blocked: false,
      };
    }

    const result: SanitizationResult = {
      sanitized: null,
      warnings: [],
      blocked: false,
    };

    try {
      result.sanitized = this.sanitizeValue(input, path, 0, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Sanitization failed', { path, error: errorMessage });
      result.blocked = true;
      result.reason = `Sanitization failed: ${errorMessage}`;
      result.sanitized = null;
    }

    if (result.warnings.length > 0) {
      this.logger.debug('Input sanitization warnings', {
        path,
        warnings: result.warnings,
      });
    }

    return result;
  }

  /**
   * Recursively sanitize a value
   */
  private sanitizeValue(
    value: unknown,
    path: string,
    depth: number,
    result: SanitizationResult,
  ): SanitizableValue {
    // Check depth limit
    if (depth > this.config.maxObjectDepth) {
      throw new Error(`Maximum object depth (${this.config.maxObjectDepth}) exceeded at ${path}`);
    }

    if (value === null || value === undefined) {
      return value;
    }

    // Handle strings
    if (typeof value === 'string') {
      return this.sanitizeString(value, path, result);
    }

    // Handle numbers and booleans
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      let arrayToProcess = value;
      if (value.length > this.config.maxArrayLength) {
        result.warnings.push(`Array truncated at ${path} (length: ${value.length})`);
        arrayToProcess = value.slice(0, this.config.maxArrayLength);
      }

      return arrayToProcess.map((item, index: number) =>
        this.sanitizeValue(item, `${path}[${index}]`, depth + 1, result),
      );
    }

    // Handle objects
    if (typeof value === 'object') {
      const sanitized: Record<string, SanitizableValue> = {};
      const objValue = value as Record<string, unknown>;

      for (const [key, val] of Object.entries(objValue)) {
        const sanitizedKey = this.sanitizeString(key, `${path}.${key}`, result);
        sanitized[sanitizedKey] = this.sanitizeValue(val, `${path}.${key}`, depth + 1, result);
      }

      return sanitized;
    }

    // Convert other types to string and sanitize
    result.warnings.push(`Converting ${typeof value} to string at ${path}`);
    return this.sanitizeString(String(value), path, result);
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(value: string, path: string, result: SanitizationResult): string {
    // Check length limit
    if (value.length > this.config.maxStringLength) {
      result.warnings.push(`String truncated at ${path} (length: ${value.length})`);
      value = value.substring(0, this.config.maxStringLength);
    }

    // Check for injection patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(value)) {
        const match = value.match(pattern);
        this.logger.warn('Potential injection attempt detected', {
          path,
          pattern: pattern.toString(),
          match: match?.[0]?.substring(0, 50),
        });

        // Block the entire request if injection detected
        throw new Error(`Potential injection detected at ${path}: ${match?.[0]?.substring(0, 50)}`);
      }
    }

    // Basic HTML entity encoding for safety
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate that input conforms to expected schema
   */
  validateSchema(
    input: unknown,
    schema: JsonSchema,
    path: string = 'root',
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.validateValue(input, schema, path, errors);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Schema validation failed at ${path}: ${errorMessage}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Recursively validate value against schema
   */
  private validateValue(value: unknown, schema: JsonSchema, path: string, errors: string[]): void {
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (actualType !== schema.type) {
        errors.push(`Type mismatch at ${path}: expected ${schema.type}, got ${actualType}`);
        return;
      }
    }

    if (schema.required && (value === null || value === undefined)) {
      errors.push(`Required field missing at ${path}`);
      return;
    }

    if (schema.properties && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      const objValue = value as Record<string, unknown>;
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        this.validateValue(objValue[prop], propSchema, `${path}.${prop}`, errors);
      }
    }

    if (schema.items && Array.isArray(value)) {
      value.forEach((item, index) => {
        if (schema.items) {
          this.validateValue(item, schema.items, `${path}[${index}]`, errors);
        }
      });
    }

    if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) {
      errors.push(`String too short at ${path}: minimum ${schema.minLength} characters`);
    }

    if (schema.maxLength && typeof value === 'string' && value.length > schema.maxLength) {
      errors.push(`String too long at ${path}: maximum ${schema.maxLength} characters`);
    }
  }
}

/**
 * Create input sanitizer from centralized config
 */
export function createInputSanitizer(logger: Logger): InputSanitizer {
  const cfg = getConfig();
  const config: Partial<SanitizationConfig> = {
    enabled: cfg.sanitization?.enabled ?? cfg.security.sanitizationEnabled,
    maxStringLength: cfg.sanitization?.maxStringLength ?? 10000,
    maxArrayLength: cfg.sanitization?.maxArrayLength ?? 1000,
    maxObjectDepth: cfg.sanitization?.maxObjectDepth ?? 10,
  };

  return new InputSanitizer(logger, config);
}
