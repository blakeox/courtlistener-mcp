import type { Env } from './worker-runtime-contract.js';
import type { PrincipalContext } from '../infrastructure/principal-context.js';

interface McpJsonRpcResponse<T> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface CreateWorkerMcpAiRuntimeDeps {
  authorizeMcpGatewayRequest: (params: {
    request: Request;
    env: Env;
    supportedProtocolVersions: Set<string>;
  }) => Promise<{
    principal?: PrincipalContext;
    authError?: Response | null;
  }>;
  runWithPrincipalContext: <T>(principal: PrincipalContext | undefined, callback: () => T) => T;
  mcpStreamableFetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  preferredMcpProtocolVersion: string;
  supportedMcpProtocolVersions: Set<string>;
  redactSecretsInText: (value: string) => string;
  incrementUserUsage: (
    env: Env,
    userId: string,
    metadata?: { route?: string; method?: string },
  ) => Promise<void>;
}

export interface WorkerMcpAiRuntime {
  callMcpJsonRpc(
    env: Env,
    ctx: ExecutionContext,
    token: string,
    method: string,
    params: Record<string, unknown>,
    id: number,
    sessionId?: string,
  ): Promise<{ payload: unknown; sessionId: string | null }>;
  recordAuthorizedMcpUsage(
    request: Request,
    env: Env,
    principal: { userId?: string } | undefined,
  ): Promise<void>;
}

function requireNumericIdentifier(
  prompt: string,
  fieldName: string,
  entityLabel: string,
): Record<string, string> {
  const idMatch = prompt.match(/\b(\d+)\b/);
  const identifier = idMatch?.[1];
  if (!identifier) {
    throw new Error(`${entityLabel} requires an explicit numeric identifier.`);
  }
  return { [fieldName]: identifier };
}

function extractMcpResponseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (dataLines.length === 0) return {};
  return JSON.parse(dataLines[dataLines.length - 1] ?? '{}');
}

export function aiToolFromPrompt(message: string): { tool: string; reason: string } {
  const normalized = message.toLowerCase();
  if (/\d+\s+(u\.?s\.?|s\.?\s*ct\.?|f\.\s*\d|f\.?\s*supp)/i.test(message) || normalized.includes('v.')) {
    return { tool: 'lookup_citation', reason: 'Query contains a legal citation pattern (e.g., "v." or reporter reference).' };
  }
  if (normalized.includes('opinion') || normalized.includes('holding') || normalized.includes('ruling')) {
    return { tool: 'search_opinions', reason: 'Query mentions opinions, holdings, or rulings.' };
  }
  if (normalized.includes('judge') && (normalized.includes('profile') || normalized.includes('background') || normalized.includes('record'))) {
    return { tool: 'get_comprehensive_judge_profile', reason: 'Query asks for a judge profile or background.' };
  }
  if (normalized.includes('court') && (normalized.includes('list') || normalized.includes('which') || normalized.includes('all'))) {
    return { tool: 'list_courts', reason: 'Query asks to list or identify courts.' };
  }
  if (normalized.includes('docket') || normalized.includes('filing')) {
    return { tool: 'get_docket_entries', reason: 'Query mentions dockets or filings.' };
  }
  if (normalized.includes('citation') && (normalized.includes('valid') || normalized.includes('check') || normalized.includes('verify'))) {
    return { tool: 'validate_citations', reason: 'Query asks to validate or check citations.' };
  }
  if (normalized.includes('argument') || normalized.includes('precedent') || normalized.includes('legal analysis')) {
    return { tool: 'analyze_legal_argument', reason: 'Query involves legal argument analysis or precedent research.' };
  }
  return { tool: 'search_cases', reason: 'Default: general case search for broad legal queries.' };
}

