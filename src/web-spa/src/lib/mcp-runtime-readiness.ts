import { mcpCall } from './api';

interface McpToolsListResult {
  tools?: unknown[];
}

function extractToolCount(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  if ('result' in payload) {
    const result = (payload as { result?: McpToolsListResult }).result;
    return Array.isArray(result?.tools) ? result.tools.length : 0;
  }
  const directTools = (payload as McpToolsListResult).tools;
  return Array.isArray(directTools) ? directTools.length : 0;
}

export async function verifyMcpRuntimeReadiness(token: string): Promise<{ ready: true; sessionId: string; toolCount: number }> {
  const initialized = await mcpCall<unknown>({
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'courtlistener-spa-onboarding', version: '1.0.0' },
    },
    id: 90_001,
  }, token);

  const listed = await mcpCall<unknown>({
    method: 'tools/list',
    params: {},
    sessionId: initialized.sessionId ?? undefined,
    id: 90_002,
  }, token);

  return {
    ready: true,
    sessionId: listed.sessionId ?? initialized.sessionId ?? '',
    toolCount: extractToolCount(listed.body),
  };
}
