/// <reference types="@cloudflare/workers-types" />

/**
 * CourtListener MCP Server — Cloudflare Workers Entrypoint
 *
 * Deploys the full MCP server on Cloudflare's edge network using the
 * `agents` SDK with Durable Objects for per-session state management.
 *
 * End users connect by adding a single URL to their MCP client:
 *   { "url": "https://courtlistener-mcp.<subdomain>.workers.dev/sse" }
 *
 * Secrets (set via `wrangler secret put`):
 *   COURTLISTENER_API_KEY  — CourtListener API token (required)
 *   MCP_AUTH_TOKEN          — Optional bearer token to restrict access
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { SERVER_CAPABILITIES } from './infrastructure/protocol-constants.js';
import type { Logger } from './infrastructure/logger.js';
import type { MetricsCollector } from './infrastructure/metrics.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { ResourceHandlerRegistry } from './server/resource-handler.js';
import { PromptHandlerRegistry } from './server/prompt-handler.js';
import { SubscriptionManager } from './server/subscription-manager.js';
import { buildToolDefinitions, buildEnhancedMetadata } from './server/tool-builder.js';
import { setupHandlers } from './server/handler-registry.js';

// ---------------------------------------------------------------------------
// Cloudflare Worker environment bindings
// ---------------------------------------------------------------------------

interface Env {
  /** CourtListener API token — set via `wrangler secret put COURTLISTENER_API_KEY` */
  COURTLISTENER_API_KEY?: string;
  /** Optional bearer token to gate access — set via `wrangler secret put MCP_AUTH_TOKEN` */
  MCP_AUTH_TOKEN?: string;
  /** Durable Object binding (auto-wired by wrangler.jsonc) */
  MCP_OBJECT: DurableObjectNamespace;
}

// ---------------------------------------------------------------------------
// MCP Agent — one Durable Object instance per client session
// ---------------------------------------------------------------------------

// SDK version bridge: agents@0.5 bundles SDK 1.26, our project uses 1.27.
// The APIs are compatible at runtime; casts bridge the type-level gap.

export class CourtListenerMCP extends (McpAgent as typeof McpAgent<Env>) {
  server = new McpServer(
    { name: 'courtlistener-mcp', version: '0.1.0' },
    { capabilities: SERVER_CAPABILITIES },
  ) as unknown as InstanceType<typeof McpAgent>['server'];

  async init(): Promise<void> {
    // Propagate Cloudflare secrets into process.env so our existing
    // config system (getConfig()) picks them up unchanged.
    const env = (this as unknown as { env: Env }).env;
    if (env.COURTLISTENER_API_KEY) {
      process.env.COURTLISTENER_API_KEY = env.COURTLISTENER_API_KEY;
    }

    // Bootstrap the full DI container (config, logger, cache, API client,
    // tool / resource / prompt registries, circuit breakers, etc.)
    bootstrapServices();

    const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    const resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    const promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    const logger = container.get<Logger>('logger');
    const metrics = container.get<MetricsCollector>('metrics');
    const enhancedMetadata = buildEnhancedMetadata();

    // Wire all existing MCP protocol handlers onto the low-level Server
    // that lives inside McpServer.  Because we never call
    // this.server.tool() / .resource() / .prompt(), the high-level
    // McpServer won't register conflicting handlers.
    const lowLevelServer = (this.server as unknown as McpServer).server;

    setupHandlers({
      server: lowLevelServer,
      logger,
      metrics,
      toolRegistry,
      resourceRegistry,
      promptRegistry,
      subscriptionManager: new SubscriptionManager(),
      isShuttingDown: () => false,
      activeRequests: new Set<string>(),
      buildToolDefinitions: () => buildToolDefinitions(toolRegistry, enhancedMetadata),
      executeToolWithMiddleware: async (
        req: CallToolRequest,
        requestId: string,
      ): Promise<CallToolResult> => {
        return await toolRegistry.execute(req, { logger, requestId });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Workers fetch handler — thin wrapper around McpAgent.serve()
// ---------------------------------------------------------------------------

const mcpHandler = CourtListenerMCP.serve('/sse');

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
          'Access-Control-Expose-Headers': 'mcp-session-id',
        },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'courtlistener-mcp',
        transport: 'cloudflare-agents',
      });
    }

    // Helpful root response for browser/manual checks
    if (url.pathname === '/') {
      return Response.json({
        service: 'courtlistener-mcp',
        status: 'ok',
        message: 'MCP endpoint is available at /sse',
        endpoints: {
          health: '/health',
          mcp: '/sse',
        },
      });
    }

    // Optional bearer-token gate
    if (env.MCP_AUTH_TOKEN) {
      const auth = request.headers.get('Authorization');
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token !== env.MCP_AUTH_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // Friendly guidance when /sse is called without MCP-required Accept header
    if (url.pathname === '/sse') {
      const accept = request.headers.get('Accept') ?? '';
      if (!accept.includes('text/event-stream')) {
        return Response.json(
          {
            error: 'Not Acceptable',
            message: 'Client must include Accept: application/json, text/event-stream',
            example:
              'curl -i https://mcp.blakeoxford.com/sse -H \'Accept: application/json, text/event-stream\' -H \'Content-Type: application/json\' -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}\'',
          },
          { status: 406 },
        );
      }
    }

    // Route everything else to the MCP Durable Object
    return mcpHandler.fetch(request, env, ctx);
  },
};
