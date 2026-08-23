#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Configuration Management (TypeScript)
 * Tests environment variable parsing, validation, and default values
 */

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

async function importConfigFresh(): Promise<typeof import('../../dist/infrastructure/config.js')> {
  const suffix = `${Date.now()}-${Math.random()}`;
  const config = await import(`../../dist/infrastructure/config.js?t=${suffix}`);
  return {
    ...config,
    getConfig: (environment = process.env) => config.getConfig(environment),
  };
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
      process.env.COURTLISTENER_TIMEOUT = '45000';
      process.env.COURTLISTENER_RATE_LIMIT = '150';

      // Import config after setting env vars
      const { getConfig } = await import('../../dist/infrastructure/config.js');
      const config = getConfig(process.env);

      assert.strictEqual(config.cache.enabled, true);
      assert.strictEqual(config.cache.ttl, 600);
      assert.strictEqual(config.cache.maxSize, 2000);
      assert.strictEqual(config.logging.level, 'debug');
      assert.strictEqual(config.logging.format, 'json');
      assert.strictEqual(config.courtListener.timeout, 45000);
      assert.strictEqual(config.courtListener.rateLimitPerMinute, 150);
    });

    it('should use default values when env vars are missing', async () => {
      // Clear all relevant env vars
      delete process.env.CACHE_ENABLED;
      delete process.env.CACHE_TTL;
      delete process.env.LOG_LEVEL;
      delete process.env.CACHE_MAX_SIZE;

      // Use timestamp to force fresh import
      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      // Use actual defaults from config.ts
      assert.strictEqual(config.cache.enabled, true); // CACHE_ENABLED !== 'false' defaults to true
      assert.strictEqual(config.cache.ttl, 300); // Default: 5 minutes (300 seconds)
      assert.strictEqual(config.cache.maxSize, 1000); // Default: 1000
      assert.strictEqual(config.logging.level, 'info'); // Default: info
    });

    it('should handle boolean environment variables', async () => {
      // Test actual boolean parsing behavior from config.ts
      process.env.CACHE_ENABLED = 'false'; // !== 'false' = false
      process.env.LOGGING_ENABLED = 'false'; // !== 'false' = false

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.cache.enabled, false);
      assert.strictEqual(config.logging.enabled, false);

      // Clean up
      delete process.env.CACHE_ENABLED;
      delete process.env.LOGGING_ENABLED;
    });

    it('should handle numeric environment variables', async () => {
      process.env.CACHE_TTL = '900';
      process.env.CACHE_MAX_SIZE = '5000';
      process.env.COURTLISTENER_TIMEOUT = '60000';

      // Use timestamp to force fresh import
      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.cache.ttl, 900);
      assert.strictEqual(config.cache.maxSize, 5000);
      assert.strictEqual(config.courtListener.timeout, 60000);

      // Clean up
      delete process.env.CACHE_TTL;
      delete process.env.CACHE_MAX_SIZE;
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
        assert.ok(['error', 'warn', 'info', 'debug'].includes(config.logging.level));
      });
    });

    it('should validate numeric ranges', async () => {
      process.env.CACHE_TTL = '-100'; // Invalid negative TTL

      const { getConfig } = await import('../../dist/infrastructure/config.js');

      assert.doesNotThrow(() => {
        const config = getConfig();
        // Should use sensible defaults for invalid values
        assert.ok(config.cache.ttl > 0);
      });

      // Clean up
      delete process.env.CACHE_TTL;
    });

    it('should validate required string fields', async () => {
      process.env.COURTLISTENER_BASE_URL = '';

      const { getConfig } = await import('../../dist/infrastructure/config.js');

      // Should either throw error or use default
      assert.doesNotThrow(() => {
        const config = getConfig();
        assert.ok(
          typeof config.courtListener.baseUrl === 'string' &&
            config.courtListener.baseUrl.length > 0,
        );
      });

      delete process.env.COURTLISTENER_BASE_URL;
    });
  });

  describe('Security Configuration', () => {
    it('should parse security settings', async () => {
      process.env.AUTH_ENABLED = 'true';
      process.env.AUTH_API_KEYS = 'key1,key2,key3';

      const { getConfig } = await importConfigFresh();
      const config = getConfig();

      assert.strictEqual(config.security.authEnabled, true);
      assert.strictEqual(config.security.apiKeys.length, 3);
      assert.strictEqual(config.security.apiKeys[0], 'key1');

      // Clean up
      delete process.env.AUTH_ENABLED;
      delete process.env.AUTH_API_KEYS;
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

  describe('Auth Policy Matrix', () => {
    it('should fail fast when OAuth and OIDC are both enabled', async () => {
      process.env.OAUTH_ENABLED = 'true';
      process.env.OIDC_ISSUER = 'https://issuer.example.com';

      const { getConfig } = await importConfigFresh();

      assert.throws(() => getConfig(), /OAuth and OIDC auth cannot both be enabled at startup/);
    });

    it('should expose canonical auth precedence without leaking secrets', async () => {
      process.env.MCP_AUTH_TOKEN = 'static-secret-token';
      process.env.OIDC_ISSUER = 'https://issuer.example.com';

      const { getStartupDiagnostics } = await importConfigFresh();
      const diagnostics = getStartupDiagnostics() as {
        authPolicy?: { effectivePrimary?: string; precedence?: string[] };
      };

      assert.strictEqual(diagnostics.authPolicy?.effectivePrimary, 'oidc');
      assert.deepStrictEqual(diagnostics.authPolicy?.precedence, ['oauth', 'serviceToken', 'oidc']);

      const serialized = JSON.stringify(diagnostics);
      assert.strictEqual(serialized.includes('static-secret-token'), false);
    });

    it('should warn when scoped Cloudflare Access trust is enabled', async () => {
      process.env.MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION = 'true';
      process.env.MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS = 'true';

      const { getStartupDiagnostics } = await importConfigFresh();
      const diagnostics = getStartupDiagnostics() as {
        invariants?: { warnings?: string[] };
      };

      assert.ok(
        diagnostics.invariants?.warnings?.some((warning) =>
          warning.includes('MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION is enabled'),
        ),
      );
      assert.ok(
        diagnostics.invariants?.warnings?.some((warning) =>
          warning.includes('MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS is enabled'),
        ),
      );
    });

    it('should fail fast when hosted auth client config is present without MCP_UI_SESSION_SECRET', async () => {
      process.env.OIDC_ISSUER = 'https://issuer.example.com';
      process.env.MCP_AUTH_OIDC_CLIENT_ID = 'worker-client-id';
      process.env.MCP_AUTH_OIDC_CLIENT_SECRET = 'worker-client-secret';

      const { getConfig, getStartupDiagnostics } = await importConfigFresh();

      assert.throws(() => getConfig(), /Hosted auth requires MCP_UI_SESSION_SECRET/);

      const diagnostics = getStartupDiagnostics() as {
        hostedAuth?: { ready?: boolean; errors?: string[] };
      };
      assert.strictEqual(diagnostics.hostedAuth?.ready, false);
      assert.ok(
        diagnostics.hostedAuth?.errors?.some((error) => error.includes('MCP_UI_SESSION_SECRET')),
      );
    });

    it('should fail fast on partial Worker-native hosted auth config', async () => {
      process.env.OIDC_ISSUER = 'https://issuer.example.com';
      process.env.MCP_AUTH_OIDC_CLIENT_ID = 'worker-client-id';
      process.env.MCP_UI_SESSION_SECRET = 'session-secret';

      const { getConfig, getStartupDiagnostics } = await importConfigFresh();

      assert.throws(() => getConfig(), /Hosted auth upstream OIDC config is incomplete/);

      const diagnostics = getStartupDiagnostics() as {
        hostedAuth?: { ready?: boolean; credentialSource?: string | null; errors?: string[] };
      };
      assert.strictEqual(diagnostics.hostedAuth?.ready, false);
      assert.strictEqual(diagnostics.hostedAuth?.credentialSource, null);
      assert.ok(
        diagnostics.hostedAuth?.errors?.some((error) => error.includes('MCP_AUTH_OIDC_CLIENT_ID')),
      );
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
      assert.ok(config.security);
    });
  });
});
