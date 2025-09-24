import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId, retry } from '../common/utils.js';
import { HealthServer } from '../http-server.js';
import { CacheManager } from '../infrastructure/cache.js';
import { CircuitBreakerManager } from '../infrastructure/circuit-breaker.js';
import { container } from '../infrastructure/container.js';
import { MiddlewareFactory, RequestContext } from '../infrastructure/middleware-factory.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { GracefulShutdown, createGracefulShutdown } from '../graceful-shutdown.js';
import { Logger } from '../infrastructure/logger.js';
import { MCPServerFactory } from '../infrastructure/server-factory.js';
import { getEnhancedToolDefinitions } from '../tool-definitions.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { ServerConfig } from '../types.js';

interface ToolMetadata {
  name: string;
  category?: string;
  complexity?: string;
  rateLimitWeight?: number;
  examples?: Array<{
    name: string;
    description: string;
    arguments: Record<string, unknown>;
  }>;
  description?: string;
}

export class BestPracticeLegalMCPServer {
  private readonly server: Server;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly toolRegistry: ToolHandlerRegistry;
  private readonly middlewareFactory: MiddlewareFactory;
  private readonly config: ServerConfig;
  private readonly circuitBreakers: CircuitBreakerManager;
  private readonly gracefulShutdown: GracefulShutdown;
  private readonly cache: CacheManager;

  private healthServer?: HealthServer;
  private transport?: StdioServerTransport;
  private isShuttingDown = false;
  private readonly activeRequests = new Set<string>();
  private readonly enhancedToolMetadata = this.buildEnhancedMetadata();

  constructor() {
    this.logger = container.get<Logger>('logger');
    this.metrics = container.get<MetricsCollector>('metrics');
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    this.middlewareFactory = container.get<MiddlewareFactory>('middlewareFactory');
    this.config = container.get<ServerConfig>('config');
  this.circuitBreakers = container.get<CircuitBreakerManager>('circuitBreakerManager');
  this.cache = container.get<CacheManager>('cache');

    const serverFactory = container.get<MCPServerFactory>('serverFactory');
    this.server = serverFactory.createServer(this.config);

    this.setupHealthServer();
    this.setupHandlers();

    // Configure graceful shutdown with default environment settings
    this.gracefulShutdown = createGracefulShutdown(this.logger.child('Shutdown'));
    this.registerShutdownHooks();
  }

  /**
   * Start the MCP server using stdio transport and optional health server
   */
  async start(): Promise<void> {
    this.logger.info('Starting Legal MCP Server (best-practice profile)...', {
      toolCount: this.toolRegistry.getToolNames().length,
      features: this.getFeatureFlags(),
    });

    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);

    if (this.healthServer) {
      await this.healthServer.start();
    }

