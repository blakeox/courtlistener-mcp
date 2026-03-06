#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerDynamicClientRegistration } from '../../src/server/worker-oauth-registration.js';

interface ClientRecord {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  clientName?: string;
  logoUri?: string;
  clientUri?: string;
  policyUri?: string;
  tosUri?: string;
  jwksUri?: string;
  contacts?: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  registrationDate?: number;
  tokenEndpointAuthMethod: string;
}

interface TestEnv {
  MCP_OAUTH_DIAGNOSTICS?: string;
}

function makeJsonError(error: string, errorDescription: string, status = 400): Response {
  return new Response(
    JSON.stringify({
      error,
      error_description: errorDescription,
    }),
    {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
}

function buildDeps(records: Map<string, ClientRecord>) {
  let createdCount = 0;

  return {
    getRequestOrigin: (request: Request) => new URL(request.url).origin,
    getRegistrationAllowedOrigins: () => ['https://chatgpt.com'],
    isAllowedOrigin: (origin: string | null, allowedOrigins: string[]) =>
      origin === null || allowedOrigins.includes(origin),
    extractBearerToken: (authorizationHeader: string | null) =>
      authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7).trim() : null,
    buildCorsHeaders: (origin: string | null) => {
      const headers = new Headers();
      if (origin) headers.set('access-control-allow-origin', origin);
      return headers;
    },
    withRegistrationCors: (response: Response, request: Request) => {
      const headers = new Headers(response.headers);
      const origin = request.headers.get('origin');
      if (origin) headers.set('access-control-allow-origin', origin);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
    jsonRegistrationError: makeJsonError,
    getOAuthHelpers: () => ({
      async createClient(clientInfo: Partial<ClientRecord>) {
        createdCount += 1;
        const record: ClientRecord = {
          clientId: `client-${createdCount}`,
          clientSecret: `secret-${createdCount}`,
          redirectUris: clientInfo.redirectUris ?? [],
          clientName: clientInfo.clientName,
          logoUri: clientInfo.logoUri,
          clientUri: clientInfo.clientUri,
          policyUri: clientInfo.policyUri,
          tosUri: clientInfo.tosUri,
          jwksUri: clientInfo.jwksUri,
          contacts: clientInfo.contacts,
          grantTypes: clientInfo.grantTypes,
          responseTypes: clientInfo.responseTypes,
          registrationDate: 1700000000 + createdCount,
          tokenEndpointAuthMethod: clientInfo.tokenEndpointAuthMethod ?? 'client_secret_post',
        };
        records.set(record.clientId, record);
        return record;
      },
      async lookupClient(clientId: string) {
        return records.get(clientId) ?? null;
      },
      async updateClient(clientId: string, updates: Partial<ClientRecord>) {
        const existing = records.get(clientId);
        if (!existing) return null;
        const updated: ClientRecord = {
          ...existing,
          ...updates,
          clientId: existing.clientId,
          clientSecret: existing.clientSecret,
        };
        records.set(clientId, updated);
        return updated;
      },
      async deleteClient(clientId: string) {
        records.delete(clientId);
      },
    }),
    createRegistrationAccessToken: async (_env: TestEnv, clientId: string) => `token:${clientId}`,
    verifyRegistrationAccessToken: async (_env: TestEnv, clientId: string, presentedToken: string) =>
      presentedToken === `token:${clientId}`,
  };
}

describe('worker OAuth registration', () => {
  it('creates a client and returns registration management details', async () => {
    const records = new Map<string, ClientRecord>();
    const request = new Request('https://worker.example/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://chatgpt.com',
      },
      body: JSON.stringify({
        redirect_uris: ['https://chatgpt.com/aip/callback'],
        client_name: 'ChatGPT',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
      }),
    });

    const response = await handleWorkerDynamicClientRegistration(request, {}, buildDeps(records));
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 201);
    assert.equal(payload.client_id, 'client-1');
    assert.equal(payload.registration_client_uri, 'https://worker.example/register/client-1');
    assert.equal(payload.registration_access_token, 'token:client-1');
    assert.equal(payload.client_secret, 'secret-1');
  });

  it('rejects PUT with an explicitly empty redirect_uris list', async () => {
    const records = new Map<string, ClientRecord>([
      [
        'client-7',
        {
          clientId: 'client-7',
          clientSecret: 'secret-7',
          redirectUris: ['https://chatgpt.com/aip/callback'],
          clientName: 'Existing',
          registrationDate: 1700000007,
          tokenEndpointAuthMethod: 'client_secret_post',
        },
      ],
    ]);

    const request = new Request('https://worker.example/register/client-7', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token:client-7',
        origin: 'https://chatgpt.com',
      },
      body: JSON.stringify({
        redirect_uris: [],
      }),
    });

    const response = await handleWorkerDynamicClientRegistration(request, {}, buildDeps(records));
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 400);
    assert.equal(payload.error, 'invalid_client_metadata');
    assert.match(String(payload.error_description), /redirect_uris cannot be empty/i);
  });

  it('does not expose client_secret on registration management GET', async () => {
    const records = new Map<string, ClientRecord>([
      [
        'client-9',
        {
          clientId: 'client-9',
          clientSecret: 'secret-9',
          redirectUris: ['https://chatgpt.com/aip/callback'],
          clientName: 'Existing',
          registrationDate: 1700000009,
          tokenEndpointAuthMethod: 'client_secret_post',
        },
      ],
    ]);

    const request = new Request('https://worker.example/register/client-9', {
      method: 'GET',
      headers: {
        authorization: 'Bearer token:client-9',
        origin: 'https://chatgpt.com',
      },
    });

    const response = await handleWorkerDynamicClientRegistration(request, {}, buildDeps(records));
    const payload = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.client_id, 'client-9');
    assert.equal('client_secret' in payload, false);
    assert.equal(payload.registration_access_token, 'token:client-9');
  });
});
