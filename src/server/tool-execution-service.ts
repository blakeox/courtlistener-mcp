import type {
  CallToolRequest,
  CallToolResult,
  CreateTaskResult,
} from '@modelcontextprotocol/server';
import { isTaskAugmentedRequestParams } from '@modelcontextprotocol/server';

import { Logger } from '../infrastructure/logger.js';
import { getPrincipalContext } from '../infrastructure/principal-context.js';
import {
  createAsyncEnvelope,
  isAsyncControlToolName,
  parseAsyncExecutionDirective,
  DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES,
} from './async-tool-workflow.js';
import type { AsyncExecutionDirective } from './async-tool-workflow.js';
import { AsyncWorkflowTaskStore, readAsyncEnvelopeJob } from './async-workflow-task-store.js';
import type { McpProgressReporter } from './mcp-progress-reporter.js';
import { reportMcpProgressPhases } from './mcp-progress-reporter.js';
import { ToolHandlerRegistry, type ToolContext } from './tool-handler.js';

export interface ToolExecutionOptions {
  progress?: McpProgressReporter;
  nativeTasksEnabled?: boolean;
  taskStore?: AsyncWorkflowTaskStore;
}

export interface ToolExecutionService {
  execute(
    request: CallToolRequest,
    requestId: string,
    options?: ToolExecutionOptions,
  ): Promise<CallToolResult | CreateTaskResult>;
}

interface AsyncWorkflowController {
  isEnabled(): boolean;
  handleControlToolCall(request: CallToolRequest): Promise<CallToolResult>;
  enqueueToolCall(params: {
    request: CallToolRequest;
    requestId: string;
    userId?: string;
    directive: AsyncExecutionDirective;
    progress?: McpProgressReporter;
    execute?: (request: CallToolRequest, requestId: string) => Promise<CallToolResult>;
  }): Promise<CallToolResult> | CallToolResult;
}

interface DirectToolExecutionServiceParams {
  toolRegistry: ToolHandlerRegistry;
  logger: Logger;
  asyncWorkflow: AsyncWorkflowController;
  getToolContextExtras?: () => Partial<ToolContext>;
}

function resolveExecutableToolName(name: string, toolRegistry: ToolHandlerRegistry): string {
  if (!name.includes(':')) {
    return name;
  }

  if (toolRegistry.get(name) || isAsyncControlToolName(name)) {
    return name;
  }

  const normalizedName = name.split(':').pop()?.trim();
  if (!normalizedName) {
    return name;
  }

  if (toolRegistry.get(normalizedName) || isAsyncControlToolName(normalizedName)) {
    return normalizedName;
  }

  return name;
}

function normalizeExecutableRequest(
  request: CallToolRequest,
  toolRegistry: ToolHandlerRegistry,
): CallToolRequest {
  const normalizedName = resolveExecutableToolName(request.params.name, toolRegistry);
  if (normalizedName === request.params.name) {
    return request;
  }

  return {
    ...request,
    params: {
      ...request.params,
      name: normalizedName,
    },
  };
}

async function runDirectTool(
  toolRegistry: ToolHandlerRegistry,
  logger: Logger,
  request: CallToolRequest,
  requestId: string,
  toolContextExtras: () => Partial<ToolContext>,
  progress?: McpProgressReporter,
): Promise<CallToolResult> {
  const principal = getPrincipalContext();
  await reportMcpProgressPhases(progress, [
    { progress: 0, total: 1, message: 'Starting tool execution' },
  ]);

  const result = await toolRegistry.execute(request, {
    logger,
    requestId,
    ...toolContextExtras(),
    ...(progress?.enabled ? { progress } : {}),
    ...(principal?.userId ? { userId: principal.userId } : {}),
  });

  await reportMcpProgressPhases(progress, [
    { progress: 1, total: 1, message: 'Tool execution complete' },
  ]);
  return result;
}

async function executeDirectGovernedTool(
  request: CallToolRequest,
  requestId: string,
  options: ToolExecutionOptions | undefined,
  deps: {
    toolRegistry: ToolHandlerRegistry;
    logger: Logger;
    asyncWorkflow: AsyncWorkflowController;
    toolContextExtras: () => Partial<ToolContext>;
  },
): Promise<CallToolResult | CreateTaskResult> {
  const normalizedRequest = normalizeExecutableRequest(request, deps.toolRegistry);

  if (isAsyncControlToolName(normalizedRequest.params.name)) {
    return deps.asyncWorkflow.handleControlToolCall(normalizedRequest);
  }

  const parsedRequest = parseAsyncExecutionDirective(normalizedRequest);
  const principal = getPrincipalContext();
  const nativeTaskRequest =
    options?.nativeTasksEnabled &&
    options.taskStore &&
    isTaskAugmentedRequestParams(parsedRequest.request.params);
  const shouldQueueByDefault =
    deps.asyncWorkflow.isEnabled() &&
    !parsedRequest.directive?.mode &&
    !nativeTaskRequest &&
    DEFAULT_QUEUE_OFFLOAD_TOOL_NAMES.has(parsedRequest.request.params.name);

  if (nativeTaskRequest || parsedRequest.directive?.mode === 'async' || shouldQueueByDefault) {
    if (!deps.asyncWorkflow.isEnabled()) {
      return createAsyncEnvelope(
        {
          success: false,
          error: 'Async tool execution is disabled',
        },
        true,
      );
    }

    const envelope = await deps.asyncWorkflow.enqueueToolCall({
      request: parsedRequest.request,
      requestId,
      directive: parsedRequest.directive ?? { mode: 'async' },
      ...(options?.progress?.enabled ? { progress: options.progress } : {}),
      execute: async (queuedRequest, queuedRequestId) =>
        await runDirectTool(
          deps.toolRegistry,
          deps.logger,
          queuedRequest,
          queuedRequestId,
          deps.toolContextExtras,
          options?.progress,
        ),
      ...(principal?.userId ? { userId: principal.userId } : {}),
    });

    if (nativeTaskRequest) {
      const pollInterval = isTaskAugmentedRequestParams(parsedRequest.request.params)
        ? (parsedRequest.request.params.task as { pollInterval?: number } | undefined)?.pollInterval
        : undefined;
      const job = readAsyncEnvelopeJob(envelope as CallToolResult);
      return job
        ? (options?.taskStore?.buildCreateTaskResult(job, pollInterval) ?? envelope)
        : envelope;
    }

    return envelope;
  }

  return runDirectTool(
    deps.toolRegistry,
    deps.logger,
    parsedRequest.request,
    requestId,
    deps.toolContextExtras,
    options?.progress,
  );
}

export function createDirectToolExecutionService(
  params: DirectToolExecutionServiceParams,
): ToolExecutionService {
  const { toolRegistry, logger, asyncWorkflow, getToolContextExtras } = params;
  const toolContextExtras = () => getToolContextExtras?.() ?? {};

  return {
    execute: async (request, requestId, options) =>
      executeDirectGovernedTool(request, requestId, options, {
        toolRegistry,
        logger,
        asyncWorkflow,
        toolContextExtras,
      }),
  };
}
