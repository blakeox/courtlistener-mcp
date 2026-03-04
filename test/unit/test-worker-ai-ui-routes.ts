#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleWorkerAiUiRoutes,
  type HandleWorkerAiUiRoutesDeps,
} from '../../src/server/worker-ai-ui-routes.js';

type TestEnv = {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
};

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

function buildDeps(
  overrides: Partial<HandleWorkerAiUiRoutesDeps<TestEnv>> = {},
): HandleWorkerAiUiRoutesDeps<TestEnv> {
  return {
    jsonError,
    jsonResponse,
    rejectDisallowedUiOrigin: () => null,
    authenticateUiApiRequest: async () => ({ userId: 'user-1', authType: 'api_key' }),
    applyAiChatLifetimeQuota: async () => null,
    requireCsrfToken: () => null,
    parseJsonBody: async <T>(request: Request) => (await request.json()) as T,
    isPlainObject: (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && !Array.isArray(value),
    aiToolFromPrompt: () => ({ tool: 'search_cases', reason: 'auto' }),
    callMcpJsonRpc: async () => ({ payload: { result: {} }, sessionId: 'session-1' }),
    hasValidMcpRpcShape: () => true,
    aiToolArguments: () => ({}),
    buildLowCostSummary: () => 'fallback',
    buildMcpSystemPrompt: () => 'system',
    extractMcpContext: () => 'context',
    preferredMcpProtocolVersion: '2024-11-05',
    defaultCfAiModelBalanced: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    defaultCfAiModelCheap: '@cf/meta/llama-3.1-8b-instruct',
    cheapModeMaxTokens: 450,
    balancedModeMaxTokens: 900,
    ...overrides,
  };
}

describe('handleWorkerAiUiRoutes', () => {
  it('enforces CSRF for session auth on POST /api/ai-chat', async () => {
    const csrfResponse = jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed');
    const request = new Request('https://example.com/api/ai-chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'hello world' }),
    });

    const response = await handleWorkerAiUiRoutes({
      context: {
        request,
        url: new URL(request.url),
        origin: 'https://example.com',
        allowedOrigins: ['https://example.com'],
        env: {},
        ctx: {},
      },
      deps: buildDeps({
        authenticateUiApiRequest: async () => ({ userId: 'session-user', authType: 'session' }),
        requireCsrfToken: () => csrfResponse,
      }),
    });

    assert.equal(response, csrfResponse);
  });

  it('returns ai_unavailable when POST /api/ai-plain has no AI binding', async () => {
    const request = new Request('https://example.com/api/ai-plain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'summarize this', mode: 'cheap' }),
    });

    const response = await handleWorkerAiUiRoutes({
      context: {
        request,
        url: new URL(request.url),
        origin: 'https://example.com',
        allowedOrigins: ['https://example.com'],
        env: {},
        ctx: {},
      },
      deps: buildDeps(),
    });

    assert.ok(response);
    assert.equal(response.status, 502);
    const payload = (await response.json()) as { error_code?: string };
    assert.equal(payload.error_code, 'ai_unavailable');
  });
});
