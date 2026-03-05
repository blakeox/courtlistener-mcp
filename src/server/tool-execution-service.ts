import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { retry } from '../common/utils.js';
import { CacheManager } from '../infrastructure/cache.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { MiddlewareFactory, RequestContext } from '../infrastructure/middleware-factory.js';
import { getPrincipalContext } from '../infrastructure/principal-context.js';
import { ServerConfig } from '../types.js';
import {
  AsyncToolWorkflowOrchestrator,
  createAsyncEnvelope,
  isAsyncControlToolName,
  parseAsyncExecutionDirective,
} from './async-tool-workflow.js';
import { SamplingService } from './sampling-service.js';
import { ToolHandlerRegistry } from './tool-handler.js';

export interface ToolExecutionService {
  execute(request: CallToolRequest, requestId: string): Promise<CallToolResult>;
}

interface DirectToolExecutionServiceParams {
  toolRegistry: ToolHandlerRegistry;
  logger: Logger;
  asyncWorkflow?: AsyncToolWorkflowOrchestrator;
}

interface MiddlewareToolExecutionServiceParams extends DirectToolExecutionServiceParams {
  metrics: MetricsCollector;
  middlewareFactory: MiddlewareFactory;
  config: ServerConfig;
  cache: CacheManager;
  sampling: SamplingService;
}

export function createDirectToolExecutionService(
  params: DirectToolExecutionServiceParams,
): ToolExecutionService {
  const { toolRegistry, logger } = params;
  const asyncWorkflow = params.asyncWorkflow ?? new AsyncToolWorkflowOrchestrator(logger);

  return {
    execute: async (request, requestId) => {
      if (isAsyncControlToolName(request.params.name)) {
        return asyncWorkflow.handleControlToolCall(request);
      }

      const parsedRequest = parseAsyncExecutionDirective(request);
      const principal = getPrincipalContext();

      if (parsedRequest.directive?.mode === 'async') {
        if (!asyncWorkflow.isEnabled()) {
          return createAsyncEnvelope(
            {
              success: false,
              error: 'Async tool execution is disabled',
            },
            true,
          );
        }

        return asyncWorkflow.enqueueToolCall({
          request: parsedRequest.request,
          requestId,
          directive: parsedRequest.directive,
          execute: async (queuedRequest, queuedRequestId) =>
            await toolRegistry.execute(queuedRequest, {
              logger,
              requestId: queuedRequestId,
              ...(principal?.userId ? { userId: principal.userId } : {}),
            }),
          ...(principal?.userId ? { userId: principal.userId } : {}),
        });
      }

      return await toolRegistry.execute(parsedRequest.request, {
        logger,
        requestId,
        ...(principal?.userId ? { userId: principal.userId } : {}),
      });
    },
  };
}

export function createMiddlewareToolExecutionService(
  params: MiddlewareToolExecutionServiceParams,
): ToolExecutionService {
  const { toolRegistry, logger, metrics, middlewareFactory, config, cache, sampling } = params;
  const asyncWorkflow =
    params.asyncWorkflow ??
    new AsyncToolWorkflowOrchestrator(logger, {
      ...config.asyncExecution,
      recordLatencyMetric: (metric, durationMs) => {
        metrics.recordLatencyMetric(metric, durationMs);
      },
      recordCostGuardrail: (metric, value, threshold) => {
        metrics.recordCostGuardrail(`async.${metric}`, value, threshold);
      },
    });

  const executeWithMiddleware = async (
    request: CallToolRequest,
    requestId: string,
    disableInlineRetry: boolean,
  ): Promise<CallToolResult> => {
    const startTime = Date.now();
    const context: RequestContext = {
      requestId,
      startTime,
      metadata: {
        toolName: request.params.name,
        arguments: request.params.arguments,
      },
    };
    const middlewares = middlewareFactory.createMiddlewareStack(config);

    const executeTool = async () => {
      const principal = getPrincipalContext();
      return await toolRegistry.execute(request, {
        logger: logger.child(`Tool:${request.params.name}`),
        requestId,
        cache,
        metrics,
        config,
        sampling,
        ...(principal?.userId ? { userId: principal.userId } : {}),
      });
    };

    try {
      const result = (await middlewareFactory.executeMiddlewareStack(
        middlewares,
        context,
        () =>
          disableInlineRetry
            ? executeTool()
            : retry(executeTool, {
                maxAttempts: 3,
                baseDelay: 750,
                maxDelay: 5_000,
              }),
      )) as CallToolResult;

      const duration = Date.now() - startTime;
      if (result.isError) {
        throw new Error(extractToolErrorMessage(result, request.params.name));
      }

      metrics.recordRequest(duration, false, `mcp.tool.${request.params.name}`);
      logger.toolExecution(request.params.name, duration, true, { requestId });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordFailure(duration, `mcp.tool.${request.params.name}`);
      logger.toolExecution(request.params.name, duration, false, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    execute: async (request, requestId) => {
      if (isAsyncControlToolName(request.params.name)) {
        return asyncWorkflow.handleControlToolCall(request);
      }

      const parsedRequest = parseAsyncExecutionDirective(request);
      const principal = getPrincipalContext();
      if (parsedRequest.directive?.mode === 'async') {
        if (!asyncWorkflow.isEnabled()) {
          return createAsyncEnvelope(
            {
              success: false,
              error: 'Async tool execution is disabled',
            },
            true,
          );
        }

        return asyncWorkflow.enqueueToolCall({
          request: parsedRequest.request,
          requestId,
          directive: parsedRequest.directive,
          execute: async (queuedRequest, queuedRequestId) =>
            await executeWithMiddleware(queuedRequest, queuedRequestId, true),
          ...(principal?.userId ? { userId: principal.userId } : {}),
        });
      }

      return executeWithMiddleware(parsedRequest.request, requestId, false);
    },
  };
}

function extractToolErrorMessage(result: CallToolResult, toolName: string): string {
  const message = `Tool ${toolName} failed`;
  if (!result.content || !Array.isArray(result.content) || result.content.length === 0) {
    return message;
  }

  const firstContent = result.content[0];
  if (
    !firstContent ||
    firstContent.type !== 'text' ||
    !('text' in firstContent) ||
    typeof firstContent.text !== 'string'
  ) {
    return message;
  }

  try {
    const parsed = JSON.parse(firstContent.text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return String(parsed.error);
    }
    if (typeof parsed === 'string') {
      return parsed;
    }
    return firstContent.text;
  } catch {
    return firstContent.text;
  }
}
