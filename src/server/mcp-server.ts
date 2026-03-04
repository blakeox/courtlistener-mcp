import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  GetPromptResult,
  Prompt,
  Resource,
  McpError,
  ReadResourceResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { generateId } from '../common/utils.js';
import { GracefulShutdown, createGracefulShutdown } from '../graceful-shutdown.js';
import { HealthServer } from '../http-server.js';
import { CacheManager } from '../infrastructure/cache.js';
import { CircuitBreakerManager } from '../infrastructure/circuit-breaker.js';
import { container } from '../infrastructure/container.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { MiddlewareFactory } from '../infrastructure/middleware-factory.js';
import { MCPServerFactory } from '../infrastructure/server-factory.js';
import { ServerConfig } from '../types.js';
import { ToolHandlerRegistry } from './tool-handler.js';
import { ResourceHandlerRegistry } from './resource-handler.js';
import { PromptHandlerRegistry } from './prompt-handler.js';
import { SamplingService } from './sampling-service.js';
import { SubscriptionManager } from './subscription-manager.js';
import { getServerInfo, logConfiguration, SESSION } from '../infrastructure/protocol-constants.js';
import { setupHandlers } from './handler-registry.js';
import { buildToolDefinitions, buildEnhancedMetadata, ToolMetadata } from './tool-builder.js';
import {
  createMiddlewareToolExecutionService,
  type ToolExecutionService,
} from './tool-execution-service.js';

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
  private readonly subscriptionManager: SubscriptionManager;
  private readonly toolExecutionService: ToolExecutionService;

  private healthServer?: HealthServer;
  private transport?: Transport;
  private isShuttingDown = false;
  private readonly activeRequests = new Set<string>();
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private sessionProperties: Map<string, unknown> = new Map();
  private readonly enhancedToolMetadata: Map<string, ToolMetadata> = buildEnhancedMetadata();

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
    this.subscriptionManager = new SubscriptionManager();
    this.toolExecutionService = createMiddlewareToolExecutionService({
      toolRegistry: this.toolRegistry,
      logger: this.logger,
      metrics: this.metrics,
      middlewareFactory: this.middlewareFactory,
      config: this.config,
      cache: this.cache,
      sampling: this.samplingService,
    });

    this.setupHealthServer();

    setupHandlers({
      server: this.server,
      logger: this.logger,
      metrics: this.metrics,
      subscriptionManager: this.subscriptionManager,
      listTools: () => this.listToolsCore(),
      listResources: () => this.listResourcesCore(),
      readResource: (uri) => this.readResourceCore(uri),
      listPrompts: () => this.listPromptsCore(),
      getPrompt: (name, args) => this.getPromptCore(name, args),
      executeTool: (request) => this.executeToolCore(request),
    });

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
   * Access the underlying MCP Server instance for custom transport wiring.
   */
  getServer(): Server {
    return this.server;
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
   * @returns Promise that resolves when the server is started
   * @throws {Error} If server fails to start
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
   * @returns Promise that resolves when shutdown is complete
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
      this.stopHeartbeat();
    }

    await this.server.close();

    if (this.healthServer) {
      await this.healthServer.stop();
    }

    this.logger.info('Legal MCP Server stopped');
  }

  /**
   * Destroy the server instance for cleanup (useful in tests)
   */
  destroy(): void {
    this.stopHeartbeat();
    this.isShuttingDown = true;
  }

  /**
   * Provide direct access to tool catalog for lightweight integrations
   */
  async listTools(): Promise<{ tools: Tool[]; metadata: { categories: string[] } }> {
    const timer = this.logger.startTimer('list_tools_direct');

    try {
      const result = await this.listToolsCore();
      const duration = timer.end(true, { toolCount: result.tools.length });
      this.metrics.recordRequest(duration, false, 'mcp.list_tools_direct');

      return result;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      this.metrics.recordFailure(duration, 'mcp.list_tools_direct');
      throw error;
    }
  }

  /**
   * Direct access to list resources
   */
  async listResources(): Promise<{ resources: Resource[] }> {
    return this.listResourcesCore();
  }

  /**
   * Direct access to read resource
   */
  async readResource(uri: string): Promise<ReadResourceResult> {
    return this.readResourceCore(uri);
  }

  /**
   * Direct access to list prompts
   */
  async listPrompts(): Promise<{ prompts: Prompt[] }> {
    return this.listPromptsCore();
  }

  /**
   * Direct access to get prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    return this.getPromptCore(name, args);
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

    return this.executeToolCore(validation.data);
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

  private async listToolsCore(): Promise<{ tools: Tool[]; metadata: { categories: string[] } }> {
    return {
      tools: this.buildToolDefinitions(),
      metadata: {
        categories: this.toolRegistry.getCategories(),
      },
    };
  }

  private async listResourcesCore(): Promise<{ resources: Resource[] }> {
    return { resources: this.resourceRegistry.getAllResources() };
  }

  private async readResourceCore(uri: string): Promise<ReadResourceResult> {
    const handler = this.resourceRegistry.findHandler(uri);
    if (!handler) {
      throw new McpError(ErrorCode.InvalidRequest, `Resource not found: ${uri}`);
    }
    return handler.read(uri, {
      logger: this.logger,
      requestId: generateId(),
    });
  }

  private async listPromptsCore(): Promise<{ prompts: Prompt[] }> {
    return { prompts: this.promptRegistry.getAllPrompts() };
  }

  private async getPromptCore(
    name: string,
    args: Record<string, string> = {},
  ): Promise<GetPromptResult> {
    const handler = this.promptRegistry.findHandler(name);
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }
    return handler.getMessages(args);
  }

  private async executeToolCore(request: CallToolRequest): Promise<CallToolResult> {
    if (this.isShuttingDown) {
      throw new McpError(ErrorCode.InternalError, 'Server is shutting down');
    }

    const requestId = generateId();
    this.activeRequests.add(requestId);

    try {
      return await this.toolExecutionService.execute(request, requestId);
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
   */
  private setupLifecycleHooks(): void {
    const serverInfo = getServerInfo();
    this.sessionProperties.set('serverInfo', serverInfo);
    this.sessionProperties.set('startTime', new Date().toISOString());

    if (SESSION.KEEPALIVE_ENABLED) {
      this.startHeartbeat();
    }

    this.logger.info('Lifecycle hooks configured', {
      heartbeat: SESSION.KEEPALIVE_ENABLED,
      interval: SESSION.HEARTBEAT_INTERVAL_MS,
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.logger.debug('Server heartbeat', {
        activeRequests: this.activeRequests.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    }, SESSION.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  public getSessionProperties(): ReadonlyMap<string, unknown> {
    return this.sessionProperties;
  }

  private buildToolDefinitions(): Tool[] {
    return buildToolDefinitions(this.toolRegistry, this.enhancedToolMetadata);
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
