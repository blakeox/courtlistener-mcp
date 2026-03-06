#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handleWorkerOAuthEntrypoint,
  shouldInspectOAuthRoute,
} from '../../src/server/worker-oauth-entrypoint-runtime.js';

describe('worker OAuth entrypoint runtime', () => {
  it('identifies the OAuth routes that should emit diagnostics', () => {
    assert.equal(shouldInspectOAuthRoute('/token'), true);
    assert.equal(shouldInspectOAuthRoute('/.well-known/oauth-authorization-server'), true);
    assert.equal(shouldInspectOAuthRoute('/.well-known/oauth-protected-resource'), true);
    assert.equal(shouldInspectOAuthRoute('/.well-known/oauth-protected-resource/mcp'), true);
    assert.equal(shouldInspectOAuthRoute('/authorize'), false);
    assert.equal(shouldInspectOAuthRoute('/mcp'), false);
  });

  it('passes through non-diagnostic routes without summarizing', async () => {
    const calls: string[] = [];
    const response = await handleWorkerOAuthEntrypoint(
      new Request('https://worker.example/authorize'),
      {},
      {} as ExecutionContext,
      {
        cloudflareOAuthProvider: {
          fetch: async () => {
            calls.push('fetch');
            return new Response('ok');
          },
        },
        summarizeOAuthRequest: async () => {
          calls.push('summarize-request');
          return { route: 'authorize' };
        },
        summarizeOAuthResponse: async () => {
          calls.push('summarize-response');
          return { status: 200 };
        },
        emitOAuthDiagnostic: () => {
          calls.push('emit');
        },
      },
    );

    assert.equal(await response.text(), 'ok');
    assert.deepEqual(calls, ['fetch']);
  });

  it('summarizes and emits diagnostics for inspected routes', async () => {
    const calls: string[] = [];
    const emitted: Array<{ event: string; metadata: Record<string, unknown> }> = [];

    const response = await handleWorkerOAuthEntrypoint(
      new Request('https://worker.example/token'),
      {},
      {} as ExecutionContext,
      {
        cloudflareOAuthProvider: {
          fetch: async () => {
            calls.push('fetch');
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          },
        },
        summarizeOAuthRequest: async () => {
          calls.push('summarize-request');
          return { route: 'token', client_id: 'client-1' };
        },
        summarizeOAuthResponse: async () => {
          calls.push('summarize-response');
          return { status: 200 };
        },
        emitOAuthDiagnostic: (_env, event, metadata) => {
          calls.push('emit');
          emitted.push({ event, metadata });
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['summarize-request', 'fetch', 'summarize-response', 'emit']);
    assert.deepEqual(emitted, [
      {
        event: 'oauth.token.response',
        metadata: { route: 'token', client_id: 'client-1', status: 200 },
      },
    ]);
  });
});
