#!/usr/bin/env node

/**
 * HTTP MCP Client for Cloudflare Worker
 * Routes MCP protocol calls to Cloudflare Worker HTTP API
 */

import fetch from 'node-fetch';

const WORKER_BASE_URL = 'https://courtlistener-mcp.blakeopowell.workers.dev';

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

class HTTPMCPClient {
  private tools: Tool[] | null = null;

  async initialize(): Promise<void> {
    // Fetch available tools from the worker
    try {
      const response = await fetch(`${WORKER_BASE_URL}/tools`);
      const data = (await response.json()) as any;
      this.tools = data.tools || [];
    } catch (error) {
      console.error('Failed to initialize HTTP MCP Client:', error);
      this.tools = [];
    }
  }

  async handleMessage(message: string): Promise<any> {
    try {
      const request = JSON.parse(message) as MCPRequest;

      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);

        case 'tools/list':
          return this.handleListTools(request);

        case 'tools/call':
          return this.handleToolCall(request);

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
    }
  }

  async handleInitialize(request: MCPRequest): Promise<any> {
    await this.initialize();

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'HTTP MCP Client for Cloudflare Worker',
          version: '1.0.0',
        },
      },
    };
  }

  async handleListTools(request: MCPRequest): Promise<any> {
    if (!this.tools) {
      await this.initialize();
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.tools,
      },
    };
  }

  async handleToolCall(request: MCPRequest): Promise<any> {
    const { name, arguments: args } = request.params || {};

    try {
      // Call the Cloudflare Worker tool endpoint
      const response = await fetch(`${WORKER_BASE_URL}/tools/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args || {}),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as any;
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: errorData.error || `HTTP ${response.status}`,
          },
        };
      }

      const result = await response.json();

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${errorMessage}`,
        },
      };
    }
  }
}

// Main execution
async function main() {
  const client = new HTTPMCPClient();

  process.stdin.setEncoding('utf8');

  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk;

    // Process complete JSON messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = await client.handleMessage(line.trim());
          console.log(JSON.stringify(response));
        } catch (error) {
          console.error('Error processing message:', error);
        }
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });

  // Handle process termination
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Failed to start HTTP MCP Client:', error);
    process.exit(1);
  });
}
