import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mcpCallMock, toErrorMessageMock } = vi.hoisted(() => ({
  mcpCallMock: vi.fn(),
  toErrorMessageMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  mcpCall: mcpCallMock,
  toErrorMessage: toErrorMessageMock,
}));

import { verifyMcpRuntimeReadiness } from '../lib/mcp-runtime-readiness';

describe('verifyMcpRuntimeReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toErrorMessageMock.mockImplementation((error: unknown) => {
      if (error && typeof error === 'object' && 'message' in error) {
        return String((error as { message?: string }).message);
      }
      return 'unknown failure';
    });
  });

  it('emits a diagnostic when MCP transport does not return a session id', async () => {
    mcpCallMock
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.0' },
            capabilities: { tools: {} },
          },
        },
        sessionId: null,
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['query'] } }],
          },
        },
        sessionId: null,
      })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: null })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: null });

    const readiness = await verifyMcpRuntimeReadiness('token-123');

    expect(readiness.sessionId).toBe('');
    expect(readiness.diagnostics).toContain(
      'MCP transport did not return a session id; each call may renegotiate protocol state.',
    );
  });

  it('keeps readiness usable when resources and prompts discovery fail', async () => {
    mcpCallMock
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.0' },
            capabilities: { tools: {}, prompts: { listChanged: true } },
          },
        },
        sessionId: 'sid-1',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [{ name: 'search_cases', inputSchema: { type: 'object', required: ['query'] } }],
            metadata: { categories: ['search'] },
          },
        },
        sessionId: 'sid-1',
      })
      .mockRejectedValueOnce({ message: 'resource catalog unavailable' })
      .mockRejectedValueOnce({ message: 'prompt catalog unavailable' });

    const readiness = await verifyMcpRuntimeReadiness('token-123');

    expect(readiness.ready).toBe(true);
    expect(readiness.toolCount).toBe(1);
    expect(readiness.resourceCount).toBe(0);
    expect(readiness.promptCount).toBe(0);
    expect(readiness.diagnostics).toEqual([
      'Resources discovery unavailable: resource catalog unavailable',
      'Prompts discovery unavailable: prompt catalog unavailable',
    ]);
  });

  it('ignores malformed category entries and safely reduces odd capability payloads', async () => {
    mcpCallMock
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.0' },
            capabilities: {
              tools: {},
              resources: 'yes',
              prompts: false,
              logging: { structured: true, disabled: false },
            },
          },
        },
        sessionId: 'sid-2',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [],
            metadata: { categories: ['search', '', 123, 'diagnostics'] },
          },
        },
        sessionId: 'sid-2',
      })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: 'sid-2' })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: 'sid-2' });

    const readiness = await verifyMcpRuntimeReadiness('token-123');

    expect(readiness.toolCategories).toEqual(['search', 'diagnostics']);
    expect(readiness.capabilities).toEqual(['tools', 'resources', 'logging (structured)']);
  });

  it('counts required and constrained arguments when building guardrails', async () => {
    mcpCallMock
      .mockResolvedValueOnce({
        body: {
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'courtlistener-mcp', version: '1.0.0' },
            capabilities: { tools: {}, resources: { subscribe: true } },
          },
        },
        sessionId: 'sid-3',
      })
      .mockResolvedValueOnce({
        body: {
          result: {
            tools: [
              {
                name: 'search_cases',
                inputSchema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string', minLength: 1 },
                  },
                },
                metadata: { category: 'search' },
              },
              {
                name: 'list_courts',
                inputSchema: {
                  type: 'object',
                  properties: {
                    jurisdiction: { type: 'string' },
                  },
                },
                metadata: { category: 'courts' },
              },
            ],
            metadata: { categories: ['search', 'courts'] },
          },
        },
        sessionId: 'sid-3',
      })
      .mockResolvedValueOnce({ body: { result: { resources: [] } }, sessionId: 'sid-3' })
      .mockResolvedValueOnce({ body: { result: { prompts: [] } }, sessionId: 'sid-3' });

    const readiness = await verifyMcpRuntimeReadiness('token-123');

    expect(readiness.guardrails).toContain('1/2 tools enforce required arguments.');
    expect(readiness.guardrails).toContain(
      '1/2 tools declare schema constraints (min/max/enum/pattern).',
    );
    expect(readiness.guardrails).toContain('Server advertises 2 capability surface(s).');
    expect(readiness.guardrails).toContain('Resource catalog is empty or unavailable.');
    expect(readiness.guardrails).toContain('Prompt catalog is empty or unavailable.');
  });
});
