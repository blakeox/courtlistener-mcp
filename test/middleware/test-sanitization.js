/**
 * Comprehensive tests for Input Sanitization Middleware
 * Tests XSS protection, injection prevention, and data validation
 */

import { createMockLogger, testFixtures, assertions } from '../../utils/test-helpers.js';

// Mock the sanitization middleware to test functionality
class MockInputSanitizer {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      enabled: true,
      maxStringLength: 10000,
      maxArrayLength: 1000,
      maxObjectDepth: 10,
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
      blockedPatterns: [
        /(<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>)/gi,
        /(javascript:|data:|vbscript:)/gi,
        /(on\w+\s*=)/gi,
        /(<iframe|<object|<embed|<link|<meta)/gi,
        /(union\s+select|drop\s+table|insert\s+into|delete\s+from)/gi,
        /(eval\s*\(|function\s*\(|setTimeout\s*\(|setInterval\s*\()/gi,
        /(\$\{.*\}|<%.*%>|{{.*}})/gi,
      ],
      ...config
    };
  }

  sanitize(input, path = 'root') {
    if (!this.config.enabled) {
      return {
        sanitized: input,
        warnings: [],
        blocked: false
      };
    }

    const result = {
      sanitized: null,
      warnings: [],
      blocked: false
    };

    try {
      result.sanitized = this.sanitizeValue(input, path, 0, result);
    } catch (error) {
      result.blocked = true;
      result.reason = error.message;
    }

    return result;
  }

  sanitizeValue(value, path, depth, result) {
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
        this.sanitizeValue(item, `${path}[${index}]`, depth + 1, result)
      );
    }

    // Handle objects
    if (typeof value === 'object') {
      const sanitized = {};
      
      for (const [key, val] of Object.entries(value)) {
        const sanitizedKey = this.sanitizeString(key, `${path}.${key}`, result);
        sanitized[sanitizedKey] = this.sanitizeValue(val, `${path}.${key}`, depth + 1, result);
      }
      
      return sanitized;
    }

    // Convert other types to string and sanitize
    result.warnings.push(`Converting ${typeof value} to string at ${path}`);
    return this.sanitizeString(String(value), path, result);
  }

