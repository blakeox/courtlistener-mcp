/**
 * OAuth 2.1 Registered Clients Store for Legal MCP Server
 * Manages client registration and lookup for MCP HTTP transport authentication
 */

import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import crypto from 'node:crypto';
import { getConfig } from '../infrastructure/config.js';

export class LegalOAuthClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  constructor() {
    this.registerDefaultClient();
  }

  private registerDefaultClient(): void {
    const cfg = getConfig();
    const clientId = cfg.oauth?.clientId;
    const clientSecret = cfg.oauth?.clientSecret;
    if (!clientId) return;

    const client: OAuthClientInformationFull = {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: ['http://localhost:3000/callback'],
      token_endpoint_auth_method: clientSecret ? 'client_secret_post' : 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Legal MCP Default Client',
      scope: 'legal:read legal:search legal:analyze',
    };

    this.clients.set(clientId, client);
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>,
  ): Promise<OAuthClientInformationFull> {
    const clientId = crypto.randomUUID();
    const isConfidential = client.token_endpoint_auth_method !== 'none';
    const clientSecret = isConfidential ? crypto.randomUUID() : undefined;

    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };

    this.clients.set(clientId, registered);
    return registered;
  }
}
