/**
 * Optimized Async Server Implementation
 * Implements better async patterns, connection pooling, and error boundaries
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  CallToolResult
} from "@modelcontextprotocol/sdk/types.js";

import { container } from '../infrastructure/container.js';
import { ToolHandlerRegistry } from '../server/tool-handler.js';
import { MiddlewareFactory, RequestContext } from '../infrastructure/middleware-factory.js';
import { generateId, retry } from '../common/utils.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { MCPServerFactory } from '../infrastructure/server-factory.js';
import { ServerConfig } from '../types.js';

export class OptimizedLegalMCPServer {
  private server: Server;
  private toolRegistry: ToolHandlerRegistry;
  private middlewareFactory: MiddlewareFactory;
  private logger: Logger;
  private metrics: MetricsCollector;
  private isShuttingDown = false;
  private activeRequests = new Set<string>();

  constructor() {
    this.logger = container.get<Logger>('logger');
    this.metrics = container.get<MetricsCollector>('metrics');
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    this.middlewareFactory = container.get<MiddlewareFactory>('middlewareFactory');
    
    const serverFactory = container.get<MCPServerFactory>('serverFactory');
    const config = container.get<ServerConfig>('config');
    
    this.server = serverFactory.createServer(config);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools handler with caching
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const startTime = Date.now();
      
      try {
        this.logger.info('Listing available tools');
        
        // Cache tool definitions since they don't change often
        const tools = this.toolRegistry.getToolDefinitions();
        
        this.metrics.recordRequest(Date.now() - startTime, false);
        
        return { tools };
      } catch (error) {
        this.metrics.recordFailure(Date.now() - startTime);
        this.logger.error('Failed to list tools', error as Error);
        throw error;
      }
    });

    // Call tool handler with middleware and error boundaries
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestId = generateId();
      const startTime = Date.now();
      
      if (this.isShuttingDown) {
        throw new Error('Server is shutting down');
      }
      
      this.activeRequests.add(requestId);
      
      try {
        return await this.executeToolWithMiddleware(request, requestId, startTime);
      } finally {
        this.activeRequests.delete(requestId);
      }
    });
  }

  private async executeToolWithMiddleware(
    request: CallToolRequest,
    requestId: string,
    startTime: number
  ): Promise<CallToolResult> {
    const context: RequestContext = {
      requestId,
      startTime,
      metadata: {
        toolName: request.params.name,
        arguments: request.params.arguments
      }
    };

    const config = container.get<ServerConfig>('config');
    const middlewares = this.middlewareFactory.createMiddlewareStack(config);

    const executeToolHandler = async (): Promise<CallToolResult> => {
      return await retry(
        () => this.toolRegistry.execute(request, {
          logger: this.logger,
          requestId
        }),
        {
          maxAttempts: 3,
          baseDelay: 1000,
          maxDelay: 5000
        }
      );
    };

    try {
      const result = await this.middlewareFactory.executeMiddlewareStack(
        middlewares,
        context,
        executeToolHandler
      );
      
      this.metrics.recordRequest(Date.now() - startTime, false);
      
      this.logger.info('Tool executed successfully', {
        toolName: request.params.name,
        requestId,
        duration: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      this.metrics.recordFailure(Date.now() - startTime);
      
      this.logger.error('Tool execution failed', error as Error, {
        toolName: request.params.name,
        requestId,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      const serverFactory = container.get<MCPServerFactory>('serverFactory');
      const transport = serverFactory.createTransport();
      
      this.logger.info('Starting Legal MCP Server...');
      
      await this.server.connect(transport);
      
      this.logger.info('Legal MCP Server started successfully', {
        toolCount: this.toolRegistry.getToolNames().length
      });
    } catch (error) {
      this.logger.error('Failed to start server', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isShuttingDown = true;
    
    this.logger.info('Stopping Legal MCP Server...', {
      activeRequests: this.activeRequests.size
    });
    
    // Wait for active requests to complete (with timeout)
    const maxWaitTime = 10000; // 10 seconds
    const startWait = Date.now();
    
    while (this.activeRequests.size > 0 && Date.now() - startWait < maxWaitTime) {
      this.logger.info('Waiting for active requests to complete', {
        activeRequests: this.activeRequests.size,
        waitTime: Date.now() - startWait
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.activeRequests.size > 0) {
      this.logger.warn('Force stopping with active requests', {
        activeRequests: this.activeRequests.size
      });
    }

    try {
      await this.server.close();
      this.logger.info('Legal MCP Server stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping server', error as Error);
      throw error;
    }
  }

  getHealthStatus() {
    return {
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      activeRequests: this.activeRequests.size,
      uptime: this.metrics.getMetrics().uptime_seconds,
      metrics: this.metrics.getMetrics()
    };
  }
}