import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ReadResourceResult,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  GetPromptResult,
  Prompt,
  Resource,
  McpError,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId, retry } from '../common/utils.js';
import { GracefulShutdown, createGracefulShutdown } from '../graceful-shutdown.js';
import { HealthServer } from '../http-server.js';
import { CacheManager } from '../infrastructure/cache.js';
import { CircuitBreakerManager } from '../infrastructure/circuit-breaker.js';
import { container } from '../infrastructure/container.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { MiddlewareFactory, RequestContext } from '../infrastructure/middleware-factory.js';
import { MCPServerFactory } from '../infrastructure/server-factory.js';
import { getEnhancedToolDefinitions } from '../tool-definitions.js';
import { ServerConfig } from '../types.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { ResourceHandlerRegistry } from './resource-handler.js';
import { PromptHandlerRegistry } from './prompt-handler.js';
import { SamplingService } from './sampling-service.js';
import { getServerInfo, logConfiguration, SESSION } from '../infrastructure/protocol-constants.js';

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

/**
 * Best Practice Legal MCP Server
 *
 * Production-ready MCP server implementation providing comprehensive access to
 * the CourtListener legal database with enterprise-grade features.
 *
 * **Features**:
 * - Dependency injection for testability and flexibility
 * - Middleware support (authentication, rate limiting, sanitization)
 * - Circuit breakers for resilience
 * - Graceful shutdown handling
 * - Health monitoring and metrics
 * - Request tracking and performance monitoring
 * - Comprehensive error handling
 *
 * **Usage**:
 * ```typescript
 * import { bootstrapServices } from './infrastructure/bootstrap.js';
 * import { BestPracticeLegalMCPServer } from './server/best-practice-server.js';
 *
 * bootstrapServices();
 * const server = new BestPracticeLegalMCPServer();
 * await server.start();
 * ```
 *
 * **Configuration**:
 * Configure via environment variables or the configuration system.
 * See `ServerConfig` type for available options.
 *
 * @see {@link ServerConfig} for configuration options
 * @see {@link bootstrapServices} for service initialization
 */
export class BestPracticeLegalMCPServer {
  private readonly server: Server;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly toolRegistry: ToolHandlerRegistry;
  private readonly resourceRegistry: ResourceHandlerRegistry;
  private readonly promptRegistry: PromptHandlerRegistry;
  private readonly middlewareFactory: MiddlewareFactory;
  private readonly config: ServerConfig;
  private readonly circuitBreakers: CircuitBreakerManager;
  private readonly gracefulShutdown: GracefulShutdown;
  private readonly cache: CacheManager;
  private readonly samplingService: SamplingService;

  private healthServer?: HealthServer;
  private transport?: Transport;
  private isShuttingDown = false;
  private readonly activeRequests = new Set<string>();
  private heartbeatInterval?: NodeJS.Timeout;
  private sessionProperties: Map<string, unknown> = new Map();
  private readonly enhancedToolMetadata = this.buildEnhancedMetadata();

  /**
   * Creates a new BestPracticeLegalMCPServer instance
   *
   * **Prerequisites**: Call `bootstrapServices()` before creating an instance
   * to ensure all dependencies are registered in the DI container.
   *
   * @throws {Error} If services are not bootstrapped
   *
   * @example
   * ```typescript
   * bootstrapServices();
   * const server = new BestPracticeLegalMCPServer();
   * ```
   */
  constructor() {
    this.logger = container.get<Logger>('logger');
    this.metrics = container.get<MetricsCollector>('metrics');
    this.toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
    this.resourceRegistry = container.get<ResourceHandlerRegistry>('resourceRegistry');
    this.promptRegistry = container.get<PromptHandlerRegistry>('promptRegistry');
    this.middlewareFactory = container.get<MiddlewareFactory>('middlewareFactory');
    this.config = container.get<ServerConfig>('config');
    this.circuitBreakers = container.get<CircuitBreakerManager>('circuitBreakerManager');
    this.cache = container.get<CacheManager>('cache');

    const serverFactory = container.get<MCPServerFactory>('serverFactory');
    this.server = serverFactory.createServer(this.config);

    this.samplingService = new SamplingService(this.server, this.config, this.logger);

    this.setupHealthServer();
    this.setupHandlers();
    this.setupLifecycleHooks();

    // Configure graceful shutdown with default environment settings
    this.gracefulShutdown = createGracefulShutdown(this.logger.child('Shutdown'));
    this.registerShutdownHooks();

    // Log protocol configuration
    logConfiguration({
      info: (message: string, meta: unknown) =>
        this.logger.info(message, meta as Record<string, unknown>),
    });
  }