export function aiToolArguments(toolName: string, prompt: string): Record<string, unknown> {
  if (toolName === 'lookup_citation') {
    return { citation: prompt };
  }
  if (toolName === 'validate_citations') {
    return { text: prompt };
  }
  if (toolName === 'analyze_legal_argument') {
    return { argument: prompt, search_query: prompt };
  }
  if (toolName === 'list_courts') {
    return {};
  }
  if (toolName === 'get_comprehensive_judge_profile' || toolName === 'get_judge') {
    return requireNumericIdentifier(prompt, 'judge_id', 'Judge lookup');
  }
  if (toolName === 'get_docket_entries') {
    return requireNumericIdentifier(prompt, 'docket', 'Docket lookup');
  }
  if (toolName === 'get_case_details' || toolName === 'get_comprehensive_case_analysis') {
    return requireNumericIdentifier(prompt, 'cluster_id', 'Case lookup');
  }
  if (toolName === 'get_opinion_text') {
    return requireNumericIdentifier(prompt, 'opinion_id', 'Opinion lookup');
  }
  if (toolName === 'get_citation_network') {
    return { ...requireNumericIdentifier(prompt, 'opinion_id', 'Citation network lookup'), depth: 2 };
  }
  if (toolName === 'smart_search') {
    return { query: prompt, max_results: 5 };
  }
  return {
    query: prompt,
    page_size: 5,
    order_by: 'score desc',
  };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasValidMcpRpcShape(payload: unknown): boolean {
  if (!isPlainObject(payload)) return false;
  if ('error' in payload && isPlainObject(payload.error)) return true;
  if ('result' in payload) return true;
  return false;
}

export function createWorkerMcpAiRuntime(deps: CreateWorkerMcpAiRuntimeDeps): WorkerMcpAiRuntime {
  return {
    async callMcpJsonRpc(
      env: Env,
      ctx: ExecutionContext,
      token: string,
      method: string,
      params: Record<string, unknown>,
      id: number,
      sessionId?: string,
    ): Promise<{ payload: unknown; sessionId: string | null }> {
      const serviceToken = env.MCP_AUTH_TOKEN?.trim() || null;
      const callerToken = token.trim();
      const effectiveToken = callerToken || serviceToken;
      if (!effectiveToken) {
        throw new Error('MCP bearer token is required for internal MCP calls.');
      }

      const headers = new Headers({
        authorization: `Bearer ${effectiveToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': deps.preferredMcpProtocolVersion,
      });
      if (sessionId) {
        headers.set('mcp-session-id', sessionId);
      }
      if (serviceToken && serviceToken === effectiveToken) {
        const serviceHeader = env.MCP_SERVICE_TOKEN_HEADER?.trim() || 'x-mcp-service-token';
        headers.set(serviceHeader, serviceToken);
      }

      const mcpRequest = new Request('https://mcp.internal/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
      });

      const authResult = await deps.authorizeMcpGatewayRequest({
        request: mcpRequest,
        env,
        supportedProtocolVersions: deps.supportedMcpProtocolVersions,
      });
      if (authResult.authError) {
        const text = await authResult.authError.text();
        throw new Error(deps.redactSecretsInText(text || 'MCP auth failed'));
      }

      const response = await deps.runWithPrincipalContext(authResult.principal, () =>
        deps.mcpStreamableFetch(mcpRequest, env, ctx),
      );
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(deps.redactSecretsInText(raw.slice(0, 1000) || 'MCP request failed'));
      }

      const payload = extractMcpResponseBody(raw);
      const rpcBody = payload as McpJsonRpcResponse<unknown>;
      if (rpcBody.error?.message) {
        throw new Error(deps.redactSecretsInText(`MCP error ${rpcBody.error.code}: ${rpcBody.error.message}`));
      }

      return {
        payload,
        sessionId: response.headers.get('mcp-session-id'),
      };
    },

    async recordAuthorizedMcpUsage(
      request: Request,
      env: Env,
      principal: { userId?: string } | undefined,
    ): Promise<void> {
      const pathname = new URL(request.url).pathname;
      if (pathname !== '/mcp' && pathname !== '/sse') {
        return;
      }
      if (!(request.method === 'POST' || request.method === 'GET')) {
        return;
      }
      const userId = principal?.userId || request.headers.get('x-oauth-user-id')?.trim() || '';
      if (!userId) {
        return;
      }
      await deps.incrementUserUsage(env, userId, { route: pathname, method: request.method });
    },
  };
}
