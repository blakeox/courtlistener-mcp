import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createKey, getSession, mcpCall, toErrorMessage } from '../lib/api';

function setCookie(value: string): void {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => value,
    set: vi.fn(),
  });
}

describe('api transport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCookie('');
  });

  it('adds x-csrf-token for mutating requests but not GET requests', async () => {
    setCookie('clmcp_csrf=test-csrf-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true, user: { id: 'u1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'ok',
            api_key: {
              id: 'k1',
              label: 'primary',
              created_at: '2024-01-01',
              expires_at: null,
              token: 'secret',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await getSession();
    await createKey({ label: 'primary', expiresDays: 30 }, 'token-123');

    const getHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    const postHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);

    expect(getHeaders.get('x-csrf-token')).toBeNull();
    expect(postHeaders.get('x-csrf-token')).toBe('test-csrf-token');
  });

  it('parses SSE data payloads and returns the MCP session id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('event: message\ndata: {"result":{"ok":true}}\n\n', {
          status: 200,
          headers: { 'mcp-session-id': 'session-123' },
        }),
      ),
    );

    const result = await mcpCall(
      { method: 'tools/list', params: {}, id: 1, sessionId: 'session-old' },
      'token-123',
    );

    expect(result).toEqual({
      body: { result: { ok: true } },
      sessionId: 'session-123',
    });
    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get('mcp-session-id')).toBe('session-old');
    expect(headers.get('MCP-Protocol-Version')).toBe('2025-06-18');
  });

  it('throws mcp_call_failed on non-2xx MCP responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('upstream failure', { status: 502 })),
    );

    await expect(
      mcpCall({ method: 'tools/list', params: {}, id: 1 }, 'token-123'),
    ).rejects.toMatchObject({
      status: 502,
      error: 'mcp_call_failed',
      message: 'upstream failure',
    });
  });

  it('throws mcp_error when JSON-RPC returns an error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: -32_000,
              message: 'Tool execution failed.',
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      mcpCall({ method: 'tools/call', params: { name: 'x' }, id: 2 }, 'token-123'),
    ).rejects.toMatchObject({
      status: 0,
      error: 'mcp_error',
      message: 'Tool execution failed.',
    });
  });

  it('formats retry_after_seconds into a user-facing retry hint', () => {
    expect(
      toErrorMessage({
        message: 'Rate limited.',
        retry_after_seconds: 12.9,
      }),
    ).toBe('Rate limited. Retry in 12s.');
  });
});
