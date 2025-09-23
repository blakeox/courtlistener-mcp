/**
 * Refactored Legal MCP Server
 * Clean, modular implementation following best practices
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { container } from '../infrastructure/container.js';
import { ToolHandlerRegistry } from '../server/tool-handler.js';
import { generateId } from '../common/utils.js';
import { Logger } from '../infrastructure/logger.js';

export class RefactoredLegalMCPServer {
  private server: Server;
  private toolRegistry: ToolHandlerRegistry;
  private logger: Logger;

  constructor() {
    this.server = new Server(
      {
        name: "legal-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.logger = container.get<Logger>('logger');
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.info('Listing available tools');
      
      return {
        tools: this.toolRegistry.getToolDefinitions()
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestId = generateId();
      
      try {
        return await this.toolRegistry.execute(request, {
          logger: this.logger,
          requestId
        });
      } catch (error) {
        this.logger.error('Tool execution failed', error as Error, {
          toolName: request.params.name,
          requestId
        });
        
        throw error;
      }
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('Legal MCP Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start server', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('Legal MCP Server stopped');
    } catch (error) {
      this.logger.error('Error stopping server', error as Error);
      throw error;
    }
  }
}