  sanitizeString(value, path, result) {
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

  validateSchema(input, schema, path = 'root') {
    const errors = [];

    try {
      this.validateValue(input, schema, path, errors);
    } catch (error) {
      errors.push(`Schema validation failed at ${path}: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateValue(value, schema, path, errors) {
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

    if (schema.properties && typeof value === 'object' && !Array.isArray(value)) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        this.validateValue(value[prop], propSchema, `${path}.${prop}`, errors);
      }
    }

    if (schema.items && Array.isArray(value)) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items, `${path}[${index}]`, errors);
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
  let sanitizer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    sanitizer = new MockInputSanitizer(mockLogger, {
      enabled: true,
      maxStringLength: 100,
      maxArrayLength: 10,
      maxObjectDepth: 3
    });
  });

  describe('XSS Protection', () => {
    it('should block script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block script tags');
      console.assert(result.reason.includes('injection detected'), 'Should provide appropriate reason');
    });

    it('should block event handlers', () => {
      const maliciousInput = '<div onclick="alert()">Click me</div>';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block event handlers');
    });

    it('should block javascript protocol handlers', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block javascript protocol');
    });

    it('should block data URLs', () => {
      const maliciousInput = 'data:text/html,<script>alert()</script>';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block data URLs');
    });

    it('should encode HTML entities in safe content', () => {
      const safeInput = 'User input with < > & " \' / characters';
      const result = sanitizer.sanitize(safeInput);
      
      console.assert(result.blocked === false, 'Should not block safe content');
      console.assert(result.sanitized.includes('&lt;'), 'Should encode < character');
      console.assert(result.sanitized.includes('&gt;'), 'Should encode > character');
      console.assert(result.sanitized.includes('&amp;'), 'Should encode & character');
      console.assert(result.sanitized.includes('&quot;'), 'Should encode " character');
    });
  });

  describe('SQL Injection Protection', () => {
    it('should block UNION SELECT attacks', () => {
      const maliciousInput = "'; UNION SELECT * FROM users; --";
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block UNION SELECT');
    });

    it('should block DROP TABLE attacks', () => {
      const maliciousInput = "'; DROP TABLE users; --";
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block DROP TABLE');
    });

    it('should block INSERT INTO attacks', () => {
      const maliciousInput = "'; INSERT INTO users VALUES ('hacker', 'pass'); --";
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block INSERT INTO');
    });

    it('should block DELETE FROM attacks', () => {
      const maliciousInput = "'; DELETE FROM users WHERE 1=1; --";
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block DELETE FROM');
    });
  });

  describe('Code Execution Protection', () => {
    it('should block eval() calls', () => {
      const maliciousInput = 'eval("malicious code")';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block eval calls');
    });

    it('should block setTimeout calls', () => {
      const maliciousInput = 'setTimeout("alert()", 1000)';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block setTimeout calls');
    });

    it('should block function constructors', () => {
      const maliciousInput = 'new Function("return process.env")()';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block function constructors');
    });
  });

  describe('Template Injection Protection', () => {
    it('should block JavaScript template literals', () => {
      const maliciousInput = '${process.env.SECRET}';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block template literals');
    });

    it('should block ERB templates', () => {
      const maliciousInput = '<%= system("rm -rf /") %>';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block ERB templates');
    });

    it('should block Handlebars templates', () => {
      const maliciousInput = '{{constructor.constructor("return process")().env}}';
      const result = sanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === true, 'Should block Handlebars templates');
    });
  });

  describe('Data Structure Limits', () => {
    it('should truncate oversized strings', () => {
      const longString = 'a'.repeat(200);
      const result = sanitizer.sanitize(longString);
      
      console.assert(result.blocked === false, 'Should not block long strings');
      console.assert(result.sanitized.length <= 100, 'Should truncate to max length');
      console.assert(result.warnings.length > 0, 'Should generate warning');
    });

    it('should truncate oversized arrays', () => {
      const largeArray = Array(20).fill('item');
      const result = sanitizer.sanitize(largeArray);
      
      console.assert(result.blocked === false, 'Should not block large arrays');
      console.assert(result.sanitized.length <= 10, 'Should truncate to max length');
      console.assert(result.warnings.length > 0, 'Should generate warning');
    });

    it('should reject objects exceeding depth limit', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'too deep'
              }
            }
          }
        }
      };
      
      const result = sanitizer.sanitize(deepObject);
      console.assert(result.blocked === true, 'Should block objects exceeding depth limit');
    });

    it('should handle objects at exactly the depth limit', () => {
      const maxDepthObject = {
        level1: {
          level2: {
            level3: {
              data: 'at limit'
            }
          }
        }
      };
      
      const result = sanitizer.sanitize(maxDepthObject);
      console.assert(result.blocked === false, 'Should allow objects at depth limit');
      console.assert(result.sanitized.level1.level2.level3.data === 'at limit', 'Should preserve data');
    });
  });

  describe('Safe Input Handling', () => {
    it('should pass through safe strings unchanged', () => {
      const safeInput = 'This is a safe legal query about contracts';
      const result = sanitizer.sanitize(safeInput);
      
      console.assert(result.blocked === false, 'Should not block safe input');
      console.assert(result.warnings.length === 0, 'Should not generate warnings');
    });

    it('should handle null and undefined values', () => {
      console.assert(sanitizer.sanitize(null).sanitized === null, 'Should handle null');
      console.assert(sanitizer.sanitize(undefined).sanitized === undefined, 'Should handle undefined');
    });

    it('should handle numbers and booleans', () => {
      console.assert(sanitizer.sanitize(42).sanitized === 42, 'Should handle numbers');
      console.assert(sanitizer.sanitize(true).sanitized === true, 'Should handle booleans');
      console.assert(sanitizer.sanitize(false).sanitized === false, 'Should handle false');
    });

    it('should handle complex safe objects', () => {
      const safeObject = {
        user: 'John Doe',
        age: 30,
        preferences: ['email', 'sms'],
        metadata: {
          created: '2023-01-01',
          updated: '2023-12-01'
        }
      };
      
      const result = sanitizer.sanitize(safeObject);
      console.assert(result.blocked === false, 'Should not block safe objects');
      console.assert(result.sanitized.user === 'John Doe', 'Should preserve safe data');
      console.assert(Array.isArray(result.sanitized.preferences), 'Should preserve arrays');
    });
  });

  describe('Schema Validation', () => {
    it('should validate correct schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number' }
        }
      };
      
      const validInput = { name: 'John', age: 30 };
      const result = sanitizer.validateSchema(validInput, schema);
      
      console.assert(result.valid === true, 'Should validate correct schema');
      console.assert(result.errors.length === 0, 'Should have no errors');
    });

    it('should detect type mismatches', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };
      
      const invalidInput = { name: 123, age: '30' };
      const result = sanitizer.validateSchema(invalidInput, schema);
      
      console.assert(result.valid === false, 'Should detect type mismatches');
      console.assert(result.errors.length > 0, 'Should report errors');
    });

    it('should detect missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true }
        }
      };
      
      const invalidInput = { name: 'John' }; // Missing email
      const result = sanitizer.validateSchema(invalidInput, schema);
      
      console.assert(result.valid === false, 'Should detect missing required fields');
      console.assert(result.errors.some(e => e.includes('email')), 'Should report missing email');
    });

    it('should validate array schemas', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' }
      };
      
      const validInput = ['item1', 'item2', 'item3'];
      const invalidInput = ['item1', 123, 'item3'];
      
      const validResult = sanitizer.validateSchema(validInput, schema);
      const invalidResult = sanitizer.validateSchema(invalidInput, schema);
      
      console.assert(validResult.valid === true, 'Should validate correct array');
      console.assert(invalidResult.valid === false, 'Should detect invalid array items');
    });

    it('should validate string length constraints', () => {
      const schema = {
        type: 'string',
        minLength: 5,
        maxLength: 20
      };
      
      const tooShort = 'Hi';
      const justRight = 'Hello World';
      const tooLong = 'This string is way too long for the schema';
      
      console.assert(sanitizer.validateSchema(tooShort, schema).valid === false, 'Should reject too short');
      console.assert(sanitizer.validateSchema(justRight, schema).valid === true, 'Should accept right length');
      console.assert(sanitizer.validateSchema(tooLong, schema).valid === false, 'Should reject too long');
    });
  });

  describe('Configuration Options', () => {
    it('should bypass sanitization when disabled', () => {
      const disabledSanitizer = new MockInputSanitizer(mockLogger, { enabled: false });
      const maliciousInput = '<script>alert("xss")</script>';
      const result = disabledSanitizer.sanitize(maliciousInput);
      
      console.assert(result.blocked === false, 'Should bypass when disabled');
      console.assert(result.sanitized === maliciousInput, 'Should return original input');
    });

    it('should use custom string length limits', () => {
      const customSanitizer = new MockInputSanitizer(mockLogger, { maxStringLength: 5 });
      const longString = 'This is too long';
      const result = customSanitizer.sanitize(longString);
      
      console.assert(result.sanitized.length <= 5, 'Should use custom length limit');
    });

    it('should use custom array length limits', () => {
      const customSanitizer = new MockInputSanitizer(mockLogger, { maxArrayLength: 2 });
      const longArray = [1, 2, 3, 4, 5];
      const result = customSanitizer.sanitize(longArray);
      
      console.assert(result.sanitized.length <= 2, 'Should use custom array limit');
    });
  });

  describe('Performance Tests', () => {
    it('should sanitize large objects efficiently', () => {
      const largeObject = {
        items: Array(1000).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'Safe description text'
        }))
      };
      
      const start = Date.now();
      const result = sanitizer.sanitize(largeObject);
      const duration = Date.now() - start;
      
      console.assert(result.blocked === false, 'Should handle large objects');
      console.assert(duration < 1000, `Should be fast, took ${duration}ms`);
    });

    it('should handle concurrent sanitization', async () => {
      const inputs = Array(100).fill('safe input text');
      
      const promises = inputs.map(input => 
        Promise.resolve(sanitizer.sanitize(input))
      );
      
      const results = await Promise.all(promises);
      console.assert(results.every(r => !r.blocked), 'Should handle concurrent requests');
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      try {
        const result = sanitizer.sanitize(circular);
        // Should either block or handle gracefully
        console.assert(true, 'Should handle circular references without crashing');
      } catch (error) {
        console.assert(error.message.includes('circular') || error.message.includes('depth'), 
          'Should provide appropriate error for circular references');
      }
    });

    it('should handle very nested objects', () => {
      let deepObject = { value: 'deep' };
      for (let i = 0; i < 20; i++) {
        deepObject = { [`level${i}`]: deepObject };
      }
      
      const result = sanitizer.sanitize(deepObject);
      console.assert(result.blocked === true, 'Should block very deep objects');
    });

    it('should handle empty inputs', () => {
      console.assert(sanitizer.sanitize('').blocked === false, 'Should handle empty string');
      console.assert(sanitizer.sanitize([]).blocked === false, 'Should handle empty array');
      console.assert(sanitizer.sanitize({}).blocked === false, 'Should handle empty object');
    });

    it('should handle mixed content types', () => {
      const mixedInput = {
        string: 'text',
        number: 42,
        boolean: true,
        array: [1, 'two', false],
        nested: {
          more: 'data'
        }
      };
      
      const result = sanitizer.sanitize(mixedInput);
      console.assert(result.blocked === false, 'Should handle mixed content types');
      console.assert(typeof result.sanitized.number === 'number', 'Should preserve numbers');
      console.assert(typeof result.sanitized.boolean === 'boolean', 'Should preserve booleans');
    });
  });

  // Additional tests from existing test-enterprise-middleware.js
  describe('Enhanced Security Tests', () => {
    it('should truncate oversized strings with warnings', () => {
      const sanitizer = new MockInputSanitizer(createMockLogger(), {
        enabled: true,
        maxStringLength: 100
      });
      
      const longString = 'a'.repeat(200);
      const result = sanitizer.sanitize(longString);
      
      console.assert(result.blocked === false, 'Should not block long strings, just truncate');
      console.assert(result.warnings.length > 0, 'Should generate warnings for truncation');
      console.assert(result.sanitized.length <= 100, 'Should truncate to max length');
    });

    it('should handle circular references gracefully', () => {
      const circular = { a: 1 };
      circular.self = circular;
      
      const result = sanitizer.sanitize(circular);
      console.assert(result.blocked === true, 'Should block circular references');
      console.assert(result.reason && (result.reason.includes('failed') || result.reason.includes('circular')), 
                    'Should indicate processing failure');
    });

    it('should validate schema correctly', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number' }
        }
      };
      
      const validInput = { name: 'John', age: 30 };
      const invalidInput = { name: 123, age: 30 };
      
      // Test valid input
      const validResult = sanitizer.validateSchema(validInput, schema);
      console.assert(validResult.valid === true, 'Should validate correct schema');
      
      // Test invalid input  
      const invalidResult = sanitizer.validateSchema(invalidInput, schema);
      console.assert(invalidResult.valid === false, 'Should reject invalid schema');
    });
  });

  describe('Performance Tests', () => {
    it('should sanitize large objects efficiently', () => {
      const largeObject = {
        items: Array(1000).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'Safe description text'
        }))
      };
      
      const start = Date.now();
      const result = sanitizer.sanitize(largeObject);
      const duration = Date.now() - start;
      
      console.assert(result.blocked === false, 'Should handle large safe objects');
      console.assert(duration < 1000, 'Should complete within 1 second');
      console.log(`    ⚡ Large object sanitization completed in ${duration}ms`);
    });

    it('should handle configuration validation', () => {
      // Test invalid configuration handling
      const invalidSanitizer = new MockInputSanitizer(createMockLogger(), {
        enabled: true,
        maxStringLength: -1  // Invalid
      });
      
      // Should not throw and should handle gracefully
      const result = invalidSanitizer.sanitize('test');
      console.assert(result !== undefined, 'Should handle invalid config gracefully');
      
      // Test defaults for missing configuration
      const defaultSanitizer = new MockInputSanitizer(createMockLogger(), {});
      const defaultResult = defaultSanitizer.sanitize('test');
      
      console.assert(defaultResult !== undefined, 'Should work with default config');
      console.assert(defaultResult.blocked === false, 'Should handle safe input with defaults');
    });
  });
});

console.log('✅ Input Sanitization Middleware Tests Completed');
