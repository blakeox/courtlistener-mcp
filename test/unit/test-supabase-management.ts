#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getSupabaseSignupConfig,
  resetPasswordWithAccessToken,
  sendPasswordResetEmail,
} from '../../src/server/supabase-management.js';

describe('supabase-management signup config', () => {
  it('returns null when required vars are missing', () => {
    assert.equal(getSupabaseSignupConfig({ SUPABASE_URL: 'https://x.supabase.co' }), null);
    assert.equal(getSupabaseSignupConfig({ SUPABASE_PUBLISHABLE_KEY: 'anon' }), null);
  });

  it('normalizes URL and reads publishable key', () => {
    const config = getSupabaseSignupConfig({
      SUPABASE_URL: 'https://x.supabase.co/',
      SUPABASE_PUBLISHABLE_KEY: 'anon',
    });
    assert.ok(config);
    assert.equal(config.url, 'https://x.supabase.co');
    assert.equal(config.anonKey, 'anon');
  });
});

describe('supabase-management password reset helpers', () => {
  it('sendPasswordResetEmail posts recover payload', async () => {
    let observedUrl = '';
    let observedMethod = '';
    let observedBody = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      observedUrl = String(input);
      observedMethod = init?.method || '';
      observedBody = String(init?.body || '');
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      await sendPasswordResetEmail(
        { url: 'https://x.supabase.co', anonKey: 'anon' },
        'USER@EXAMPLE.COM',
        { redirectTo: 'https://app.example.com/app/reset-password' },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(observedUrl, 'https://x.supabase.co/auth/v1/recover');
    assert.equal(observedMethod, 'POST');
    const payload = JSON.parse(observedBody) as { email?: string; redirect_to?: string };
    assert.equal(payload.email, 'user@example.com');
    assert.equal(payload.redirect_to, 'https://app.example.com/app/reset-password');
  });

  it('sendPasswordResetEmail throws on upstream error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'upstream_failed' }), {
        status: 500,
      })) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          sendPasswordResetEmail(
            { url: 'https://x.supabase.co', anonKey: 'anon' },
            'user@example.com',
          ),
        /password_reset_email_failed/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('resetPasswordWithAccessToken updates password with bearer token', async () => {
    let observedUrl = '';
    let observedMethod = '';
    let observedAuth = '';
    let observedBody = '';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      observedUrl = String(input);
      observedMethod = init?.method || '';
      observedAuth = new Headers(init?.headers).get('Authorization') || '';
      observedBody = String(init?.body || '');
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      await resetPasswordWithAccessToken(
        { url: 'https://x.supabase.co', anonKey: 'anon' },
        'recovery-token',
        'NewPassword123',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(observedUrl, 'https://x.supabase.co/auth/v1/user');
    assert.equal(observedMethod, 'PUT');
    assert.equal(observedAuth, 'Bearer recovery-token');
    const payload = JSON.parse(observedBody) as { password?: string };
    assert.equal(payload.password, 'NewPassword123');
  });

  it('resetPasswordWithAccessToken rejects missing token', async () => {
    await assert.rejects(
      () =>
        resetPasswordWithAccessToken(
          { url: 'https://x.supabase.co', anonKey: 'anon' },
          '   ',
          'NewPassword123',
        ),
      /access_token_required/i,
    );
  });

  it('resetPasswordWithAccessToken throws on upstream error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'token_expired' }), {
        status: 401,
      })) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          resetPasswordWithAccessToken(
            { url: 'https://x.supabase.co', anonKey: 'anon' },
            'bad-token',
            'NewPassword123',
          ),
        /password_reset_failed/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
