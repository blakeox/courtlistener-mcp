#!/usr/bin/env node

/**
 * OAuth 2.1 Authentication Flow Tests
 * Validates the OAuth provider and clients store work correctly.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LegalOAuthProvider } from '../../src/auth/oauth-provider.js';
import { LegalOAuthClientsStore } from '../../src/auth/oauth-clients-store.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

describe('OAuth Clients Store', () => {
  let store: LegalOAuthClientsStore;

  beforeEach(() => {
    store = new LegalOAuthClientsStore();
  });

  it('should register a new client and retrieve it', async () => {
    const registered = await store.registerClient({
      redirect_uris: ['http://localhost:4000/callback'],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Test Client',
      scope: 'legal:read legal:search',
    });

    assert.ok(registered.client_id, 'client_id should be assigned');
    assert.ok(registered.client_secret, 'client_secret should be assigned for confidential client');
    assert.ok(registered.client_id_issued_at, 'client_id_issued_at should be set');
    assert.strictEqual(registered.client_name, 'Test Client');

    const retrieved = await store.getClient(registered.client_id);
    assert.ok(retrieved, 'registered client should be retrievable');
    assert.strictEqual(retrieved!.client_id, registered.client_id);
    assert.strictEqual(retrieved!.client_secret, registered.client_secret);
  });

  it('should return undefined for unknown client', async () => {
    const result = await store.getClient('nonexistent-id');
    assert.strictEqual(result, undefined);
  });

  it('should register a public client without a secret', async () => {
    const registered = await store.registerClient({
      redirect_uris: ['http://localhost:4000/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      client_name: 'Public Client',
      scope: 'legal:read',
    });

    assert.ok(registered.client_id);
    assert.strictEqual(registered.client_secret, undefined);
  });
});

describe('OAuth Provider', () => {
  let provider: LegalOAuthProvider;
  let client: OAuthClientInformationFull;

  beforeEach(async () => {
    const store = new LegalOAuthClientsStore();
    provider = new LegalOAuthProvider(store);

    client = await store.registerClient({
      redirect_uris: ['http://localhost:4000/callback'],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Test OAuth Client',
      scope: 'legal:read legal:search legal:analyze',
    });
  });

  describe('Authorization code flow', () => {
    it('should issue an auth code via authorize and exchange it for tokens', async () => {
      // Use authorize() to generate an auth code by capturing the redirect
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'test-challenge',
          scopes: ['legal:read', 'legal:search'],
          state: 'test-state',
        },
        fakeRes,
      );

      assert.ok(redirectedUrl, 'should have redirected');
      const parsed = new URL(redirectedUrl);
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      assert.ok(code, 'redirect should contain auth code');
      assert.strictEqual(state, 'test-state');

      // challengeForAuthorizationCode should return the code challenge
      const challenge = await provider.challengeForAuthorizationCode(client, code!);
      assert.strictEqual(challenge, 'test-challenge');

      // Exchange the code for tokens
      const tokens = await provider.exchangeAuthorizationCode(client, code!);
      assert.ok(tokens.access_token, 'should have access_token');
      assert.ok(tokens.refresh_token, 'should have refresh_token');
      assert.strictEqual(tokens.token_type, 'Bearer');
      assert.strictEqual(tokens.expires_in, 3600);
      assert.ok(tokens.scope, 'should have scope');
    });

    it('should reject an invalid authorization code', async () => {
      await assert.rejects(() => provider.exchangeAuthorizationCode(client, 'invalid-code'), {
        message: 'Invalid authorization code',
      });
    });

    it('should reject auth code issued to a different client', async () => {
      // Register a second client
      const otherClient = await provider.clientsStore.registerClient({
        redirect_uris: ['http://localhost:5000/callback'],
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        client_name: 'Other Client',
        scope: 'legal:read',
      });

      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;

      await assert.rejects(() => provider.exchangeAuthorizationCode(otherClient, code), {
        message: 'Authorization code was issued to a different client',
      });
    });
  });

  describe('Token verification', () => {
    it('should verify a valid access token and return correct AuthInfo', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read', 'legal:search'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      const authInfo = await provider.verifyAccessToken(tokens.access_token);
      assert.strictEqual(authInfo.token, tokens.access_token);
      assert.strictEqual(authInfo.clientId, client.client_id);
      assert.ok(authInfo.scopes.includes('legal:read'));
      assert.ok(authInfo.scopes.includes('legal:search'));
      assert.ok(authInfo.expiresAt, 'should have expiresAt');
    });

    it('should reject an invalid access token', async () => {
      await assert.rejects(() => provider.verifyAccessToken('invalid-token'), {
        message: 'Invalid access token',
      });
    });
  });

  describe('Token refresh', () => {
    it('should exchange a refresh token for new access tokens', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read', 'legal:search'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      // Refresh using the refresh token
      const newTokens = await provider.exchangeRefreshToken(client, tokens.refresh_token!);
      assert.ok(newTokens.access_token, 'should have new access_token');
      assert.ok(newTokens.refresh_token, 'should have new refresh_token');
      assert.notStrictEqual(newTokens.access_token, tokens.access_token);

      // The new access token should be verifiable
      const authInfo = await provider.verifyAccessToken(newTokens.access_token);
      assert.strictEqual(authInfo.clientId, client.client_id);
    });

    it('should reject an invalid refresh token', async () => {
      await assert.rejects(() => provider.exchangeRefreshToken(client, 'bad-refresh-token'), {
        message: 'Invalid refresh token',
      });
    });

    it('should invalidate old refresh token after use', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      // First refresh succeeds
      await provider.exchangeRefreshToken(client, tokens.refresh_token!);

      // Second use of same refresh token should fail (token rotation)
      await assert.rejects(() => provider.exchangeRefreshToken(client, tokens.refresh_token!), {
        message: 'Invalid refresh token',
      });
    });
  });

  describe('Scope enforcement', () => {
    it('should return all supported scopes when none are requested', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: undefined as any,
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);
      const authInfo = await provider.verifyAccessToken(tokens.access_token);

      assert.ok(authInfo.scopes.includes('legal:read'));
      assert.ok(authInfo.scopes.includes('legal:search'));
      assert.ok(authInfo.scopes.includes('legal:analyze'));
    });

    it('should only grant requested valid scopes', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);
      const authInfo = await provider.verifyAccessToken(tokens.access_token);

      assert.deepStrictEqual(authInfo.scopes, ['legal:read']);
    });

    it('should narrow scopes on refresh when requested', async () => {
      let redirectedUrl = '';
      const fakeRes = {
        redirect: (_status: number, url: string) => {
          redirectedUrl = url;
        },
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: 'http://localhost:4000/callback',
          codeChallenge: 'challenge',
          scopes: ['legal:read', 'legal:search'],
        },
        fakeRes,
      );

      const code = new URL(redirectedUrl).searchParams.get('code')!;
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      // Refresh requesting only a subset of original scopes
      const newTokens = await provider.exchangeRefreshToken(client, tokens.refresh_token!, [
        'legal:read',
      ]);

      const authInfo = await provider.verifyAccessToken(newTokens.access_token);
      assert.deepStrictEqual(authInfo.scopes, ['legal:read']);
    });
  });
});
