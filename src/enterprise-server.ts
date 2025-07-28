#!/usr/bin/env node

/**
 * Legal MCP Server - Enterprise Edition
 * 
 * Enhanced version with optional enterprise features including authentication,
 * advanced security, audit logging, circuit breakers, and compression.
 * 
 * All enterprise features are disabled by default and configurable via environment variables.
 * This maintains full backward compatibility with the standard Legal MCP Server.
 * 
 * @version 1.1.0
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 * @see https://modelcontextprotocol.io/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Import our enhanced modules
import { getConfig } from './config.js';
import { createLogger } from './logger.js';
import { CacheManager } from './cache.js';
import { MetricsCollector } from './metrics.js';
import { CourtListenerAPI } from './courtlistener.js';
import { getEnhancedToolDefinitions } from './tool-definitions.js';
import { HealthServer } from './http-server.js';

// Import optional enterprise features
import { AuthenticationMiddleware } from './middleware/authentication.js';
import { InputSanitizer } from './middleware/sanitization.js';
import { AuditLogger } from './middleware/audit.js';
import { CompressionMiddleware } from './middleware/compression.js';
import { PerClientRateLimiter } from './middleware/rate-limiter.js';
import { CircuitBreakerManager } from './circuit-breaker.js';
import { GracefulShutdown } from './graceful-shutdown.js';

/**
 * Enterprise Legal MCP Server with optional advanced features
 */
export class EnterpriseLegalMCPServer {
  private server: Server;
  private config: any;
  private logger: any;
  private cache: CacheManager;
  private metrics: MetricsCollector;
  private courtListener: CourtListenerAPI;
  private healthServer?: HealthServer;

  // Enterprise features (optional)
  private auth?: AuthenticationMiddleware;
  private sanitizer?: InputSanitizer;
  private auditLogger?: AuditLogger;
  private compression?: CompressionMiddleware;
  private rateLimiter?: PerClientRateLimiter;
  private circuitBreakers?: CircuitBreakerManager;
  private gracefulShutdown?: GracefulShutdown;

