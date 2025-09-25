#!/usr/bin/env node

/**
 * Legal MCP Server - Cloudflare Workers HTTP API Wrapper (Enhanced Version)
 *
 * This file provides both MCP stdio functionality and HTTP API compatibility
 * for Cloudflare Workers deployment with Streamable HTTP support for remote MCP clients.
 * Now includes enhanced REST API endpoints for comprehensive legal research.
 */

import { LegalMCPServer } from './index.js';

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
    // Optional auth: if an auth token is configured, require either
    // - Authorization: Bearer <token>
    // - or a query param ?access_token=<token>
    // Note: The actual secret is injected via Cloudflare Worker env (see fetch handler)

    // @ts-ignore - env will be provided by the fetch() wrapper
    const expectedToken: string | undefined = (globalThis as any).__SSE_AUTH_TOKEN__;
    if (expectedToken) {
      const auth = request.headers.get('authorization');
      const url = new URL(request.url);
      const qpToken = url.searchParams.get('access_token');
      const bearer = auth?.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : undefined;

      const provided = bearer || qpToken || '';
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

    const sessionId = request.headers.get('mcp-session-id') || Math.random().toString(36).substring(7);

    // Create SSE stream using ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection confirmation
        controller.enqueue(
          encoder.encode('data: {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n\n')
        );

        // Keep connection alive with periodic pings
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch (error) {
            clearInterval(keepAlive);
          }
        }, 30000);

        // Clean up after 5 minutes to prevent memory leaks
        setTimeout(() => {
          clearInterval(keepAlive);
          try {
            controller.close();
          } catch (error) {
            // Ignore errors when closing
          }
        }, 300000);
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
      const message = await request.json();
      const server: any = new LegalMCPServer();

      let response: any;

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

        case 'tools/list':
          const tools = await server.listTools();
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: tools,
          };
          break;

        case 'tools/call':
          const result = await server.handleToolCall({
            name: message.params.name,
            arguments: message.params.arguments,
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
        }
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
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
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
        // Bridge the secret from env to the handler scope.
        // We can't pass env into handleMCPRequest directly without changing its signature,
        // so we stash it on globalThis for this request.
        (globalThis as any).__SSE_AUTH_TOKEN__ = env?.SSE_AUTH_TOKEN;
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
          }
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
          }
        );
      }

      // List tools endpoint
      if (url.pathname === '/tools' && request.method === 'GET') {
        const server: any = new LegalMCPServer();
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
          }
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
            }
          );
        }

        let arguments_: any = {};

        // Parse request body for arguments
        if (request.headers.get('content-type')?.includes('application/json')) {
          try {
            arguments_ = await request.json();
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
              }
            );
          }
        }

        // Execute the tool
        try {
          const server: any = new LegalMCPServer();
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
            }
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
        }
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
        }
      );
    }
  },
};

// Keep the original MCP stdio functionality for local usage
async function main() {
  const server: any = new LegalMCPServer();
  await server.start();
}

// Only run stdio server if called directly (not in Workers environment)
if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Failed to start Legal MCP Server:', error);
    process.exit(1);
  });
}
