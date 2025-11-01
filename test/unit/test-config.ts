#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Configuration Management (TypeScript)
 * Tests environment variable parsing, validation, and default values
 */

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

async function importConfigFresh(): Promise<typeof import('../../dist/infrastructure/config.js')> {
  const suffix = `${Date.now()}-${Math.random()}`;
  return await import(`../../dist/infrastructure/config.js?t=${suffix}`);
}

describe('Configuration Management (TypeScript)', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Environment Variable Parsing', () => {
    it('should parse environment variables correctly', async () => {
      // Set test environment variables
      process.env.NODE_ENV = 'test';
      process.env.CACHE_ENABLED = 'true';
      process.env.CACHE_TTL = '600';
      process.env.CACHE_MAX_SIZE = '2000';
      process.env.LOG_LEVEL = 'debug';
      process.env.LOG_FORMAT = 'json';
      process.env.METRICS_ENABLED = 'true';
      process.env.METRICS_PORT = '3001';
      process.env.COURTLISTENER_TIMEOUT = '45000';
      process.env.COURTLISTENER_RATE_LIMIT = '150';

      // Import config after setting env vars
      const { getConfig } = await import('../../dist/infrastructure/config.js');
      const config = getConfig();

      assert.strictEqual(config.cache.enabled, true);
      assert.strictEqual(config.cache.ttl, 600);
      assert.strictEqual(config.cache.maxSize, 2000);
      assert.strictEqual(config.logging.level, 'debug');
      assert.strictEqual(config.logging.format, 'json');
      assert.strictEqual(config.metrics.enabled, true);
      assert.strictEqual(config.metrics.port, 3001);
      assert.strictEqual(config.courtListener.timeout, 45000);
      assert.strictEqual(config.courtListener.rateLimitPerMinute, 150);
    });

    it('should use default values when env vars are missing', async () => {
      // Clear all relevant env vars
      delete process.env.CACHE_ENABLED;
      delete process.env.CACHE_TTL;
      delete process.env.LOG_LEVEL;
      delete process.env.METRICS_ENABLED;
      delete process.env.CACHE_MAX_SIZE;

      // Use timestamp to force fresh import
      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      // Use actual defaults from config.ts
      assert.strictEqual(config.cache.enabled, true); // CACHE_ENABLED !== 'false' defaults to true
      assert.strictEqual(config.cache.ttl, 300); // Default: 5 minutes (300 seconds)
      assert.strictEqual(config.cache.maxSize, 1000); // Default: 1000
      assert.strictEqual(config.logging.level, 'info'); // Default: info
      assert.strictEqual(config.metrics.enabled, false); // METRICS_ENABLED === 'true' defaults to false
    });

    it('should handle boolean environment variables', async () => {
      // Test actual boolean parsing behavior from config.ts
      process.env.CACHE_ENABLED = 'false'; // !== 'false' = false
      process.env.METRICS_ENABLED = 'true'; // === 'true' = true
      process.env.LOGGING_ENABLED = 'false'; // !== 'false' = false

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.cache.enabled, false);
      assert.strictEqual(config.metrics.enabled, true);
      assert.strictEqual(config.logging.enabled, false);

      // Clean up
      delete process.env.CACHE_ENABLED;
      delete process.env.METRICS_ENABLED;
      delete process.env.LOGGING_ENABLED;
    });

    it('should handle numeric environment variables', async () => {
      process.env.CACHE_TTL = '900';
      process.env.CACHE_MAX_SIZE = '5000';
      process.env.METRICS_PORT = '4001';
      process.env.COURTLISTENER_TIMEOUT = '60000';

      // Use timestamp to force fresh import
      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.cache.ttl, 900);
      assert.strictEqual(config.cache.maxSize, 5000);
      assert.strictEqual(config.metrics.port, 4001);
      assert.strictEqual(config.courtListener.timeout, 60000);

      // Clean up
      delete process.env.CACHE_TTL;
      delete process.env.CACHE_MAX_SIZE;
      delete process.env.METRICS_PORT;
      delete process.env.COURTLISTENER_TIMEOUT;
    });
  });

  describe('Configuration Validation', () => {
    it('should validate log levels', async () => {
      process.env.LOG_LEVEL = 'invalid';

      const { getConfig } = await import('../../dist/infrastructure/config.js');

      // Should either throw error or fallback to default
      assert.doesNotThrow(() => {
        const config = getConfig();
        // Should fallback to default if invalid
        assert.ok(
          ['error', 'warn', 'info', 'debug'].includes(config.logging.level)
        );
      });
    });

    it('should validate numeric ranges', async () => {
      process.env.CACHE_TTL = '-100'; // Invalid negative TTL
      process.env.METRICS_PORT = '99999'; // Invalid port range

      const { getConfig } = await import('../../dist/infrastructure/config.js');

      assert.doesNotThrow(() => {
        const config = getConfig();
        // Should use sensible defaults for invalid values
        assert.ok(config.cache.ttl > 0);
        assert.ok(
          config.metrics.port === undefined ||
            (config.metrics.port >= 1024 && config.metrics.port <= 65535)
        );
      });

      // Clean up
      delete process.env.CACHE_TTL;
      delete process.env.METRICS_PORT;
    });

    it('should validate required string fields', async () => {
      process.env.COURTLISTENER_BASE_URL = '';

      const { getConfig } = await import('../../dist/infrastructure/config.js');

      // Should either throw error or use default
      assert.doesNotThrow(() => {
        const config = getConfig();
        assert.ok(
          typeof config.courtListener.baseUrl === 'string' &&
            config.courtListener.baseUrl.length > 0
        );
      });

      delete process.env.COURTLISTENER_BASE_URL;
    });
  });

  describe('Security Configuration', () => {
    it('should parse security settings', async () => {
      process.env.AUTH_ENABLED = 'true';
      process.env.AUTH_API_KEYS = 'key1,key2,key3';
      process.env.RATE_LIMIT_ENABLED = 'true';
      process.env.RATE_LIMIT_MAX_REQUESTS = '50';
      process.env.SANITIZATION_ENABLED = 'false';

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.security.authEnabled, true);
      assert.strictEqual(config.security.apiKeys.length, 3);
      assert.strictEqual(config.security.apiKeys[0], 'key1');
      assert.strictEqual(config.security.rateLimitEnabled, true);
      assert.strictEqual(config.security.maxRequestsPerMinute, 50);
      assert.strictEqual(config.security.sanitizationEnabled, false);

      // Clean up
      delete process.env.AUTH_ENABLED;
      delete process.env.AUTH_API_KEYS;
      delete process.env.RATE_LIMIT_ENABLED;
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
      delete process.env.SANITIZATION_ENABLED;
    });

    it('should handle empty API keys array', async () => {
      process.env.AUTH_ENABLED = 'false';

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.security.authEnabled, false);
      assert.strictEqual(config.security.apiKeys.length, 0);

      delete process.env.AUTH_ENABLED;
    });
  });

  describe('Circuit Breaker Configuration', () => {
    it('should parse circuit breaker settings', async () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'true';
      process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = '10';
      process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD = '5';
      process.env.CIRCUIT_BREAKER_TIMEOUT = '15000';
      process.env.CIRCUIT_BREAKER_RESET_TIMEOUT = '120000';

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.circuitBreaker.enabled, true);
      assert.strictEqual(config.circuitBreaker.failureThreshold, 10);
      assert.strictEqual(config.circuitBreaker.successThreshold, 5);
      assert.strictEqual(config.circuitBreaker.timeout, 15000);
      assert.strictEqual(config.circuitBreaker.resetTimeout, 120000);

      // Clean up
      delete process.env.CIRCUIT_BREAKER_ENABLED;
      delete process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD;
      delete process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD;
      delete process.env.CIRCUIT_BREAKER_TIMEOUT;
      delete process.env.CIRCUIT_BREAKER_RESET_TIMEOUT;
    });
  });

  describe('Configuration Summary', () => {
    it('should provide configuration summary', async () => {
      const { getConfig } = await import('../../dist/infrastructure/config.js');
      const config = getConfig();

      // Verify config has expected structure
      assert.ok(config.courtListener);
      assert.ok(config.cache);
      assert.ok(config.logging);
      assert.ok(config.metrics);
      assert.ok(config.security);
      assert.ok(config.audit);
      assert.ok(config.circuitBreaker);
      assert.ok(config.compression);
    });
  });
});

