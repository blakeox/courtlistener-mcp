#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { handleWorkerOAuthRoutes, type WorkerOAuthRouteDeps } from '../../src/server/worker-oauth-routes.js';
import {
  HOSTED_MCP_OAUTH_CONTRACT,
} from '../../src/auth/oauth-contract.js';

type TestEnv = Record<string, unknown>;

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    extra.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function jsonError(message: string, status: number, errorCode: string): Response {
  return jsonResponse({ error: message, error_code: errorCode }, status);
}

function buildDeps(): WorkerOAuthRouteDeps<TestEnv> {
  return {
    jsonError,
    jsonResponse,
    withCors: (response: Response, origin: string | null) => {
      const headers = new Headers(response.headers);
      if (origin) {
        headers.set('access-control-allow-origin', origin);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}

describe('handleWorkerOAuthRoutes', () => {
  it('returns OAuth authorization-server metadata for discovery endpoint', async () => {
    const request = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata}`,
      { method: 'GET' },
    );
    const aliasRequest = new Request(
      'https://worker.example/mcp/.well-known/oauth-authorization-server',
      { method: 'GET' },
    );

    const response = await handleWorkerOAuthRoutes(
      {
        request,
        url: new URL(request.url),
        origin: 'https://claude.ai',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );
    const aliasResponse = await handleWorkerOAuthRoutes(
      {
        request: aliasRequest,
        url: new URL(aliasRequest.url),
        origin: 'https://claude.ai',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );

    assert.ok(response);
    assert.ok(aliasResponse);
    assert.equal(response.status, 200);
    assert.equal(aliasResponse.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://claude.ai');
    assert.equal(aliasResponse.headers.get('access-control-allow-origin'), 'https://claude.ai');
    const payload = (await response.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      response_modes_supported?: string[];
      revocation_endpoint?: string;
      client_id_metadata_document_supported?: boolean;
    };
    const aliasPayload = (await aliasResponse.json()) as {
      authorization_endpoint?: string;
      token_endpoint?: string;
      response_modes_supported?: string[];
      revocation_endpoint?: string;
      client_id_metadata_document_supported?: boolean;
    };
    assert.equal(payload.authorization_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`);
    assert.equal(payload.token_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
    assert.deepEqual(payload.response_modes_supported, ['query']);
    assert.equal(payload.revocation_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
    assert.equal(payload.client_id_metadata_document_supported, false);
    assert.equal(aliasPayload.authorization_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`);
    assert.equal(aliasPayload.token_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
    assert.deepEqual(aliasPayload.response_modes_supported, ['query']);
    assert.equal(aliasPayload.revocation_endpoint, `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`);
    assert.equal(aliasPayload.client_id_metadata_document_supported, false);
  });

  it('supports HEAD for OAuth discovery and protected-resource metadata endpoints', async () => {
    const metadataRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata}`,
      { method: 'HEAD' },
    );
    const openIdRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.openIdConfiguration}`,
      { method: 'HEAD' },
    );
    const protectedRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
      { method: 'HEAD' },
    );

    const metadataResponse = await handleWorkerOAuthRoutes(
      {
        request: metadataRequest,
        url: new URL(metadataRequest.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );
    const openIdResponse = await handleWorkerOAuthRoutes(
      {
        request: openIdRequest,
        url: new URL(openIdRequest.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );
    const protectedResponse = await handleWorkerOAuthRoutes(
      {
        request: protectedRequest,
        url: new URL(protectedRequest.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );

    assert.ok(metadataResponse);
    assert.ok(openIdResponse);
    assert.ok(protectedResponse);
    assert.equal(metadataResponse.status, 200);
    assert.equal(openIdResponse.status, 200);
    assert.equal(protectedResponse.status, 200);
    assert.equal(await metadataResponse.text(), '');
    assert.equal(await openIdResponse.text(), '');
    assert.equal(await protectedResponse.text(), '');
    assert.equal(metadataResponse.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    assert.equal(openIdResponse.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    assert.equal(protectedResponse.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    assert.equal(metadataResponse.headers.get('content-type'), 'application/json');
    assert.equal(openIdResponse.headers.get('content-type'), 'application/json');
    assert.equal(protectedResponse.headers.get('content-type'), 'application/json');
  });

  it('returns OAuth protected-resource metadata for root and /mcp resource paths', async () => {
    const rootRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata}`,
      { method: 'GET' },
    );
    const mcpRequest = new Request('https://worker.example/.well-known/oauth-protected-resource/mcp', {
      method: 'GET',
    });

    const rootResponse = await handleWorkerOAuthRoutes(
      {
        request: rootRequest,
        url: new URL(rootRequest.url),
        origin: 'https://claude.ai',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );
    const mcpResponse = await handleWorkerOAuthRoutes(
      {
        request: mcpRequest,
        url: new URL(mcpRequest.url),
        origin: 'https://claude.ai',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );

    assert.ok(rootResponse);
    assert.ok(mcpResponse);
    assert.equal(rootResponse.status, 200);
    assert.equal(mcpResponse.status, 200);
    assert.equal(rootResponse.headers.get('access-control-allow-origin'), 'https://claude.ai');
    assert.equal(mcpResponse.headers.get('access-control-allow-origin'), 'https://claude.ai');

    const rootPayload = (await rootResponse.json()) as {
      resource?: string;
      bearer_methods_supported?: string[];
      resource_name?: string;
    };
    const mcpPayload = (await mcpResponse.json()) as {
      resource?: string;
      bearer_methods_supported?: string[];
      resource_name?: string;
    };
    assert.equal(rootPayload.resource, 'https://worker.example');
    assert.equal(mcpPayload.resource, 'https://worker.example');
    assert.deepEqual(rootPayload.bearer_methods_supported, ['header']);
    assert.equal(rootPayload.resource_name, 'CourtListener MCP');
    assert.deepEqual(mcpPayload.bearer_methods_supported, ['header']);
    assert.equal(mcpPayload.resource_name, 'CourtListener MCP');
  });

  it('returns OpenID configuration for root and /mcp aliases', async () => {
    const rootRequest = new Request(
      `https://worker.example${HOSTED_MCP_OAUTH_CONTRACT.paths.openIdConfiguration}`,
      { method: 'GET' },
    );
    const aliasRequest = new Request(
      'https://worker.example/mcp/.well-known/openid-configuration',
      { method: 'GET' },
    );

    const rootResponse = await handleWorkerOAuthRoutes(
      {
        request: rootRequest,
        url: new URL(rootRequest.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );
    const aliasResponse = await handleWorkerOAuthRoutes(
      {
        request: aliasRequest,
        url: new URL(aliasRequest.url),
        origin: 'https://chatgpt.com',
        allowedOrigins: ['https://auth.courtlistenermcp.blakeoxford.com'],
        env: {},
      },
      buildDeps(),
    );

    assert.ok(rootResponse);
    assert.ok(aliasResponse);
    assert.equal(rootResponse.status, 200);
    assert.equal(aliasResponse.status, 200);
    assert.equal(rootResponse.headers.get('access-control-allow-origin'), 'https://chatgpt.com');
    assert.equal(aliasResponse.headers.get('access-control-allow-origin'), 'https://chatgpt.com');

    const rootPayload = (await rootResponse.json()) as { issuer?: string; registration_endpoint?: string };
    const aliasPayload = (await aliasResponse.json()) as { issuer?: string; registration_endpoint?: string };
    assert.equal(rootPayload.issuer, 'https://worker.example');
    assert.equal(aliasPayload.issuer, 'https://worker.example');
    assert.equal(rootPayload.registration_endpoint, 'https://worker.example/register');
    assert.equal(aliasPayload.registration_endpoint, 'https://worker.example/register');
  });
});
