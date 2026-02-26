#!/usr/bin/env node

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearSupabaseAuthValidationCacheForTests,
  getSupabaseConfig,
  validateSupabaseApiKey,
} from '../../src/server/supabase-auth.js';

afterEach(() => {
  clearSupabaseAuthValidationCacheForTests();
});

describe('supabase-auth config', () => {
  it('returns null when required vars are missing', () => {
    assert.equal(getSupabaseConfig({ SUPABASE_URL: 'https://x.supabase.co' }), null);
    assert.equal(getSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: 'k' }), null);
  });

  it('normalizes URL and default table', () => {
    const config = getSupabaseConfig({
      SUPABASE_URL: 'https://x.supabase.co/',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    assert.ok(config);
    assert.equal(config.url, 'https://x.supabase.co');
    assert.equal(config.apiKeysTable, 'mcp_api_keys');
  });
});

describe('supabase-auth key validation', () => {
  it('accepts active key record', async () => {
    const config = getSupabaseConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    assert.ok(config);

    const result = await validateSupabaseApiKey('plain-key', config, {
      fetchFn: async () =>
        new Response(
          JSON.stringify([
            {
              user_id: 'u1',
              is_active: true,
              revoked_at: null,
              expires_at: null,
            },
          ]),
          { status: 200 },
        ),
    });

    assert.equal(result.valid, true);
  });

  it('rejects expired key', async () => {
    const config = getSupabaseConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    assert.ok(config);

    const result = await validateSupabaseApiKey('plain-key', config, {
      fetchFn: async () =>
        new Response(
          JSON.stringify([
            {
              is_active: true,
              revoked_at: null,
              expires_at: '2000-01-01T00:00:00Z',
            },
          ]),
          { status: 200 },
        ),
    });

    assert.equal(result.valid, false);
    assert.equal(result.reason, 'api_key_expired');
  });

  it('de-duplicates concurrent lookups for same key', async () => {
    const config = getSupabaseConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });
    assert.ok(config);

    let fetchCalls = 0;
    const fetchFn: typeof fetch = async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(
        JSON.stringify([
          {
            user_id: 'u1',
            is_active: true,
            revoked_at: null,
            expires_at: null,
          },
        ]),
        { status: 200 },
      );
    };

    const [first, second] = await Promise.all([
      validateSupabaseApiKey('plain-key', config, { fetchFn }),
      validateSupabaseApiKey('plain-key', config, { fetchFn }),
    ]);

    assert.equal(first.valid, true);
    assert.equal(second.valid, true);
    assert.equal(fetchCalls, 1);
  });
});
