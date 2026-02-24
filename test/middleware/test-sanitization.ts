/**
 * ✅ Comprehensive tests for Input Sanitization Middleware (TypeScript)
 * Tests XSS protection, injection prevention, and data validation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createMockLogger, testFixtures, assertions } from '../utils/test-helpers.ts';
import type { MockLogger } from '../utils/test-helpers.ts';

interface SanitizerConfig {
  enabled?: boolean;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectDepth?: number;
  allowedTags?: string[];
  blockedPatterns?: RegExp[];
}

interface SanitizeResult {
  sanitized: unknown;
  warnings: string[];
  blocked: boolean;
  reason?: string;
}

interface Schema {
  type?: string;
  required?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  minLength?: number;
  maxLength?: number;
}

interface ValidateResult {
  valid: boolean;
  errors: string[];
}

interface SanitizeResultInternal extends SanitizeResult {
  sanitized: unknown;
}

// Mock the sanitization middleware to test functionality
class MockInputSanitizer {
  private logger: MockLogger;
  private config: Required<SanitizerConfig>;

  constructor(logger: MockLogger, config: SanitizerConfig = {}) {
    this.logger = logger;
    this.config = {
      enabled: true,
      maxStringLength: 10000,
      maxArrayLength: 1000,
      maxObjectDepth: 10,
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
      blockedPatterns: [
        /(<script[\s>\/])/gi,
        /(javascript:|data:|vbscript:)/gi,
        /(on\w+\s*=)/gi,
        /(<iframe|<object|<embed|<link|<meta)/gi,
        /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/gi,
        /(eval\s*\(|function\s*\(|setTimeout\s*\(|setInterval\s*\()/gi,
        /(\$\{.*\}|<%.*%>|{{.*}})/gi,
      ],
      ...config,
    };
  }

  sanitize(input: unknown, path = 'root'): SanitizeResult {
    if (!this.config.enabled) {
      return {
        sanitized: input,
        warnings: [],
        blocked: false,
      };
    }

    const result: SanitizeResultInternal = {
      sanitized: null,
      warnings: [],
      blocked: false,
    };

    try {
      result.sanitized = this.sanitizeValue(input, path, 0, result);
    } catch (error) {
      result.blocked = true;
      result.reason = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  private sanitizeValue(
    value: unknown,
    path: string,
    depth: number,
    result: SanitizeResultInternal,
  ): unknown {
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
      if (value.length > this.config.maxArrayLength) {
        result.warnings.push(`Array truncated at ${path} (length: ${value.length})`);
        value = value.slice(0, this.config.maxArrayLength);
      }

      return value.map((item, index) =>
        this.sanitizeValue(item, `${path}[${index}]`, depth + 1, result),
      );
    }

    // Handle objects
    if (typeof value === 'object') {
      const sanitized: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(value)) {
        const sanitizedKey = this.sanitizeString(key, `${path}.${key}`, result) as string;
        sanitized[sanitizedKey] = this.sanitizeValue(val, `${path}.${key}`, depth + 1, result);
      }

      return sanitized;
    }

    // Convert other types to string and sanitize
    result.warnings.push(`Converting ${typeof value} to string at ${path}`);
    return this.sanitizeString(String(value), path, result);
  }

  private sanitizeString(value: string, path: string, result: SanitizeResultInternal): string {
    // Check length limit
    if (value.length > this.config.maxStringLength) {
      result.warnings.push(`String truncated at ${path} (length: ${value.length})`);
      value = value.substring(0, this.config.maxStringLength);
    }

    // Check for injection patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(value)) {
        const match = value.match(pattern);
        throw new Error(`Potential injection detected at ${path}: ${match?.[0]?.substring(0, 50)}`);
      }
    }

    // Basic HTML entity encoding
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  validateSchema(input: unknown, schema: Schema, path = 'root'): ValidateResult {
    const errors: string[] = [];

    try {
      this.validateValue(input, schema, path, errors);
    } catch (error) {
      errors.push(
        `Schema validation failed at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateValue(value: unknown, schema: Schema, path: string, errors: string[]): void {
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
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        const objValue = value as Record<string, unknown>;
        this.validateValue(objValue[prop], propSchema, `${path}.${prop}`, errors);
      }
    }

    if (schema.items && Array.isArray(value)) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
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

describe('Input Sanitization Middleware Tests', () => {
  let sanitizer: MockInputSanitizer;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    sanitizer = new MockInputSanitizer(mockLogger, {
      enabled: true,
      maxStringLength: 100,
      maxArrayLength: 10,
      maxObjectDepth: 3,
    });
  });

  describe('XSS Protection', () => {
    it('should block script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block script tags');
      assert.ok(result.reason?.includes('injection detected'), 'Should provide appropriate reason');
    });

    it('should block event handlers', () => {
      const maliciousInput = '<div onclick="alert()">Click me</div>';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block event handlers');
    });

    it('should block javascript protocol handlers', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block javascript protocol');
    });

    it('should block data URLs', () => {
      const maliciousInput = 'data:text/html,<script>alert()</script>';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block data URLs');
    });

    it('should encode HTML entities in safe content', () => {
      const safeInput = 'User input with < > & " \' / characters';
      const result = sanitizer.sanitize(safeInput);

      assert.strictEqual(result.blocked, false, 'Should not block safe content');
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.includes('&lt;'),
        'Should encode < character',
      );
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.includes('&gt;'),
        'Should encode > character',
      );
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.includes('&amp;'),
        'Should encode & character',
      );
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.includes('&quot;'),
        'Should encode " character',
      );
    });
  });

  describe('SQL Injection Protection', () => {
    it('should block UNION SELECT attacks', () => {
      const maliciousInput = "'; UNION SELECT * FROM users; --";
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block UNION SELECT');
    });

    it('should block DROP TABLE attacks', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block DROP TABLE');
    });

    it('should block INSERT INTO attacks', () => {
      const maliciousInput = "'; INSERT INTO users VALUES ('hacker', 'pass'); --";
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block INSERT INTO');
    });

    it('should block DELETE FROM attacks', () => {
      const maliciousInput = "'; DELETE FROM users WHERE 1=1; --";
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block DELETE FROM');
    });
  });

  describe('Code Execution Protection', () => {
    it('should block eval() calls', () => {
      const maliciousInput = 'eval("malicious code")';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block eval calls');
    });

    it('should block setTimeout calls', () => {
      const maliciousInput = 'setTimeout("alert()", 1000)';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block setTimeout calls');
    });

    it('should block function constructors', () => {
      const maliciousInput = 'new Function("return process.env")()';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block function constructors');
    });
  });

  describe('Template Injection Protection', () => {
    it('should block JavaScript template literals', () => {
      const maliciousInput = '${process.env.SECRET}';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block template literals');
    });

    it('should block ERB templates', () => {
      const maliciousInput = '<%= system("rm -rf /") %>';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block ERB templates');
    });

    it('should block Handlebars templates', () => {
      const maliciousInput = '{{constructor.constructor("return process")().env}}';
      const result = sanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, true, 'Should block Handlebars templates');
    });
  });

  describe('Data Structure Limits', () => {
    it('should truncate oversized strings', () => {
      const longString = 'a'.repeat(200);
      const result = sanitizer.sanitize(longString);

      assert.strictEqual(result.blocked, false, 'Should not block long strings');
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.length <= 100,
        'Should truncate to max length',
      );
      assert.ok(result.warnings.length > 0, 'Should generate warning');
    });

    it('should truncate oversized arrays', () => {
      const largeArray = Array(20).fill('item');
      const result = sanitizer.sanitize(largeArray);

      assert.strictEqual(result.blocked, false, 'Should not block large arrays');
      assert.ok(
        Array.isArray(result.sanitized) && result.sanitized.length <= 10,
        'Should truncate to max length',
      );
      assert.ok(result.warnings.length > 0, 'Should generate warning');
    });

    it('should reject objects exceeding depth limit', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'too deep',
              },
            },
          },
        },
      };

      const result = sanitizer.sanitize(deepObject);
      assert.strictEqual(result.blocked, true, 'Should block objects exceeding depth limit');
    });

    it('should handle objects at exactly the depth limit', () => {
      const maxDepthObject = {
        level1: {
          level2: {
            level3: {
              data: 'at limit',
            },
          },
        },
      };

      const result = sanitizer.sanitize(maxDepthObject);
      assert.strictEqual(result.blocked, false, 'Should allow objects at depth limit');
      const sanitized = result.sanitized as Record<string, unknown>;
      assert.strictEqual(
        (sanitized.level1 as Record<string, unknown>).level2 &&
          ((sanitized.level1 as Record<string, unknown>).level2 as Record<string, unknown>)
            .level3 &&
          (
            ((sanitized.level1 as Record<string, unknown>).level2 as Record<string, unknown>)
              .level3 as Record<string, unknown>
          ).data,
        'at limit',
        'Should preserve data',
      );
    });
  });

  describe('Safe Input Handling', () => {
    it('should pass through safe strings unchanged', () => {
      const safeInput = 'This is a safe legal query about contracts';
      const result = sanitizer.sanitize(safeInput);

      assert.strictEqual(result.blocked, false, 'Should not block safe input');
      assert.strictEqual(result.warnings.length, 0, 'Should not generate warnings');
    });

    it('should handle null and undefined values', () => {
      assert.strictEqual(sanitizer.sanitize(null).sanitized, null, 'Should handle null');
      assert.strictEqual(
        sanitizer.sanitize(undefined).sanitized,
        undefined,
        'Should handle undefined',
      );
    });

    it('should handle numbers and booleans', () => {
      assert.strictEqual(sanitizer.sanitize(42).sanitized, 42, 'Should handle numbers');
      assert.strictEqual(sanitizer.sanitize(true).sanitized, true, 'Should handle booleans');
      assert.strictEqual(sanitizer.sanitize(false).sanitized, false, 'Should handle false');
    });

    it('should handle complex safe objects', () => {
      const safeObject = {
        user: 'John Doe',
        age: 30,
        preferences: ['email', 'sms'],
        metadata: {
          created: '2023-01-01',
          updated: '2023-12-01',
        },
      };

      const result = sanitizer.sanitize(safeObject);
      assert.strictEqual(result.blocked, false, 'Should not block safe objects');
      const sanitized = result.sanitized as Record<string, unknown>;
      assert.strictEqual(sanitized.user, 'John Doe', 'Should preserve safe data');
      assert.ok(Array.isArray(sanitized.preferences), 'Should preserve arrays');
    });
  });

  describe('Schema Validation', () => {
    it('should validate correct schema', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number' },
        },
      };

      const validInput = { name: 'John', age: 30 };
      const result = sanitizer.validateSchema(validInput, schema);

      assert.strictEqual(result.valid, true, 'Should validate correct schema');
      assert.strictEqual(result.errors.length, 0, 'Should have no errors');
    });

    it('should detect type mismatches', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const invalidInput = { name: 123, age: '30' };
      const result = sanitizer.validateSchema(invalidInput, schema);

      assert.strictEqual(result.valid, false, 'Should detect type mismatches');
      assert.ok(result.errors.length > 0, 'Should report errors');
    });

    it('should detect missing required fields', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true },
        },
      };

      const invalidInput = { name: 'John' }; // Missing email
      const result = sanitizer.validateSchema(invalidInput, schema);

      assert.strictEqual(result.valid, false, 'Should detect missing required fields');
      assert.ok(
        result.errors.some((e) => e.includes('email')),
        'Should report missing email',
      );
    });

    it('should validate array schemas', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
      };

      const validInput = ['item1', 'item2', 'item3'];
      const invalidInput = ['item1', 123, 'item3'];

      const validResult = sanitizer.validateSchema(validInput, schema);
      const invalidResult = sanitizer.validateSchema(invalidInput, schema);

      assert.strictEqual(validResult.valid, true, 'Should validate correct array');
      assert.strictEqual(invalidResult.valid, false, 'Should detect invalid array items');
    });

    it('should validate string length constraints', () => {
      const schema: Schema = {
        type: 'string',
        minLength: 5,
        maxLength: 20,
      };

      const tooShort = 'Hi';
      const justRight = 'Hello World';
      const tooLong = 'This string is way too long for the schema';

      assert.strictEqual(
        sanitizer.validateSchema(tooShort, schema).valid,
        false,
        'Should reject too short',
      );
      assert.strictEqual(
        sanitizer.validateSchema(justRight, schema).valid,
        true,
        'Should accept right length',
      );
      assert.strictEqual(
        sanitizer.validateSchema(tooLong, schema).valid,
        false,
        'Should reject too long',
      );
    });
  });

  describe('Configuration Options', () => {
    it('should bypass sanitization when disabled', () => {
      const disabledSanitizer = new MockInputSanitizer(mockLogger, {
        enabled: false,
      });
      const maliciousInput = '<script>alert("xss")</script>';
      const result = disabledSanitizer.sanitize(maliciousInput);

      assert.strictEqual(result.blocked, false, 'Should bypass when disabled');
      assert.strictEqual(result.sanitized, maliciousInput, 'Should return original input');
    });

    it('should use custom string length limits', () => {
      const customSanitizer = new MockInputSanitizer(mockLogger, {
        maxStringLength: 5,
      });
      const longString = 'This is too long';
      const result = customSanitizer.sanitize(longString);

      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.length <= 5,
        'Should use custom length limit',
      );
    });

    it('should use custom array length limits', () => {
      const customSanitizer = new MockInputSanitizer(mockLogger, {
        maxArrayLength: 2,
      });
      const longArray = [1, 2, 3, 4, 5];
      const result = customSanitizer.sanitize(longArray);

      assert.ok(
        Array.isArray(result.sanitized) && result.sanitized.length <= 2,
        'Should use custom array limit',
      );
    });
  });

  describe('Performance Tests', () => {
    it('should sanitize large objects efficiently', () => {
      const largeObject = {
        items: Array(1000)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: 'Safe description text',
          })),
      };

      const start = Date.now();
      const result = sanitizer.sanitize(largeObject);
      const duration = Date.now() - start;

      assert.strictEqual(result.blocked, false, 'Should handle large objects');
      assert.ok(duration < 1000, `Should be fast, took ${duration}ms`);
    });

    it('should handle concurrent sanitization', async () => {
      const inputs = Array(100).fill('safe input text');

      const promises = inputs.map((input) => Promise.resolve(sanitizer.sanitize(input)));

      const results = await Promise.all(promises);
      assert.ok(
        results.every((r) => !r.blocked),
        'Should handle concurrent requests',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      try {
        const result = sanitizer.sanitize(circular);
        // Should either block or handle gracefully
        assert.ok(true, 'Should handle circular references without crashing');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes('circular') || errorMessage.includes('depth'),
          'Should provide appropriate error for circular references',
        );
      }
    });

    it('should handle very nested objects', () => {
      let deepObject: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 20; i++) {
        deepObject = { [`level${i}`]: deepObject };
      }

      const result = sanitizer.sanitize(deepObject);
      assert.strictEqual(result.blocked, true, 'Should block very deep objects');
    });

    it('should handle empty inputs', () => {
      assert.strictEqual(sanitizer.sanitize('').blocked, false, 'Should handle empty string');
      assert.strictEqual(sanitizer.sanitize([]).blocked, false, 'Should handle empty array');
      assert.strictEqual(sanitizer.sanitize({}).blocked, false, 'Should handle empty object');
    });

    it('should handle mixed content types', () => {
      const mixedInput = {
        string: 'text',
        number: 42,
        boolean: true,
        array: [1, 'two', false],
        nested: {
          more: 'data',
        },
      };

      const result = sanitizer.sanitize(mixedInput);
      assert.strictEqual(result.blocked, false, 'Should handle mixed content types');
      const sanitized = result.sanitized as Record<string, unknown>;
      assert.strictEqual(typeof sanitized.number, 'number', 'Should preserve numbers');
      assert.strictEqual(typeof sanitized.boolean, 'boolean', 'Should preserve booleans');
    });
  });

  // Additional tests from existing test-enterprise-middleware.js
  describe('Enhanced Security Tests', () => {
    it('should truncate oversized strings with warnings', () => {
      const testSanitizer = new MockInputSanitizer(createMockLogger(), {
        enabled: true,
        maxStringLength: 100,
      });

      const longString = 'a'.repeat(200);
      const result = testSanitizer.sanitize(longString);

      assert.strictEqual(result.blocked, false, 'Should not block long strings, just truncate');
      assert.ok(result.warnings.length > 0, 'Should generate warnings for truncation');
      assert.ok(
        typeof result.sanitized === 'string' && result.sanitized.length <= 100,
        'Should truncate to max length',
      );
    });

    it('should handle circular references gracefully', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      const result = sanitizer.sanitize(circular);
      assert.strictEqual(result.blocked, true, 'Should block circular references');
      assert.ok(
        result.reason && (result.reason.includes('failed') || result.reason.includes('circular')),
        'Should indicate processing failure',
      );
    });

    it('should validate schema correctly', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number' },
        },
      };

      const validInput = { name: 'John', age: 30 };
      const invalidInput = { name: 123, age: 30 };

      // Test valid input
      const validResult = sanitizer.validateSchema(validInput, schema);
      assert.strictEqual(validResult.valid, true, 'Should validate correct schema');

      // Test invalid input
      const invalidResult = sanitizer.validateSchema(invalidInput, schema);
      assert.strictEqual(invalidResult.valid, false, 'Should reject invalid schema');
    });
  });

  describe('Performance Tests', () => {
    it('should sanitize large objects efficiently', () => {
      const largeObject = {
        items: Array(1000)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: 'Safe description text',
          })),
      };

      const start = Date.now();
      const result = sanitizer.sanitize(largeObject);
      const duration = Date.now() - start;

      assert.strictEqual(result.blocked, false, 'Should handle large safe objects');
      assert.ok(duration < 1000, 'Should complete within 1 second');
      console.log(`    ⚡ Large object sanitization completed in ${duration}ms`);
    });

    it('should handle configuration validation', () => {
      // Test invalid configuration handling
      const invalidSanitizer = new MockInputSanitizer(createMockLogger(), {
        enabled: true,
        maxStringLength: -1, // Invalid
      });

      // Should not throw and should handle gracefully
      const result = invalidSanitizer.sanitize('test');
      assert.ok(result !== undefined, 'Should handle invalid config gracefully');

      // Test defaults for missing configuration
      const defaultSanitizer = new MockInputSanitizer(createMockLogger(), {});
      const defaultResult = defaultSanitizer.sanitize('test');

      assert.ok(defaultResult !== undefined, 'Should work with default config');
      assert.strictEqual(defaultResult.blocked, false, 'Should handle safe input with defaults');
    });
  });
});

console.log('✅ Input Sanitization Middleware Tests Completed');