  constructor() {
    // Initialize configuration
    this.config = getConfig();
    
    // Initialize logging
    this.logger = createLogger(this.config.logging, 'EnterpriseLegalMCP');
    
    // Initialize graceful shutdown first (if enabled)
    if (this.config.gracefulShutdown?.enabled) {
      this.gracefulShutdown = new GracefulShutdown(
        this.config.gracefulShutdown,
        this.logger.child('GracefulShutdown')
      );
    }

    // Initialize metrics collection
    this.metrics = new MetricsCollector(this.logger);
    
    // Initialize cache
    this.cache = new CacheManager(this.config.cache, this.logger);
    
    // Initialize circuit breakers (if enabled)
    if (this.config.circuitBreaker?.enabled) {
      this.circuitBreakers = new CircuitBreakerManager(
        this.logger.child('CircuitBreaker')
      );
    }
    
    // Initialize CourtListener API client
    this.courtListener = new CourtListenerAPI(
      this.config.courtListener,
      this.cache,
      this.logger.child('CourtListener'),
      this.metrics
    );

    // Initialize enterprise middleware (if enabled)
    this.initializeEnterpriseMiddleware();

    // Initialize optional health server
    if (this.config.metrics.enabled && this.config.metrics.port) {
      this.healthServer = new HealthServer(
        this.config.metrics.port,
        this.logger.child('HealthServer'),
        this.metrics,
        this.cache,
        this.circuitBreakers
      );
    }

    // Initialize MCP server
    this.server = new Server(
      {
        name: "legal-mcp-enterprise",
        version: "1.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupServer();
    
    const enabledFeatures = this.getEnabledFeatures();
    this.logger.info('Enterprise Legal MCP Server initialized', {
      version: '1.1.0',
      features: enabledFeatures
    });
  }

  private initializeEnterpriseMiddleware() {
    // Authentication middleware (if enabled)
    if (this.config.security?.authentication?.enabled) {
      this.auth = new AuthenticationMiddleware(
        this.config.security.authentication,
        this.logger.child('Auth')
      );
    }

    // Input sanitization (if enabled)
    if (this.config.security?.sanitization?.enabled) {
      this.sanitizer = new InputSanitizer(
        this.config.security.sanitization,
        this.logger.child('Sanitizer')
      );
    }

    // Audit logging (if enabled)
    if (this.config.audit?.enabled) {
      this.auditLogger = new AuditLogger(
        this.logger.child('Audit'),
        this.config.correlation || { enabled: false },
        this.config.audit
      );
    }

    // Response compression (if enabled)
    if (this.config.compression?.enabled) {
      this.compression = new CompressionMiddleware(
        this.config.compression,
        this.logger.child('Compression')
      );
    }

    // Rate limiting (if enabled)
    if (this.config.rateLimiting?.perClientEnabled) {
      this.rateLimiter = new PerClientRateLimiter(
        this.config.rateLimiting,
        this.logger.child('RateLimit')
      );
    }
  }

  private getEnabledFeatures(): string[] {
    const baseFeatures = ['caching', 'logging', 'metrics', 'rate-limiting', 'error-handling'];
    const enterpriseFeatures: string[] = [];

    if (this.auth) enterpriseFeatures.push('authentication');
    if (this.sanitizer) enterpriseFeatures.push('input-sanitization');
    if (this.auditLogger) enterpriseFeatures.push('audit-logging');
    if (this.compression) enterpriseFeatures.push('compression');
    if (this.rateLimiter) enterpriseFeatures.push('per-client-rate-limiting');
    if (this.circuitBreakers) enterpriseFeatures.push('circuit-breakers');
    if (this.gracefulShutdown) enterpriseFeatures.push('graceful-shutdown');

    return [...baseFeatures, ...enterpriseFeatures];
  }

  private async applyMiddleware(toolName: string, args: any, clientId?: string, headers?: Record<string, string>): Promise<{
    processedArgs: any;
    correlationId?: string;
  }> {
    let processedArgs = args;
    let correlationId: string | undefined;

    // Authentication check
    if (this.auth) {
      const authResult = await this.auth.authenticate(headers || {});
      if (!authResult.isAuthenticated) {
        throw new McpError(ErrorCode.InvalidRequest, 'Authentication failed');
      }
    }

    // Rate limiting check
    if (this.rateLimiter && clientId) {
      const rateLimitResult = this.rateLimiter.checkLimit(clientId, headers || {});
      if (!rateLimitResult.allowed) {
        throw new McpError(
          ErrorCode.InvalidRequest, 
          `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds`
        );
      }
    }

    // Input sanitization
    if (this.sanitizer) {
      processedArgs = await this.sanitizer.sanitize(processedArgs);
    }

    // Audit logging
    if (this.auditLogger) {
      correlationId = this.auditLogger.extractCorrelationId(headers || {});
    }

    return { processedArgs, correlationId };
  }

  private async compressResponse(result: any): Promise<any> {
    if (this.compression) {
      return await this.compression.compressResponse(result);
    }
    return result;
  }

  private setupServer() {
    // List tools handler with enterprise middleware
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      const timer = this.logger.startTimer('list_tools');
      
      try {
        // Extract client ID from request metadata if available
        const clientId = (request as any)?.meta?.clientId || 'anonymous';
        
        // Apply middleware
        const { correlationId } = await this.applyMiddleware('list_tools', {}, clientId);
        
        const enhancedTools = getEnhancedToolDefinitions();
        
        // Convert enhanced tools to MCP tool format
        const tools: Tool[] = enhancedTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));

        // Compress response if enabled
        const result = await this.compressResponse({ tools });

        const duration = timer.end();
        this.metrics.recordRequest(duration, false);

        // Complete audit log
        if (this.auditLogger && correlationId) {
          const auditEvent = this.auditLogger.createToolAuditEvent(
            correlationId,
            'list_tools',
            { isAuthenticated: true, permissions: ['*'] },
            {},
            { toolCount: tools.length },
            duration,
            true
          );
          this.auditLogger.logAuditEvent(auditEvent);
        }
        
        return result;
      } catch (error) {
        timer.endWithError(error as Error);
        throw error;
      }
    });

    // Call tool handler with enterprise middleware
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const timer = this.logger.startTimer(`tool_${name}`);
      
      try {
        // Extract client ID from request metadata if available
        const clientId = (request as any)?.meta?.clientId || 'anonymous';
        
        // Apply enterprise middleware
        const { processedArgs, correlationId } = await this.applyMiddleware(name, args, clientId);

        this.logger.info('Tool execution started', {
          toolName: name,
          arguments: processedArgs,
          correlationId,
          clientId
        });

        let result;
        
        // Route to appropriate handler (same routing as base server)
        switch (name) {
          case 'search_cases':
            result = await this.handleSearchCases(processedArgs);
            break;
          case 'get_case_details':
            result = await this.handleGetCaseDetails(processedArgs);
            break;
          case 'get_opinion_text':
            result = await this.handleGetOpinionText(processedArgs);
            break;
          case 'lookup_citation':
            result = await this.handleLookupCitation(processedArgs);
            break;
          case 'get_related_cases':
            result = await this.handleGetRelatedCases(processedArgs);
            break;
          case 'list_courts':
            result = await this.handleListCourts(processedArgs);
            break;
          case 'analyze_legal_argument':
            result = await this.handleAnalyzeLegalArgument(processedArgs);
            break;
          case 'get_financial_disclosures':
            result = await this.handleGetFinancialDisclosures(processedArgs);
            break;
          case 'get_financial_disclosure':
            result = await this.handleGetFinancialDisclosure(processedArgs);
            break;
          case 'get_parties_and_attorneys':
            result = await this.handleGetPartiesAndAttorneys(processedArgs);
            break;
          case 'get_recap_documents':
            result = await this.handleGetRECAPDocuments(processedArgs);
            break;
          case 'get_recap_document':
            result = await this.handleGetRECAPDocument(processedArgs);
            break;
          case 'manage_alerts':
            result = await this.handleManageAlerts(processedArgs);
            break;
          case 'get_citation_network':
            result = await this.handleGetCitationNetwork(processedArgs);
            break;
          case 'analyze_case_authorities':
            result = await this.handleAnalyzeCaseAuthorities(processedArgs);
            break;
          case 'get_dockets':
            result = await this.handleGetDockets(processedArgs);
            break;
          case 'get_docket':
            result = await this.handleGetDocket(processedArgs);
            break;
          case 'get_judges':
            result = await this.handleGetJudges(processedArgs);
            break;
          case 'get_judge':
            result = await this.handleGetJudge(processedArgs);
            break;
          case 'get_oral_arguments':
            result = await this.handleGetOralArguments(processedArgs);
            break;
          case 'get_oral_argument':
            result = await this.handleGetOralArgument(processedArgs);
            break;
          case 'advanced_search':
            result = await this.handleAdvancedSearch(processedArgs);
            break;
          case 'get_visualization_data':
            result = await this.handleGetVisualizationData(processedArgs);
            break;
          case 'get_bulk_data':
            result = await this.handleGetBulkData(processedArgs);
            break;
          case 'get_bankruptcy_data':
            result = await this.handleGetBankruptcyData(processedArgs);
            break;
          case 'get_docket_entries':
            result = await this.handleGetDocketEntries(processedArgs);
            break;
          case 'get_comprehensive_judge_profile':
            result = await this.handleGetComprehensiveJudgeProfile(processedArgs);
            break;
          case 'get_comprehensive_case_analysis':
            result = await this.handleGetComprehensiveCaseAnalysis(processedArgs);
            break;
          case 'get_financial_disclosure_details':
            result = await this.handleGetFinancialDisclosureDetails(processedArgs);
            break;
          case 'validate_citations':
            result = await this.handleValidateCitations(processedArgs);
            break;
          case 'get_enhanced_recap_data':
            result = await this.handleGetEnhancedRECAPData(processedArgs);
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        // Compress response if enabled
        const compressedResult = await this.compressResponse(result);

        // Update metrics
        const duration = timer.end();
        this.metrics.recordRequest(duration, false);
        
        // Complete audit log
        if (this.auditLogger && correlationId) {
          this.auditLogger.createToolAuditEvent(
            correlationId,
            name,
            { isAuthenticated: true, permissions: ['*'] },
            processedArgs,
            result,
            duration,
            true
          );
        }
        
        this.logger.info('Tool execution completed', {
          toolName: name,
          duration: duration,
          success: true,
          correlationId
        });

        return compressedResult;
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        
        this.logger.error('Tool execution failed', {
          toolName: name,
          error: error instanceof Error ? error.message : String(error),
          duration: duration
        });

        throw error;
      }
    });
  }

  // All handler methods remain the same as the base server
  // (For brevity, I'll reference that they should be copied from the base index.ts)
  // These methods handle the actual tool execution logic

  /**
   * Search for legal cases
   */
  private async handleSearchCases(args: any) {
    return await this.courtListener.searchCases(args);
  }

  /**
   * Get case details
   */
  private async handleGetCaseDetails(args: any) {
    return await this.courtListener.getCaseDetails(args);
  }

  /**
   * Get opinion text
   */
  private async handleGetOpinionText(args: any) {
    return await this.courtListener.getOpinionText(args);
  }

  /**
   * Lookup citation
   */
  private async handleLookupCitation(args: any) {
    return await this.courtListener.lookupCitation(args);
  }

  /**
   * Get related cases
   */
  private async handleGetRelatedCases(args: any) {
    return await this.courtListener.getRelatedCases(args);
  }

  /**
   * List courts
   */
  private async handleListCourts(args: any) {
    return await this.courtListener.listCourts(args);
  }

  /**
   * Analyze legal argument
   */
  private async handleAnalyzeLegalArgument(args: any) {
    return await this.courtListener.analyzeLegalArgument(args);
  }

  /**
   * Get financial disclosures
   */
  private async handleGetFinancialDisclosures(args: any) {
    return await this.courtListener.getFinancialDisclosures(args);
  }

  /**
   * Get financial disclosure
   */
  private async handleGetFinancialDisclosure(args: any) {
    return await this.courtListener.getFinancialDisclosure(args);
  }

  /**
   * Get parties and attorneys
   */
  private async handleGetPartiesAndAttorneys(args: any) {
    return await this.courtListener.getPartiesAndAttorneys(args);
  }

  /**
   * Get RECAP documents
   */
  private async handleGetRECAPDocuments(args: any) {
    return await this.courtListener.getRECAPDocuments(args);
  }

  /**
   * Get RECAP document
   */
  private async handleGetRECAPDocument(args: any) {
    return await this.courtListener.getRECAPDocument(args);
  }

  /**
   * Manage alerts
   */
  private async handleManageAlerts(args: any) {
    return await this.courtListener.manageAlerts(args);
  }

  /**
   * Get citation network
   */
  private async handleGetCitationNetwork(args: any) {
    return await this.courtListener.getCitationNetwork(args.opinionId || args.id, args);
  }

  /**
   * Analyze case authorities
   */
  private async handleAnalyzeCaseAuthorities(args: any) {
    return await this.courtListener.analyzeCaseAuthorities(args);
  }

  /**
   * Get dockets
   */
  private async handleGetDockets(args: any) {
    return await this.courtListener.getDockets(args);
  }

  /**
   * Get docket
   */
  private async handleGetDocket(args: any) {
    return await this.courtListener.getDocket(args);
  }

  /**
   * Get judges
   */
  private async handleGetJudges(args: any) {
    return await this.courtListener.getJudges(args);
  }

  /**
   * Get judge
   */
  private async handleGetJudge(args: any) {
    return await this.courtListener.getJudge(args);
  }

  /**
   * Get oral arguments
   */
  private async handleGetOralArguments(args: any) {
    return await this.courtListener.getOralArguments(args);
  }

  /**
   * Get oral argument
   */
  private async handleGetOralArgument(args: any) {
    return await this.courtListener.getOralArgument(args);
  }

  /**
   * Advanced search
   */
  private async handleAdvancedSearch(args: any) {
    return await this.courtListener.advancedSearch(args);
  }

  /**
   * Get visualization data
   */
  private async handleGetVisualizationData(args: any) {
    return await this.courtListener.getVisualizationData(args);
  }

  /**
   * Get bulk data
   */
  private async handleGetBulkData(args: any) {
    return await this.courtListener.getBulkData(args);
  }

  /**
   * Get bankruptcy data
   */
  private async handleGetBankruptcyData(args: any) {
    return await this.courtListener.getBankruptcyData(args);
  }

  /**
   * Get docket entries
   */
  private async handleGetDocketEntries(args: any) {
    return await this.courtListener.getDocketEntries(args);
  }

  /**
   * Get comprehensive judge profile
   */
  private async handleGetComprehensiveJudgeProfile(args: any) {
    return await this.courtListener.getComprehensiveJudgeProfile(args.judge_id);
  }

  /**
   * Get comprehensive case analysis
   */
  private async handleGetComprehensiveCaseAnalysis(args: any) {
    return await this.courtListener.getComprehensiveCaseAnalysis(args.cluster_id);
  }

  /**
   * Get financial disclosure details
   */
  private async handleGetFinancialDisclosureDetails(args: any) {
    const { disclosure_type, ...params } = args;
    
    switch (disclosure_type) {
      case 'investments':
        return await this.courtListener.getFinancialInvestments(params);
      case 'debts':
        return await this.courtListener.getFinancialDebts(params);
      case 'gifts':
        return await this.courtListener.getFinancialGifts(params);
      case 'agreements':
        return await this.courtListener.getFinancialAgreements(params);
      case 'positions':
        return await this.courtListener.getDisclosurePositions(params);
      case 'reimbursements':
        return await this.courtListener.getReimbursements(params);
      case 'spouse_incomes':
        return await this.courtListener.getSpouseIncomes(params);
      case 'non_investment_incomes':
        return await this.courtListener.getNonInvestmentIncomes(params);
      default:
        throw new Error(`Unknown disclosure type: ${disclosure_type}`);
    }
  }

  /**
   * Validate citations
   */
  private async handleValidateCitations(args: any) {
    return await this.courtListener.validateCitations(args.text);
  }

  /**
   * Get enhanced RECAP data
   */
  private async handleGetEnhancedRECAPData(args: any) {
    const { action, ...params } = args;
    
    switch (action) {
      case 'fetch':
        return await this.courtListener.getRECAPFetch(params);
      case 'query':
        return await this.courtListener.getRECAPQuery(params);
      case 'email':
        return await this.courtListener.getRECAPEmail(params);
      default:
        throw new Error(`Unknown RECAP action: ${action}`);
    }
  }

  /**
   * Get server health including enterprise features
   */
  public getHealth() {
    const baseHealth = {
      ...this.metrics.getHealth(),
      cache_stats: this.cache.getStats(),
      config: {
        cache_enabled: this.cache.isEnabled(),
        log_level: this.config.logging.level
      }
    };

    // Add enterprise feature status
    const enterpriseStatus = {
      authentication: !!this.auth,
      input_sanitization: !!this.sanitizer,
      audit_logging: !!this.auditLogger,
      compression: !!this.compression,
      per_client_rate_limiting: !!this.rateLimiter,
      circuit_breakers: !!this.circuitBreakers,
      graceful_shutdown: !!this.gracefulShutdown
    };

    return {
      ...baseHealth,
      enterprise_features: enterpriseStatus,
      circuit_breaker_stats: this.circuitBreakers?.getAllStats()
    };
  }

  /**
   * Start the enterprise server
   */
  async run() {
    // Register graceful shutdown hooks
    if (this.gracefulShutdown) {
      this.gracefulShutdown.addHook({
        name: 'cache',
        priority: 3,
        cleanup: async () => {
          this.logger.info('Shutting down cache...');
          // Cache cleanup if needed
        }
      });

      this.gracefulShutdown.addHook({
        name: 'health-server',
        priority: 2,
        cleanup: async () => {
          if (this.healthServer) {
            this.logger.info('Shutting down health server...');
            await this.healthServer.stop();
          }
        }
      });

      this.gracefulShutdown.addHook({
        name: 'metrics',
        priority: 1,
        cleanup: async () => {
          this.logger.info('Flushing metrics...');
          // Metrics cleanup if needed
        }
      });
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Start health server if enabled
    if (this.healthServer) {
      try {
        await this.healthServer.start();
      } catch (error) {
        this.logger.warn('Failed to start health server', error as Error);
      }
    }
    
    // Log startup information
    const enabledFeatures = this.getEnabledFeatures();
    this.logger.info('Enterprise Legal MCP Server started', {
      version: '1.1.0',
      transport: 'stdio',
      tools_count: getEnhancedToolDefinitions().length,
      features: enabledFeatures,
      health_server_port: this.config.metrics.port
    });

    console.error("Legal MCP Server v1.1.0 - Enterprise Edition");
    console.error(`Enhanced features: ${enabledFeatures.join(', ')}`);
    if (this.healthServer) {
      console.error(`Health server running on http://localhost:${this.config.metrics.port}`);
    }
    console.error("Repository: https://github.com/blakeox/courtlistener-mcp");
    console.error("MCP Docs: https://modelcontextprotocol.io/");
  }
}

// Main execution
async function main() {
  const server = new EnterpriseLegalMCPServer();
  await server.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Failed to start Enterprise Legal MCP Server:", error);
    process.exit(1);
  });
}