  /**
   * Backwards-compatible alias for start()
   *
   * @deprecated Use `start()` instead
   * @see {@link start}
   */
  async run(): Promise<void> {
    await this.start();
  }

  /**
   * Start the MCP server
   *
   * Initializes the stdio transport for MCP communication and starts
   * the optional health server if configured.
   *
   * **What happens when you start**:
   * 1. Sets up stdio transport for MCP protocol
   * 2. Connects the server to the transport
   * 3. Starts health monitoring endpoint (if enabled)
   * 4. Logs server status and features
   *
   * @returns Promise that resolves when the server is started
   * @throws {Error} If server fails to start
   *
   * @example
   * ```typescript
   * const server = new BestPracticeLegalMCPServer();
   * await server.start();
   * // Server is now ready to accept MCP requests
   * ```
   */
  async start(transport?: Transport): Promise<void> {
    this.logger.info('Starting Legal MCP Server (best-practice profile)...', {
      toolCount: this.toolRegistry.getToolNames().length,
      features: this.getFeatureFlags(),
    });

    this.transport = transport || new StdioServerTransport();
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
   * Stop the MCP server gracefully
   *
   * Performs a graceful shutdown:
   * 1. Marks server as shutting down (rejects new requests)
   * 2. Waits for active requests to complete
   * 3. Stops health server
   * 4. Closes transport connection
   * 5. Cleans up resources
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * // Graceful shutdown on SIGINT
   * process.on('SIGINT', async () => {
   *   await server.stop();
   *   process.exit(0);
   * });
   * ```
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
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.activeRequests.size > 0) {
      this.logger.warn('Force closing server with active requests', {
        remainingRequests: Array.from(this.activeRequests),
      });
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    await this.server.close();

    if (this.healthServer) {
      await this.healthServer.stop();
    }

    this.logger.info('Legal MCP Server stopped');
  }

  /**
   * Destroy the server instance for cleanup (useful in tests)
   *
   * This method stops all background tasks without requiring a full shutdown.
   * Use this in tests to clean up server instances and prevent hanging.
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    this.isShuttingDown = true;
  }

  /**
   * Provide direct access to tool catalog for lightweight integrations
   */
  async listTools(): Promise<{ tools: Tool[]; metadata: { categories: string[] } }> {
    const timer = this.logger.startTimer('list_tools_direct');

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
  }

  /**
   * Direct access to list resources
   */
  async listResources(): Promise<{ resources: Resource[] }> {
    const resources = await this.resourceRegistry.getAllResources();
    return { resources };
  }

  /**
   * Direct access to read resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    const handler = this.resourceRegistry.findHandler(uri);
    if (!handler) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
    }
    return handler.read(uri, {
      logger: this.logger,
      requestId: generateId(),
    });
  }

  /**
   * Direct access to list prompts
   */
  async listPrompts(): Promise<{ prompts: Prompt[] }> {
    const prompts = await this.promptRegistry.getAllPrompts();
    return { prompts };
  }

  /**
   * Direct access to get prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    const handler = this.promptRegistry.findHandler(name);
    if (!handler) {
      throw new McpError(ErrorCode.InvalidRequest, `Prompt not found: ${name}`);
    }
    return handler.getMessages(args || {});
  }

  /**
   * Execute a tool call outside of the transport layer for worker/demo usage
   */
  async handleToolCall(
    input:
      | CallToolRequest
      | {
          name: string;
          arguments?: Record<string, unknown>;
        },
  ): Promise<CallToolResult> {
    if (this.isShuttingDown) {
      throw new McpError(ErrorCode.InternalError, 'Server is shutting down');
    }

    const request =
      'params' in input
        ? input
        : {
            method: 'tools/call',
            params: {
              name: input.name,
              arguments: input.arguments ?? {},
            },
          };

    const validation = CallToolRequestSchema.safeParse(request);
    if (!validation.success) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid tool call arguments');
    }

    const requestId = generateId();
    this.activeRequests.add(requestId);

    try {
      return await this.executeToolWithMiddleware(validation.data, requestId);
    } catch (error) {
      throw error;
    } finally {
      this.activeRequests.delete(requestId);
    }
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
      this.circuitBreakers,
    );
  }

  /**
   * Setup MCP lifecycle hooks for initialize, shutdown, and heartbeat
   * Phase 1: MCP Modernization
   */
  private setupLifecycleHooks(): void {
    // Store server info in session properties
    const serverInfo = getServerInfo();
    this.sessionProperties.set('serverInfo', serverInfo);
    this.sessionProperties.set('startTime', new Date().toISOString());

    // Start heartbeat if enabled
    if (SESSION.KEEPALIVE_ENABLED) {
      this.startHeartbeat();
    }

    this.logger.info('Lifecycle hooks configured', {
      heartbeat: SESSION.KEEPALIVE_ENABLED,
      interval: SESSION.HEARTBEAT_INTERVAL_MS,
    });
  }

  /**
   * Start server heartbeat emissions
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.logger.debug('Server heartbeat', {
        activeRequests: this.activeRequests.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });

      this.metrics.recordRequest(0, false); // Track heartbeat
    }, SESSION.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop server heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Get session properties for DI/introspection
   */
  public getSessionProperties(): ReadonlyMap<string, unknown> {
    return this.sessionProperties;
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

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const timer = this.logger.startTimer('list_resources');
      try {
        const resources = this.resourceRegistry.getAllResources();
        const duration = timer.end(true, { resourceCount: resources.length });
        this.metrics.recordRequest(duration, false);
        return { resources };
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        throw error;
      }
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const timer = this.logger.startTimer('read_resource');
      const uri = request.params.uri;

      try {
        const handler = this.resourceRegistry.findHandler(uri);
        if (!handler) {
          throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
        }

        const result = await handler.read(uri, {
          logger: this.logger,
          requestId: generateId(),
        });

        const duration = timer.end(true);
        this.metrics.recordRequest(duration, false);
        return result;
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        throw error;
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const timer = this.logger.startTimer('list_prompts');
      try {
        const prompts = this.promptRegistry.getAllPrompts();
        const duration = timer.end(true, { promptCount: prompts.length });
        this.metrics.recordRequest(duration, false);
        return { prompts };
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        throw error;
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const timer = this.logger.startTimer('get_prompt');
      const name = request.params.name;
      const args = request.params.arguments || {};

      try {
        const handler = this.promptRegistry.findHandler(name);
        if (!handler) {
          throw new McpError(ErrorCode.InvalidRequest, `Prompt not found: ${name}`);
        }

        // Convert arguments to Record<string, string> as expected by PromptHandler
        // Note: This is a simplification, in a real app we might need better type conversion
        const stringArgs: Record<string, string> = {};
        for (const [key, value] of Object.entries(args)) {
          stringArgs[key] = String(value);
        }

        const result = await handler.getMessages(stringArgs);

        const duration = timer.end(true);
        this.metrics.recordRequest(duration, false);
        return result;
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
          `Error executing ${request.params.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.activeRequests.delete(requestId);
      }
    });
  }

  private async executeToolWithMiddleware(
    request: CallToolRequest,
    requestId: string,
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
        sampling: this.samplingService,
      });

    try {
      const result = (await this.middlewareFactory.executeMiddlewareStack(
        middlewares,
        context,
        () =>
          retry(executeTool, {
            maxAttempts: 3,
            baseDelay: 750,
            maxDelay: 5_000,
          }),
      )) as CallToolResult;

      const duration = Date.now() - startTime;

      // If a handler returned an error result, normalize to thrown Error (tests expect thrown on failure)
      if ((result as CallToolResult).isError) {
        this.metrics.recordFailure(duration);
        // Try to extract a human-friendly error message from the text content
        let message = `Tool ${request.params.name} failed`;
        try {
          const errorResult = result as CallToolResult;
          if (
            errorResult.content &&
            Array.isArray(errorResult.content) &&
            errorResult.content.length > 0
          ) {
            const firstContent = errorResult.content[0];
            if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
              try {
                const parsed = JSON.parse(firstContent.text);
                if (parsed && typeof parsed === 'object' && 'error' in parsed) {
                  message = String(parsed.error);
                } else if (typeof parsed === 'string') {
                  message = parsed;
                } else {
                  message = firstContent.text;
                }
              } catch {
                message = firstContent.text;
              }
            }
          }
        } catch {
          // ignore JSON parse issues, keep default message
        }

        this.logger.toolExecution(request.params.name, duration, false, {
          requestId,
          error: message,
        });
        throw new Error(message);
      }

      this.metrics.recordRequest(duration, false);
      this.logger.toolExecution(request.params.name, duration, true, { requestId });
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

    return baseDefinitions.map((tool) => {
      const metadata = this.enhancedToolMetadata.get(tool.name);
      // Ensure inputSchema has the required 'type' field for MCP Tool format
      const inputSchema =
        tool.inputSchema && typeof tool.inputSchema === 'object' && 'type' in tool.inputSchema
          ? tool.inputSchema
          : { type: 'object' as const, properties: tool.inputSchema || {} };

      return {
        name: tool.name,
        description: metadata?.description ?? tool.description,
        inputSchema: inputSchema as Tool['inputSchema'],
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
