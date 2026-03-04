type AiUiRouteEnv = {
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  CLOUDFLARE_AI_MODEL?: string;
};

interface UiApiAuthResult {
  userId: string;
  keyId?: string;
  authType: 'api_key' | 'session';
}

interface WorkerAiUiRouteContext<TEnv extends AiUiRouteEnv, TCtx> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
  ctx: TCtx;
}

interface McpJsonRpcCallResult {
  payload: unknown;
  sessionId: string | null;
}

export interface HandleWorkerAiUiRoutesDeps<TEnv extends AiUiRouteEnv, TCtx> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
  rejectDisallowedUiOrigin: (origin: string | null, allowedOrigins: string[]) => Response | null;
  authenticateUiApiRequest: (request: Request, env: TEnv) => Promise<UiApiAuthResult | Response>;
  applyAiChatLifetimeQuota: (env: TEnv, userId: string) => Promise<Response | null>;
  requireCsrfToken: (request: Request) => Response | null;
  parseJsonBody: <T>(request: Request) => Promise<T | null>;
  isPlainObject: (value: unknown) => value is Record<string, unknown>;
  aiToolFromPrompt: (prompt: string) => { tool: string; reason: string };
  callMcpJsonRpc: (
    env: TEnv,
    ctx: TCtx,
    token: string,
    method: string,
    params: Record<string, unknown>,
    id: number,
    sessionId?: string,
  ) => Promise<McpJsonRpcCallResult>;
  hasValidMcpRpcShape: (payload: unknown) => boolean;
  aiToolArguments: (toolName: string, prompt: string) => Record<string, unknown>;
  buildLowCostSummary: (message: string, toolName: string, mcpPayload: unknown) => string;
  buildMcpSystemPrompt: (toolName: string, hasHistory: boolean) => string;
  extractMcpContext: (toolName: string, mcpPayload: unknown, maxLen: number) => string;
  preferredMcpProtocolVersion: string;
  defaultCfAiModelBalanced: string;
  defaultCfAiModelCheap: string;
  cheapModeMaxTokens: number;
  balancedModeMaxTokens: number;
}

export interface HandleWorkerAiUiRoutesParams<TEnv extends AiUiRouteEnv, TCtx> {
  context: WorkerAiUiRouteContext<TEnv, TCtx>;
  deps: HandleWorkerAiUiRoutesDeps<TEnv, TCtx>;
}