    this.logger.info('Legal MCP Server ready for connections', {
      tools: this.toolRegistry.getToolNames(),
      categories: this.toolRegistry.getCategories(),
    });
  }

  /**
   * Stop the MCP server and wait for in-flight requests to finish
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Stopping Legal MCP Server...', {
      activeRequests: this.activeRequests.size,
    });

    const maxWaitMs = 10_000;
    const start = Date.now();

    while (this.activeRequests.size > 0 && Date.now() - start < maxWaitMs) {
      this.logger.debug('Waiting for active requests to complete', {
        activeRequests: this.activeRequests.size,
        waitedMs: Date.now() - start,
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeRequests.size > 0) {
      this.logger.warn('Force closing server with active requests', {
        remainingRequests: Array.from(this.activeRequests),
      });
    }

    await this.server.close();

    if (this.healthServer) {
      await this.healthServer.stop();
    }

    this.logger.info('Legal MCP Server stopped');
  }

  /**
   * Expose the graceful shutdown coordinator for diagnostics
   */
  getShutdownCoordinator(): GracefulShutdown {
    return this.gracefulShutdown;
  }

  /**
   * Surface runtime health status for monitoring
   */
  getHealthStatus() {
    return {
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      activeRequests: this.activeRequests.size,
      metrics: this.metrics.getMetrics(),
      performance: this.metrics.getPerformanceSummary(),
      circuitBreakersHealthy: this.circuitBreakers.areAllHealthy(),
      timestamp: new Date().toISOString(),
    };
  }

  private setupHealthServer(): void {
    if (!this.config.metrics.enabled || !this.config.metrics.port) {
      return;
    }

    this.healthServer = new HealthServer(
      this.config.metrics.port,
      this.logger.child('HealthServer'),
      this.metrics,
      this.cache,
      this.circuitBreakers
    );
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const timer = this.logger.startTimer('list_tools');

      try {
        const tools = this.buildToolDefinitions();
        const duration = timer.end(true, { toolCount: tools.length });
        this.metrics.recordRequest(duration, false);

        return {
          tools,
          metadata: {
            categories: this.toolRegistry.getCategories(),
          },
        };
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        throw error;
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (this.isShuttingDown) {
        throw new McpError(ErrorCode.InternalError, 'Server is shutting down');
      }

      const requestId = generateId();
      this.activeRequests.add(requestId);

      try {
        return await this.executeToolWithMiddleware(request, requestId);
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        this.activeRequests.delete(requestId);
      }
    });
  }

  private async executeToolWithMiddleware(
    request: CallToolRequest,
    requestId: string
  ): Promise<CallToolResult> {
    const startTime = Date.now();
    const context: RequestContext = {
      requestId,
      startTime,
      metadata: {
        toolName: request.params.name,
        arguments: request.params.arguments,
      },
    };

    const middlewares = this.middlewareFactory.createMiddlewareStack(this.config);

    const executeTool = async () =>
      this.toolRegistry.execute(request, {
        logger: this.logger.child(`Tool:${request.params.name}`),
        requestId,
        cache: this.cache,
        metrics: this.metrics,
        config: this.config,
      });

    try {
      const result = await this.middlewareFactory.executeMiddlewareStack(middlewares, context, () =>
        retry(executeTool, {
          maxAttempts: 3,
          baseDelay: 750,
          maxDelay: 5_000,
        })
      );

      const duration = Date.now() - startTime;
      this.metrics.recordRequest(duration, false);
      this.logger.toolExecution(request.params.name, duration, !(result as CallToolResult).isError, {
        requestId,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordFailure(duration);
      this.logger.toolExecution(request.params.name, duration, false, {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildToolDefinitions(): Tool[] {
    const baseDefinitions = this.toolRegistry.getToolDefinitions();

    return baseDefinitions.map(tool => {
      const metadata = this.enhancedToolMetadata.get(tool.name);
      return {
        ...tool,
        description: metadata?.description ?? tool.description,
        inputSchema: tool.inputSchema,
        // Extra metadata is provided separately so MCP clients remain spec-compliant
      } satisfies Tool;
    });
  }

  private buildEnhancedMetadata(): Map<string, ToolMetadata> {
    const metadataMap = new Map<string, ToolMetadata>();

    for (const tool of getEnhancedToolDefinitions()) {
      metadataMap.set(tool.name, {
        name: tool.name,
        category: tool.category,
        complexity: tool.complexity,
        rateLimitWeight: tool.rateLimitWeight,
        description: tool.description,
        examples: tool.examples,
      });
    }

    return metadataMap;
  }

  private registerShutdownHooks(): void {
    this.gracefulShutdown.addHook({
      name: 'mcp-server',
      priority: 10,
      cleanup: async () => {
        await this.stop();
      },
    });

    if (this.healthServer) {
      this.gracefulShutdown.addHook({
        name: 'health-server',
        priority: 20,
        cleanup: async () => {
          await this.healthServer?.stop();
        },
      });
    }
  }

  private getFeatureFlags(): string[] {
    const features: string[] = [
      'dependency-injection',
      'structured-logging',
      'metrics',
      'middleware',
      'retry-logic',
      'graceful-shutdown',
    ];

    if (this.healthServer) {
      features.push('health-server');
    }

    if (this.config.security.rateLimitEnabled) {
      features.push('rate-limiting');
    }

    if (this.config.security.authEnabled) {
      features.push('authentication');
    }

    if (this.config.cache.enabled) {
      features.push('caching');
    }

    if (this.config.circuitBreaker.enabled) {
      features.push('circuit-breakers');
    }

    return features;
  }
}
