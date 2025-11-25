#!/usr/bin/env node

/**
 * Fully Refactored Legal MCP Server
 * Complete implementation using new modular architecture
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { bootstrapServices, getServiceContainer } from './infrastructure/bootstrap.js';
import { ToolHandlerRegistry } from './server/tool-handler.js';
import { Logger } from './infrastructure/logger.js';
import { createLogger } from './infrastructure/logger.js';
import { getConfig } from './infrastructure/config.js';

/**
 * Full Architecture Legal MCP Server
 * Uses all refactored components and patterns
 */
class FullArchitectureLegalMCPServer {
  private server: Server;
  private logger: Logger;
  private toolRegistry: ToolHandlerRegistry;

  constructor() {
    this.logger = createLogger(getConfig().logging, 'FullArchitectureLegalMCP');
    
    // Bootstrap all services
    this.logger.info('Bootstrapping services...');
    bootstrapServices();
    this.logger.info('✅ Services bootstrapped successfully');

    // Get dependencies from container
    const container = getServiceContainer();
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'full-architecture-legal-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupServer();
    this.logger.info('🚀 Full Architecture Legal MCP Server initialized', {
      version: '2.0.0',
      toolCount: this.toolRegistry.getToolNames().length,
      categories: this.toolRegistry.getCategories(),
      features: [
        'domain-driven-design',
        'dependency-injection',
        'factory-patterns',
        'strategy-patterns',
        'configuration-validation',
        'async-optimizations',
        'comprehensive-logging',
        'modular-architecture'
      ]
    });
  }

  private setupServer() {
    // List tools handler using new architecture
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const timer = this.logger.startTimer('list_tools');
      
      try {
        const tools = this.toolRegistry.getToolDefinitions();
        
        const duration = timer.end();
        this.logger.info('Listed tools', {
          toolCount: tools.length,
          duration,
          categories: this.toolRegistry.getCategories()
        });
        
        return { tools };
      } catch (error) {
        timer.endWithError(error as Error);
        this.logger.error('Failed to list tools', error as Error);
        throw error;
      }
    });

    // Call tool handler using new architecture
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const timer = this.logger.startTimer(`tool_${name}`);
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        this.logger.info('Tool execution started', {
          toolName: name,
          arguments: args,
          requestId
        });

        // Use the tool registry for execution
        const result = await this.toolRegistry.execute(request, {
          logger: this.logger.child(`Tool:${name}`),
          requestId,
          userId: 'system' // Could be extracted from headers in real implementation
        });

        const duration = timer.end();
        this.logger.info('Tool execution completed', {
          toolName: name,
          duration,
          requestId,
          success: !result.isError
        });

        return result;
      } catch (error) {
        timer.endWithError(error as Error);
        this.logger.error('Tool execution failed', error as Error, {
          toolName: name,
          requestId,
          arguments: args
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Tool execution failed',
                message: (error as Error).message,
                toolName: name,
                requestId
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * Start the server
   */
  async start() {
    this.logger.info('🎯 Starting Full Architecture Legal MCP Server...');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logger.info('🌟 Full Architecture Legal MCP Server running!', {
      serverName: 'full-architecture-legal-mcp',
      version: '2.0.0',
      availableTools: this.toolRegistry.getToolNames(),
      totalTools: this.toolRegistry.getToolNames().length,
      architecture: 'modular-domain-driven'
    });
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      serverName: 'full-architecture-legal-mcp',
      version: '2.0.0',
      toolCount: this.toolRegistry.getToolNames().length,
      categories: this.toolRegistry.getCategories(),
      tools: this.toolRegistry.getToolNames(),
      architecture: {
        patterns: ['dependency-injection', 'factory', 'strategy', 'observer'],
        principles: ['single-responsibility', 'open-closed', 'dependency-inversion'],
        structure: 'domain-driven-design'
      }
    };
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new FullArchitectureLegalMCPServer();
  
  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  // Start server
  server.start().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export { FullArchitectureLegalMCPServer };