export async function handleWorkerAiUiRoutes<TEnv extends AiUiRouteEnv, TCtx>(
  params: HandleWorkerAiUiRoutesParams<TEnv, TCtx>,
): Promise<Response | null> {
  const {
    context: { request, url, origin, allowedOrigins, env, ctx },
    deps,
  } = params;

  if (url.pathname === '/api/ai-chat') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;

    const authResult = await deps.authenticateUiApiRequest(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }
    const aiChatQuota = await deps.applyAiChatLifetimeQuota(env, authResult.userId);
    if (aiChatQuota) return aiChatQuota;
    if (authResult.authType === 'session') {
      const csrfError = deps.requireCsrfToken(request);
      if (csrfError) return csrfError;
    }

    const body = await deps.parseJsonBody<{
      message?: string;
      mcpToken?: string;
      mcpSessionId?: string;
      toolName?: string;
      mode?: 'cheap' | 'balanced';
      testMode?: boolean;
      history?: Array<{ role: string; content: string }>;
    }>(request);
    if (!body || !deps.isPlainObject(body)) {
      return deps.jsonError('Invalid request payload.', 400, 'invalid_request_schema');
    }

    if (typeof body.message !== 'string') {
      return deps.jsonError('message must be a string.', 400, 'invalid_request_schema');
    }
    if (typeof body.testMode !== 'undefined' && typeof body.testMode !== 'boolean') {
      return deps.jsonError('testMode must be a boolean.', 400, 'invalid_request_schema');
    }

    const message = body.message.trim();
    if (message.length > 10000) {
      return deps.jsonError('Message too long (max 10,000 characters).', 400, 'message_too_long');
    }
    const mcpToken = typeof body.mcpToken === 'string' ? body.mcpToken.trim() : '';
    const requestedTool = body.toolName || 'auto';
    const testMode = body.testMode === true;
    const mode = testMode ? 'cheap' : body.mode === 'balanced' ? 'balanced' : 'cheap';
    const autoResult =
      requestedTool === 'auto'
        ? testMode
          ? { tool: 'search_cases', reason: 'Test mode defaults to search_cases.' }
          : deps.aiToolFromPrompt(message)
        : { tool: requestedTool, reason: `User selected ${requestedTool}.` };
    const toolName = autoResult.tool;
    const toolReason = autoResult.reason;
    const priorSessionId = body?.mcpSessionId?.trim() || '';

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const conversationHistory = rawHistory
      .filter(
        (h): h is { role: string; content: string } =>
          deps.isPlainObject(h) &&
          typeof h.role === 'string' &&
          typeof h.content === 'string' &&
          (h.role === 'user' || h.role === 'assistant'),
      )
      .slice(-10)
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 2000) }));

    if (!message) {
      return deps.jsonError('message is required.', 400, 'missing_message');
    }
    let activeSessionId = priorSessionId;
    let mcpPayload: unknown = null;
    let mcpError: string | null = null;

    try {
      if (!priorSessionId) {
        const initializeResult = await deps.callMcpJsonRpc(
          env,
          ctx,
          mcpToken,
          'initialize',
          {
            protocolVersion: deps.preferredMcpProtocolVersion,
            capabilities: {},
            clientInfo: { name: 'courtlistener-ai-chat', version: '1.0.0' },
          },
          1,
        );
        activeSessionId = initializeResult?.sessionId || '';
      }

      if (!activeSessionId) {
        mcpError = 'Failed to establish MCP session. Check that your bearer token is valid.';
      } else {
        const toolResult = await deps.callMcpJsonRpc(
          env,
          ctx,
          mcpToken,
          'tools/call',
          {
            name: toolName,
            arguments: deps.aiToolArguments(toolName, message),
          },
          2,
          activeSessionId,
        );
        if (!deps.hasValidMcpRpcShape(toolResult.payload)) {
          mcpError = 'MCP returned an unexpected response format.';
        } else {
          mcpPayload = toolResult.payload;
          activeSessionId = toolResult.sessionId || activeSessionId;
        }
      }
    } catch (error) {
      console.error('[ui-api] MCP call failed, will return degraded response', { error });
      mcpError =
        error instanceof Error
          ? error.message
          : 'MCP tool call failed. The CourtListener server may be temporarily unavailable.';
    }

    let completionText: string;
    let fallbackUsed = true;

    if (mcpError) {
      completionText = `**MCP Tool Error**

The MCP tool \`${toolName}\` could not complete the request:

> ${mcpError}

**Suggested Fix**: Verify your API key is valid and try again. If the issue persists, the CourtListener API may be temporarily unavailable.`;
    } else {
      completionText = deps.buildLowCostSummary(message, toolName, mcpPayload);
    }

    if (!mcpError && env.AI && typeof env.AI.run === 'function') {
      const model =
        env.CLOUDFLARE_AI_MODEL?.trim() ||
        (mode === 'balanced' ? deps.defaultCfAiModelBalanced : deps.defaultCfAiModelCheap);
      const systemPrompt = testMode
        ? 'You are a legal research assistant. Deterministic test mode: keep response under 100 words and use sections: Summary, What MCP Returned, Next Follow-up Query.'
        : deps.buildMcpSystemPrompt(toolName, conversationHistory.length > 0);
      const dataMaxLen = mode === 'cheap' ? 6000 : 16000;
      const mcpContext = `User question: ${message}

${deps.extractMcpContext(toolName, mcpPayload, dataMaxLen)}`;

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      for (const turn of conversationHistory) {
        messages.push(turn);
      }
      messages.push({ role: 'user', content: mcpContext });

      try {
        const completion = await env.AI.run(model, {
          messages,
          max_tokens: testMode
            ? 120
            : mode === 'cheap'
              ? deps.cheapModeMaxTokens
              : deps.balancedModeMaxTokens,
          temperature: testMode ? 0 : mode === 'cheap' ? 0 : 0.1,
        });

        const aiText =
          (completion as { response?: string }).response ||
          (completion as { result?: { response?: string } }).result?.response ||
          '';
        if (aiText.trim()) {
          completionText = aiText.trim();
          fallbackUsed = false;
        }
      } catch (aiError) {
        console.error('[ui-api] AI.run failed, using fallback summary', { model, error: aiError });
      }
    }

    return deps.jsonResponse({
      test_mode: testMode,
      fallback_used: fallbackUsed,
      mode,
      tool: toolName,
      tool_reason: toolReason,
      session_id: activeSessionId || '',
      ai_response: completionText,
      mcp_result: mcpPayload,
      ...(mcpError ? { mcp_error: mcpError } : {}),
    });
  }

  if (url.pathname === '/api/ai-plain') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;

    const authResult = await deps.authenticateUiApiRequest(request, env);
    if (authResult instanceof Response) return authResult;
    const aiChatQuota = await deps.applyAiChatLifetimeQuota(env, authResult.userId);
    if (aiChatQuota) return aiChatQuota;
    if (authResult.authType === 'session') {
      const csrfError = deps.requireCsrfToken(request);
      if (csrfError) return csrfError;
    }

    const body = await deps.parseJsonBody<{
      message?: string;
      mode?: 'cheap' | 'balanced';
      history?: Array<{ role: string; content: string }>;
    }>(request);
    if (!body || !deps.isPlainObject(body)) {
      return deps.jsonError('Invalid request payload.', 400, 'invalid_request_schema');
    }
    if (typeof body.message !== 'string') {
      return deps.jsonError('message must be a string.', 400, 'invalid_request_schema');
    }
    const message = body.message.trim();
    if (!message || message.length > 10000) {
      return deps.jsonError('message is required (max 10,000 chars).', 400, 'invalid_message');
    }
    const mode = body.mode === 'balanced' ? 'balanced' : 'cheap';

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const conversationHistory = rawHistory
      .filter(
        (h): h is { role: string; content: string } =>
          deps.isPlainObject(h) &&
          typeof h.role === 'string' &&
          typeof h.content === 'string' &&
          (h.role === 'user' || h.role === 'assistant'),
      )
      .slice(-10)
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 2000) }));

    if (!env.AI || typeof env.AI.run !== 'function') {
      return deps.jsonError('AI service unavailable.', 502, 'ai_unavailable');
    }
    try {
      const model =
        env.CLOUDFLARE_AI_MODEL?.trim() ||
        (mode === 'balanced' ? deps.defaultCfAiModelBalanced : deps.defaultCfAiModelCheap);
      const messages: Array<{ role: string; content: string }> = [
        {
          role: 'system',
          content: [
            'You are a legal research assistant answering ONLY from your training data.',
            'You have NO access to any external databases, APIs, or live legal data.',
            'RULES:',
            '- Be honest when you are uncertain about specific case names, dates, or holdings.',
            '- Clearly state when information may be outdated or approximate.',
            '- Do not fabricate specific case citations or holdings you are not confident about.',
            '- Suggest the user verify any specific citations with an authoritative source.',
          ].join('\n'),
        },
      ];
      for (const turn of conversationHistory) {
        messages.push(turn);
      }
      messages.push({ role: 'user', content: message });

      const completion = await env.AI.run(model, {
        messages,
        max_tokens: mode === 'cheap' ? deps.cheapModeMaxTokens : deps.balancedModeMaxTokens,
        temperature: mode === 'cheap' ? 0 : 0.1,
      });
      const aiText =
        (completion as { response?: string }).response ||
        (completion as { result?: { response?: string } }).result?.response ||
        '';
      if (!aiText.trim()) {
        return deps.jsonError('AI returned empty response.', 502, 'ai_response_invalid');
      }
      return deps.jsonResponse({ ai_response: aiText.trim(), mode });
    } catch (error) {
      console.error('[ui-api] ai-plain failed', { error });
      return deps.jsonError(
        error instanceof Error ? error.message : 'Failed to generate AI response.',
        502,
        'ai_plain_failed',
      );
    }
  }

  return null;
}
