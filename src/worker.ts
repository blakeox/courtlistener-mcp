#!/usr/bin/env node

/**
 * Legal MCP Server - Cloudflare Workers HTTP API Wrapper (Enhanced Version)
 *
 * This file provides both MCP stdio functionality and HTTP API compatibility
 * for Cloudflare Workers deployment with Streamable HTTP support for remote MCP clients.
 * Now includes enhanced REST API endpoints for comprehensive legal research.
 */

import { LegalMCPServer } from './index.js';
import { verifyAccessToken } from './security/oidc.js';

// Typed access to augmented global properties used by the Worker
type OidcCfg = {
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  requiredScope?: string;
};
type LimitsCfg = { maxTotal?: number; maxPerIp?: number };
type Counters = { total: number; perIp: Map<string, number> };
function g() {
  return globalThis as unknown as {
    __SSE_AUTH_TOKEN__?: string;
    __OIDC?: OidcCfg;
    __LIMITS?: LimitsCfg;
    __SSE_COUNTERS__?: Counters;
  };
}

// Export the server class for direct usage
export { LegalMCPServer };

/**
 * Enhanced MCP Protocol implementation for Cloudflare Workers
 * Uses enhanced REST API coverage while maintaining compatibility
 */
async function handleMCPRequest(request: Request): Promise<Response> {
  // Handle CORS preflight for MCP
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
        'Access-Control-Expose-Headers': 'mcp-session-id',
      },
    });
  }

  // For SSE connections, return a basic SSE stream
  if (request.method === 'GET') {
    // Connection limiting configuration
    const limits = g().__LIMITS || {};
    const maxTotal = Number.isFinite(limits.maxTotal) ? Number(limits.maxTotal) : 100; // default
    const maxPerIp = Number.isFinite(limits.maxPerIp) ? Number(limits.maxPerIp) : 5; // default

    // Optional auth:
    // 1) OAuth 2.0/OIDC: if issuer configured, validate Bearer token (preferred)
    // 2) Static token: if SSE_AUTH_TOKEN configured, accept Bearer or ?access_token=

    const oidcCfg = g().__OIDC;
    const expectedToken: string | undefined = g().__SSE_AUTH_TOKEN__;

    const urlObj = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    const lowerAuth = authHeader?.toLowerCase() ?? '';
    const headerToken = lowerAuth.startsWith('bearer ') ? authHeader!.slice(7).trim() : undefined;
    const queryToken = urlObj.searchParams.get('access_token') ?? undefined;

    if (oidcCfg?.issuer) {
      const presented = headerToken || queryToken; // header preferred; query allowed for clients that lack header support
      if (!presented) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'WWW-Authenticate':
              'Bearer realm="mcp", error="invalid_request", error_description="missing_token"',
          },
        });
      }
      try {
        const issuer = oidcCfg.issuer;
        await verifyAccessToken(presented, {
          issuer,
          audience: oidcCfg.audience,
          jwksUrl: oidcCfg.jwksUrl,
          requiredScope: oidcCfg.requiredScope,
        });
      } catch (e) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token"',
          },
        });
      }
    } else if (expectedToken) {
      const provided = headerToken || queryToken || '';
      if (!provided || provided !== expectedToken) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'WWW-Authenticate': 'Bearer realm="mcp", error="invalid_token"',
          },
        });
      }
    }

    const sessionId =
      request.headers.get('mcp-session-id') || Math.random().toString(36).substring(7);

    // Simple in-memory connection counters (per-worker instance)
    const counters = (g().__SSE_COUNTERS__ ||= { total: 0, perIp: new Map<string, number>() });

    const ipHeader =
      request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
    const clientIp = ipHeader.split(',')[0].trim() || 'unknown';

    const currentPerIp = counters.perIp.get(clientIp) || 0;
    if (counters.total >= maxTotal || currentPerIp >= maxPerIp) {
      return new Response('Too Many Connections', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Retry-After': '30',
        },
      });
    }

    // Create SSE stream using ReadableStream
    let cleanup: (() => void) | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Increment counters on start
        counters.total += 1;
        counters.perIp.set(clientIp, currentPerIp + 1);
        let ended = false;
        const keepAliveRef: { id?: ReturnType<typeof setInterval> } = {};
        const closeTimeoutRef: { id?: ReturnType<typeof setTimeout> } = {};

        const release = () => {
          if (ended) return;
          ended = true;
          // Clear timers if set
          if (keepAliveRef.id) clearInterval(keepAliveRef.id);
          if (closeTimeoutRef.id) clearTimeout(closeTimeoutRef.id);

          counters.total = Math.max(0, counters.total - 1);
          const nowPerIp = (counters.perIp.get(clientIp) || 1) - 1;
          if (nowPerIp > 0) counters.perIp.set(clientIp, nowPerIp);
          else counters.perIp.delete(clientIp);
        };
        cleanup = release;

        // Send initial connection confirmation
        controller.enqueue(
          encoder.encode(
            'data: {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n\n',
          ),
        );

        // Keep connection alive with periodic pings
        keepAliveRef.id = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch (error) {
            if (keepAliveRef.id) clearInterval(keepAliveRef.id);
            release();
          }
        }, 30000);

        // Clean up after 5 minutes to prevent memory leaks
        closeTimeoutRef.id = setTimeout(() => {
          if (keepAliveRef.id) clearInterval(keepAliveRef.id);
          try {
            controller.close();
          } catch (error) {
            // Ignore errors when closing
          } finally {
            release();
          }
        }, 300000);
      },
      cancel() {
        // On client disconnect, run cleanup to clear timers and decrement counters
        try {
          if (cleanup) cleanup();
        } catch {
          // ignore
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'mcp-session-id',
        'mcp-session-id': sessionId,
      },
    });
  }

  // Handle POST requests with MCP messages
  if (request.method === 'POST') {
    try {
      // Parse JSON-RPC request safely
      const raw = await request.text();
      type JsonRpcRequest = {
        jsonrpc?: string;
        id?: string | number | null;
        method: string;
        params?: unknown;
      };
      let message: JsonRpcRequest | null = null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          'method' in (parsed as Record<string, unknown>)
        ) {
          const p = parsed as { id?: string | number | null; method?: unknown; params?: unknown };
          if (typeof p.method === 'string') {
            message = { id: p.id ?? null, method: p.method, params: p.params };
          }
        }
      } catch {
        // fallthrough to parse error response below
      }
      if (!message) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      const server = new LegalMCPServer();

      let response: unknown;

      switch (message.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
              },
              serverInfo: {
                name: 'Legal MCP Server',
                version: '1.0.0',
              },
            },
          };
          break;

        case 'tools/list': {
          const tools = await server.listTools();
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: tools,
          };
          break;
        }

        case 'tools/call': {
          const params = (message.params ?? {}) as Record<string, unknown>;
          const toolNameVal = params.name;
          const toolArgsVal = params.arguments;

          let toolArgs: Record<string, unknown> | undefined;
          if (toolArgsVal && typeof toolArgsVal === 'object' && !Array.isArray(toolArgsVal)) {
            toolArgs = toolArgsVal as Record<string, unknown>;
          }

          const result = await server.handleToolCall({
            name: typeof toolNameVal === 'string' ? toolNameVal : '',
            arguments: toolArgs,
          });
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          };
          break;
        }

        case 'notifications/initialized':
          // Client initialization notification - no response needed
          return new Response(null, { status: 204 });

        default:
          response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`,
            },
          };
          break;
      }

      return new Response(JSON.stringify(response), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'mcp-session-id',
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

/**
 * Cloudflare Workers fetch handler
 * Converts HTTP requests to MCP tool calls
 */
export default {
  async fetch(request: Request, env: Record<string, unknown>, _ctx: unknown): Promise<Response> {
    try {
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
            'Access-Control-Expose-Headers': 'mcp-session-id',
          },
        });
      }

      const url = new URL(request.url);

      // Handle MCP requests to root endpoint
      if (url.pathname === '/' && request.method === 'POST') {
        return handleMCPRequest(request);
      }

      // SSE endpoint for MCP clients
      if (url.pathname === '/sse') {
        // Bridge auth and limits config from env to the handler scope.
        const gg = g();
        const envStr = (k: string): string | undefined => {
          const v = env[k];
          return typeof v === 'string' ? v : undefined;
        };
        const envNum = (k: string): number | undefined => {
          const v = env[k];
          if (typeof v === 'number' && Number.isFinite(v)) return v;
          if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))
            return Number(v);
          return undefined;
        };
        gg.__SSE_AUTH_TOKEN__ = envStr('SSE_AUTH_TOKEN');
        gg.__OIDC = {
          issuer: envStr('OIDC_ISSUER'),
          audience: envStr('OIDC_AUDIENCE'),
          jwksUrl: envStr('OIDC_JWKS_URL'),
          requiredScope: envStr('OIDC_REQUIRED_SCOPE'),
        };
        gg.__LIMITS = {
          maxTotal: envNum('MAX_SSE_CONNECTIONS'),
          maxPerIp: envNum('MAX_SSE_CONNECTIONS_PER_IP'),
        };
        return handleMCPRequest(request);
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'legal-mcp',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      // API documentation endpoint
      if ((url.pathname === '/' && request.method === 'GET') || url.pathname === '/docs') {
        return new Response(
          JSON.stringify({
            service: 'Legal MCP Server',
            version: '1.0.0',
            description: 'API for legal research using CourtListener database',
            endpoints: {
              '/health': 'Health check',
              '/sse': 'MCP over SSE endpoint for remote clients',
              '/tools': 'List available tools',
              '/tools/{toolName}': 'Execute a specific tool',
            },
            repository: 'https://github.com/blakeox/courtlistener-mcp',
            documentation: 'https://modelcontextprotocol.io/',
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      // List tools endpoint
      if (url.pathname === '/tools' && request.method === 'GET') {
        const server = new LegalMCPServer();
        const tools = await server.listTools();

        return new Response(
          JSON.stringify({
            tools: tools.tools,
            count: tools.tools?.length || 0,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }

      // Execute tool endpoint
      if (url.pathname.startsWith('/tools/') && request.method === 'POST') {
        const toolName = url.pathname.replace('/tools/', '');

        if (!toolName) {
          return new Response(
            JSON.stringify({
              error: 'Tool name is required',
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            },
          );
        }

        let arguments_: Record<string, unknown> | undefined;

        // Parse request body for arguments
        if (request.headers.get('content-type')?.includes('application/json')) {
          try {
            const body = (await request.json()) as unknown;
            if (body && typeof body === 'object' && !Array.isArray(body)) {
              arguments_ = body as Record<string, unknown>;
            } else {
              arguments_ = undefined;
            }
          } catch (error) {
            return new Response(
              JSON.stringify({
                error: 'Invalid JSON in request body',
              }),
              {
                status: 400,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              },
            );
          }
        }

        // Execute the tool
        try {
          const server = new LegalMCPServer();
          const result = await server.handleToolCall({
            name: toolName,
            arguments: arguments_,
          });

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          console.error('Tool execution error:', error);
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Tool execution failed',
              toolName: toolName,
            }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            },
          );
        }
      }

      // 404 for unknown endpoints
      return new Response(
        JSON.stringify({
          error: 'Endpoint not found',
          available_endpoints: ['/health', '/sse', '/tools', '/tools/{toolName}'],
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    } catch (error) {
      console.error('Request handling error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }
  },
};

// Keep the original MCP stdio functionality for local usage
async function main() {
  const server = new LegalMCPServer();
  await server.start();
}

// Only run stdio server if called directly (not in Workers environment)
if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start Legal MCP Server:', error);
    process.exit(1);
  });
}
