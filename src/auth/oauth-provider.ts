/**
 * OAuth 2.1 Server Provider for Legal MCP Server
 * Implements the OAuthServerProvider interface for MCP HTTP transport authentication.
 * Uses in-memory storage suitable for single-instance deployments.
 */

import { Response } from 'express';
import {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import crypto from 'node:crypto';
import { LegalOAuthClientsStore } from './oauth-clients-store.js';

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 86400; // 24 hours
const AUTH_CODE_TTL_MS = 600_000; // 10 minutes

const SUPPORTED_SCOPES = ['legal:read', 'legal:search', 'legal:analyze'];

interface StoredAuthCode {
  clientId: string;
  scopes: string[];
  codeChallenge: string;
  redirectUri: string;
  expiresAt: number;
  resource?: URL;
}

interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

export class LegalOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: LegalOAuthClientsStore;

  private authCodes = new Map<string, StoredAuthCode>();
  private accessTokens = new Map<string, StoredToken>();
  private refreshTokens = new Map<string, StoredToken>();

  constructor(clientsStore?: LegalOAuthClientsStore) {
    this.clientsStore = clientsStore ?? new LegalOAuthClientsStore();
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const scopes = this.validateScopes(params.scopes);
    const code = crypto.randomUUID();

    this.authCodes.set(code, {
      clientId: client.client_id,
      scopes,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
      ...(params.resource !== undefined && { resource: params.resource }),
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }

    res.redirect(302, redirectUrl.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error('Invalid authorization code');
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new Error('Invalid authorization code');
    }
    if (stored.clientId !== client.client_id) {
      throw new Error('Authorization code was issued to a different client');
    }
    if (Date.now() > stored.expiresAt) {
      this.authCodes.delete(authorizationCode);
      throw new Error('Authorization code has expired');
    }

    this.authCodes.delete(authorizationCode);

    return this.issueTokens(client.client_id, stored.scopes, resource ?? stored.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored) {
      throw new Error('Invalid refresh token');
    }
    if (stored.clientId !== client.client_id) {
      throw new Error('Refresh token was issued to a different client');
    }
    if (Date.now() / 1000 > stored.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      throw new Error('Refresh token has expired');
    }

    this.refreshTokens.delete(refreshToken);

    // Requested scopes must be a subset of original scopes
    const effectiveScopes = scopes?.length
      ? scopes.filter((s) => stored.scopes.includes(s))
      : stored.scopes;

    return this.issueTokens(client.client_id, effectiveScopes, resource ?? stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored) {
      throw new Error('Invalid access token');
    }
    if (Date.now() / 1000 > stored.expiresAt) {
      this.accessTokens.delete(token);
      throw new Error('Access token has expired');
    }

    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt,
      ...(stored.resource !== undefined && { resource: stored.resource }),
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const { token, token_type_hint } = request;

    if (token_type_hint === 'refresh_token') {
      this.refreshTokens.delete(token);
    } else if (token_type_hint === 'access_token') {
      this.accessTokens.delete(token);
    } else {
      // No hint — try both
      this.accessTokens.delete(token);
      this.refreshTokens.delete(token);
    }
  }

  private validateScopes(scopes?: string[]): string[] {
    if (!scopes?.length) return [...SUPPORTED_SCOPES];
    const valid = scopes.filter((s) => SUPPORTED_SCOPES.includes(s));
    if (valid.length === 0) {
      throw new Error(`No valid scopes requested. Supported: ${SUPPORTED_SCOPES.join(', ')}`);
    }
    return valid;
  }

  private issueTokens(clientId: string, scopes: string[], resource?: URL): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();

    this.accessTokens.set(accessToken, {
      clientId,
      scopes,
      expiresAt: now + ACCESS_TOKEN_TTL_SECONDS,
      ...(resource !== undefined && { resource }),
    });

    this.refreshTokens.set(refreshToken, {
      clientId,
      scopes,
      expiresAt: now + REFRESH_TOKEN_TTL_SECONDS,
      ...(resource !== undefined && { resource }),
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: scopes.join(' '),
      refresh_token: refreshToken,
    };
  }
}
