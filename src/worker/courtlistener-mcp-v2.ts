/// <reference types="@cloudflare/workers-types" />

import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { generateId } from '../common/utils.js';
import { MCP_SERVER_INSTRUCTIONS } from '../infrastructure/mcp-server-instructions.js';
import { SERVER_INFO } from '../infrastructure/protocol-constants.js';
import { createDirectToolExecutionService } from '../server/tool-execution-service.js';
import {
  CloudflareAsyncQueueWorkflow,
  type AsyncJobMessage,
} from '../server/worker-async-queue-runtime.js';
import { createWorkerRuntime } from '../server/worker-runtime-factory.js';
import type { WorkerMcpEnv } from '../server/worker-runtime-contract.js';
import { registerMcpCatalog } from '../server/mcp-catalog.js';

function createCourtListenerMcpServer(env: WorkerMcpEnv) {
  const runtime = createWorkerRuntime(env);
  const { logger, metrics, resourceRegistry, promptRegistry, toolRegistry } = runtime;
  const asyncWorkflow = new CloudflareAsyncQueueWorkflow(env, {
    logger,
    isReadOnlyTool: (toolName) => {
      const annotations = toolRegistry.get(toolName)?.annotations;
      return annotations?.readOnlyHint === true && annotations.destructiveHint !== true;
    },
    recordLatencyMetric: (metric, durationMs) => metrics.recordLatencyMetric(metric, durationMs),
    recordCostGuardrail: (metric, value, threshold) =>
      metrics.recordCostGuardrail(`async.${metric}`, value, threshold),
  });
  const executionService = createDirectToolExecutionService({
    toolRegistry,
    logger,
    asyncWorkflow,
  });

  const server = new McpServer(
    { name: SERVER_INFO.name, version: SERVER_INFO.version },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  registerMcpCatalog({
    server,
    logger,
    toolRegistry,
    resourceRegistry,
    promptRegistry,
    executeTool: (toolName, arguments_) =>
      executionService.execute(
        {
          jsonrpc: '2.0',
          id: generateId(),
          method: 'tools/call',
          params: { name: toolName, arguments: arguments_ },
        } as never,
        generateId(),
        { nativeTasksEnabled: false } as never,
      ) as Promise<CallToolResult>,
  });

  return server;
}

export function createCourtListenerMcpV2Handler(env: WorkerMcpEnv) {
  return createMcpHandler(() => createCourtListenerMcpServer(env), {
    route: '/mcp',
    legacy: 'reject',
    responseMode: 'auto',
  });
}

export type { AsyncJobMessage };
