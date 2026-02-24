import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import './mcp-server.js';

declare module './mcp-server.js' {
  interface BestPracticeLegalMCPServer {
    run(): Promise<void>;
    listTools(): Promise<{
      tools: Tool[];
      metadata: {
        categories: string[];
      };
    }>;
    handleToolCall(
      input:
        | CallToolRequest
        | {
            name: string;
            arguments?: Record<string, unknown>;
          },
    ): Promise<CallToolResult>;
  }
}
