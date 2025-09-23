#!/usr/bin/env node

/**
 * Legal MCP Server - Best Practice Implementation
 * 
 * A comprehensive Model Context Protocol server providing access to legal research
 * with enterprise-grade features including caching, logging, metrics, and error handling.
 * 
 * @version 1.0.0
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
import { getConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';
import { CacheManager } from './infrastructure/cache.js';
import { MetricsCollector } from './infrastructure/metrics.js';
import { CourtListenerAPI } from './courtlistener.js';
import { getEnhancedToolDefinitions } from './tool-definitions.js';
import { HealthServer } from './http-server.js';

/**
 * Enhanced Legal MCP Server with best practice implementation
 */
export class LegalMCPServer {
  private server: Server;
  private config: any;
  private logger: any;
  private cache: CacheManager;
  private metrics: MetricsCollector;
  private courtListener: CourtListenerAPI;
  private healthServer?: HealthServer;

  constructor() {
    // Initialize configuration
    this.config = getConfig();
    
    // Initialize logging
    this.logger = createLogger(this.config.logging, 'LegalMCP');
    
    // Initialize metrics collection
    this.metrics = new MetricsCollector(this.logger);
    
    // Initialize cache
    this.cache = new CacheManager(this.config.cache, this.logger);
    
    // Initialize CourtListener API client
    this.courtListener = new CourtListenerAPI(
      this.config.courtListener,
      this.cache,
      this.logger.child('CourtListener'),
      this.metrics
    );

    // Initialize optional health server
    if (this.config.metrics.enabled && this.config.metrics.port) {
      this.healthServer = new HealthServer(
        this.config.metrics.port,
        this.logger.child('HealthServer'),
        this.metrics,
        this.cache
      );
    }

    // Initialize MCP server
    this.server = new Server(
      {
        name: "legal-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupServer();
    this.logger.info('Legal MCP Server initialized', {
      version: '1.0.0',
      features: ['caching', 'logging', 'metrics', 'rate-limiting', 'error-handling']
    });
  }

  private setupServer() {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const timer = this.logger.startTimer('list_tools');
      
      try {
        const enhancedTools = getEnhancedToolDefinitions();
        
        // Convert enhanced tools to MCP tool format
        const tools: Tool[] = enhancedTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }));

        const duration = timer.end();
        this.metrics.recordRequest(duration, false);
        
        return { tools };
      } catch (error) {
        timer.endWithError(error as Error);
        throw error;
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const timer = this.logger.startTimer(`tool_${name}`);
      
      try {
        this.logger.info('Tool execution started', {
          toolName: name,
          arguments: args
        });

        let result;
        
        // Route to appropriate handler
        switch (name) {
          case 'search_cases':
            result = await this.handleSearchCases(args);
            break;
          case 'get_case_details':
            result = await this.handleGetCaseDetails(args);
            break;
          case 'get_opinion_text':
            result = await this.handleGetOpinionText(args);
            break;
          case 'lookup_citation':
            result = await this.handleLookupCitation(args);
            break;
          case 'get_related_cases':
            result = await this.handleGetRelatedCases(args);
            break;
          case 'list_courts':
            result = await this.handleListCourts(args);
            break;
          case 'analyze_legal_argument':
            result = await this.handleAnalyzeLegalArgument(args);
            break;
          case 'get_financial_disclosures':
            result = await this.handleGetFinancialDisclosures(args);
            break;
          case 'get_financial_disclosure':
            result = await this.handleGetFinancialDisclosure(args);
            break;
          case 'get_parties_and_attorneys':
            result = await this.handleGetPartiesAndAttorneys(args);
            break;
          case 'get_recap_documents':
            result = await this.handleGetRECAPDocuments(args);
            break;
          case 'get_recap_document':
            result = await this.handleGetRECAPDocument(args);
            break;
          case 'manage_alerts':
            result = await this.handleManageAlerts(args);
            break;
          case 'get_citation_network':
            result = await this.handleGetCitationNetwork(args);
            break;
          case 'analyze_case_authorities':
            result = await this.handleAnalyzeCaseAuthorities(args);
            break;
          case 'get_dockets':
            result = await this.handleGetDockets(args);
            break;
          case 'get_docket':
            result = await this.handleGetDocket(args);
            break;
          case 'get_judges':
            result = await this.handleGetJudges(args);
            break;
          case 'get_judge':
            result = await this.handleGetJudge(args);
            break;
          case 'get_oral_arguments':
            result = await this.handleGetOralArguments(args);
            break;
          case 'get_oral_argument':
            result = await this.handleGetOralArgument(args);
            break;
          case 'advanced_search':
            result = await this.handleAdvancedSearch(args);
            break;
          case 'get_visualization_data':
            result = await this.handleGetVisualizationData(args);
            break;
          case 'get_bulk_data':
            result = await this.handleGetBulkData(args);
            break;
          case 'get_bankruptcy_data':
            result = await this.handleGetBankruptcyData(args);
            break;
          case 'get_docket_entries':
            result = await this.handleGetDocketEntries(args);
            break;
          case 'get_comprehensive_judge_profile':
            result = await this.handleGetComprehensiveJudgeProfile(args);
            break;
          case 'get_comprehensive_case_analysis':
            result = await this.handleGetComprehensiveCaseAnalysis(args);
            break;
          case 'get_financial_disclosure_details':
            result = await this.handleGetFinancialDisclosureDetails(args);
            break;
          case 'validate_citations':
            result = await this.handleValidateCitations(args);
            break;
          case 'get_enhanced_recap_data':
            result = await this.handleGetEnhancedRECAPData(args);
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        const duration = timer.end(true);
        this.metrics.recordRequest(duration, false);
        
        this.logger.toolExecution(name, duration, true, {
          argumentCount: Object.keys(args || {}).length
        });

        return result;
        
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.metrics.recordFailure(duration);
        
        this.logger.toolExecution(name, duration, false, {
          error: error instanceof Error ? error.message : String(error)
        });
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * Validate input parameters for tool calls
   */
  private validateInput(toolName: string, args: any, requiredFields: string[] = []): void {
    if (!args && requiredFields.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required arguments for ${toolName}`
      );
    }

    for (const field of requiredFields) {
      if (args[field] === undefined || args[field] === null) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing required field: ${field}`
        );
      }
    }
  }

  /**
   * Format tool response following MCP best practices
   */
  private formatResponse(data: any, metadata?: any): { content: Array<{ type: string; text: string }> } {
    const response = {
      ...data,
      ...(metadata && { _metadata: metadata }),
      _server_info: {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        cache_enabled: this.cache.isEnabled(),
        performance_grade: this.metrics.getPerformanceSummary().performanceGrade
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  /**
   * Enhanced pagination helper
   */
  private formatPaginatedResponse(results: any, searchParams: any, endpoint: string) {
    const hasNext = !!results.next;
    const hasPrevious = !!results.previous;
    const totalPages = results.count ? Math.ceil(results.count / (searchParams.page_size || 20)) : 1;
    const currentPage = searchParams.page || 1;

    return {
      pagination: {
        current_page: currentPage,
        total_pages: totalPages,
        total_results: results.count || 0,
        page_size: searchParams.page_size || 20,
        has_next: hasNext,
        has_previous: hasPrevious,
        next_url: results.next,
        previous_url: results.previous
      },
      search_parameters: searchParams,
      results: results.results || [],
      endpoint_info: {
        api_endpoint: endpoint,
        documentation: "https://www.courtlistener.com/api/rest/v4/",
        rate_limits: "Managed automatically with intelligent queuing"
      }
    };
  }

  /**
   * Provide helpful suggestions when a resource is not found
   */
  private getNotFoundSuggestions(resourceType: string, id: any): string {
    const suggestions: Record<string, string[]> = {
      'case': [
        'Use search_cases to find cases by name, citation, or keywords',
        'Check if the case exists with a different cluster_id',
        'The case may have been merged with another case'
      ],
      'opinion': [
        'Use search_cases to find the case first, then get_case_details for opinion IDs',
        'Check if the opinion exists under a different opinion_id',
        'Some opinions may not have full text available'
      ],
      'docket': [
        'Use get_dockets to search for dockets by number or court',
        'Check if the docket exists with a different docket_id',
        'Some older dockets may not be digitized'
      ],
      'judge': [
        'Use get_judges to search for judges by name or court',
        'Check if the judge exists with a different person_id',
        'Some judicial records may be incomplete'
      ]
    };

    const typeSuggestions = suggestions[resourceType] || [
      'Verify the ID is correct and positive',
      'Check the API documentation for valid ID ranges',
      'Try searching for the resource using other available tools'
    ];

    return `Suggestions:\n${typeSuggestions.map((s: string) => `• ${s}`).join('\n')}`;
  }

  // Tool implementation methods (using existing handlers with enhancements)

  private async handleSearchCases(args: any) {
    this.validateInput("search_cases", args);

    const searchParams: Record<string, any> = {};
    
    if (args.query) searchParams.q = args.query;
    if (args.court) searchParams.court = args.court;
    if (args.judge) searchParams.judge = args.judge;
    if (args.case_name) searchParams.case_name = args.case_name;
    if (args.citation) searchParams.citation = args.citation;
    if (args.date_filed_after) searchParams.date_filed_after = args.date_filed_after;
    if (args.date_filed_before) searchParams.date_filed_before = args.date_filed_before;
    if (args.precedential_status) searchParams.precedential_status = args.precedential_status;
    
    searchParams.page = args.page || 1;
    searchParams.page_size = Math.min(args.page_size || 20, 100);

    const searchKeys = Object.keys(searchParams).filter(k => 
      k !== 'order_by' && k !== 'page' && k !== 'page_size'
    );
    
    if (searchKeys.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "At least one search parameter is required (query, court, judge, case_name, citation, or date range)"
      );
    }

    const results = await this.courtListener.searchOpinions(searchParams);

    const formattedResults = results.results.map(cluster => {
      // Extract cluster ID from URL if not directly available
      let clusterId = cluster.id;
      if (!clusterId && cluster.absolute_url) {
        const urlMatch = cluster.absolute_url.match(/\/opinion\/(\d+)\//);
        if (urlMatch) {
          clusterId = parseInt(urlMatch[1]);
        }
      }
      
      return {
        id: clusterId,
        case_name: cluster.case_name,
        case_name_short: cluster.case_name_short,
        court: cluster.court,
        date_filed: cluster.date_filed,
        citation_count: cluster.citation_count,
        precedential_status: cluster.precedential_status,
        federal_cite_one: cluster.federal_cite_one,
        state_cite_one: cluster.state_cite_one,
        neutral_cite: cluster.neutral_cite,
        absolute_url: cluster.absolute_url,
        summary: cluster.summary,
        syllabus: cluster.syllabus
      };
    });

    const paginatedData = this.formatPaginatedResponse(
      { ...results, results: formattedResults }, 
      searchParams, 
      '/search/'
    );

    return this.formatResponse({
      search_type: "Case Search",
      ...paginatedData,
      research_tips: [
        "Use specific citations for exact case lookup",
        "Combine court + date filters for targeted research",
        "Sort by citation_count to find influential cases",
        "Use precedential_status to filter by case authority"
      ]
    });
  }

  private async handleGetCaseDetails(args: any) {
    this.validateInput("get_case_details", args, ["cluster_id"]);

    if (!Number.isInteger(args.cluster_id) || args.cluster_id <= 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid cluster_id: ${args.cluster_id}. Must be a positive integer.`
      );
    }

    try {
      const caseDetails = await this.courtListener.getOpinionCluster(args.cluster_id);

      return this.formatResponse({
        cluster_id: args.cluster_id,
        case_details: caseDetails,
        analysis_suggestions: [
          "Use get_opinion_text with opinion IDs to get full text",
          "Use get_citation_network to analyze precedent relationships",
          "Check get_related_cases for citing opinions",
          "Review case_name variations for comprehensive research"
        ]
      });
    } catch (error) {
      if (error instanceof McpError && error.message.includes('404')) {
        const suggestions = this.getNotFoundSuggestions('case', args.cluster_id);
        throw new McpError(
          ErrorCode.InvalidParams,
          `Case ID ${args.cluster_id} not found. Please verify the cluster_id is correct.\n\n${suggestions}\n\nOriginal error: ${error.message}`
        );
      }
      throw error;
    }
  }

  private async handleGetOpinionText(args: any) {
    this.validateInput("get_opinion_text", args, ["opinion_id"]);

    if (!Number.isInteger(args.opinion_id) || args.opinion_id <= 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid opinion_id: ${args.opinion_id}. Must be a positive integer.`
      );
    }

    try {
      const opinion = await this.courtListener.getOpinion(args.opinion_id);

      return this.formatResponse({
        opinion: {
          id: opinion.id,
          type: opinion.type,
          author: opinion.author_str,
          joined_by: opinion.joined_by_str,
          per_curiam: opinion.per_curiam,
          page_count: opinion.page_count,
          extracted_by_ocr: opinion.extracted_by_ocr,
          plain_text: opinion.plain_text,
          html: opinion.html_with_citations || opinion.html,
          download_url: opinion.download_url,
          absolute_url: opinion.absolute_url,
          cluster: opinion.cluster
        }
      });
    } catch (error) {
      if (error instanceof McpError && error.message.includes('404')) {
        const suggestions = this.getNotFoundSuggestions('opinion', args.opinion_id);
        throw new McpError(
          ErrorCode.InvalidParams,
          `Opinion ID ${args.opinion_id} not found. Please verify the opinion_id is correct.\n\n${suggestions}\n\nOriginal error: ${error.message}`
        );
      }
      throw error;
    }
  }

  // Add placeholder handlers for remaining tools (implement similar to above pattern)
  private async handleLookupCitation(args: any) {
    this.validateInput("lookup_citation", args, ["citation"]);
    
    const results = await this.courtListener.searchCitations(args.citation);

    // Format the results for better citation lookup experience
    const formattedResults = results.results ? results.results.map((cluster: any) => ({
      id: cluster.id,
      case_name: cluster.case_name,
      case_name_short: cluster.case_name_short,
      court: cluster.court,
      date_filed: cluster.date_filed,
      citation_count: cluster.citation_count,
      precedential_status: cluster.precedential_status,
      federal_cite_one: cluster.federal_cite_one,
      state_cite_one: cluster.state_cite_one,
      neutral_cite: cluster.neutral_cite,
      absolute_url: cluster.absolute_url
    })) : [];

    return this.formatResponse({
      citation_lookup: {
        query: args.citation,
        total_results: results.count || 0,
        results: formattedResults,
        search_suggestions: formattedResults.length === 0 ? [
          "Try using a different citation format (e.g., '410 U.S. 113' instead of full case name)",
          "Use the case name in search_cases tool for broader results",
          "Check if the citation exists in the CourtListener database",
          "Try searching by court and date range if citation is not found"
        ] : [
          "Use get_case_details with cluster_id for more information",
          "Use get_opinion_text to read the full opinion",
          "Check related cases with get_citation_network"
        ]
      }
    });
  }

  private async handleGetRelatedCases(args: any) {
    const relatedCases = await this.courtListener.getRelatedCases(args.opinion_id);
    return this.formatResponse({
      opinion_id: args.opinion_id,
      related_cases: relatedCases
    });
  }

  private async handleListCourts(args: any) {
    const courts = await this.courtListener.getCourts({
      jurisdiction: args?.jurisdiction,
      in_use: args?.in_use
    });

    const formattedCourts = courts.results.map(court => ({
      id: court.id,
      full_name: court.full_name,
      short_name: court.short_name,
      citation_string: court.citation_string,
      jurisdiction: court.jurisdiction,
      in_use: court.in_use,
      has_opinion_scraper: court.has_opinion_scraper,
      has_oral_argument_scraper: court.has_oral_argument_scraper,
      start_date: court.start_date,
      end_date: court.end_date,
      notes: court.notes,
      url: court.url
    }));

    return this.formatResponse({
      total_courts: courts.count,
      courts: formattedCourts
    });
  }

  // Add remaining handlers as needed...
  private async handleAnalyzeLegalArgument(args: any) {
    this.validateInput("analyze_legal_argument", args, ["argument", "search_query"]);
    
    const timer = this.logger.startTimer('analyze_legal_argument');
    try {
      const cacheKey = 'legal_argument_analysis';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      // Search for relevant cases using the search query
      const searchParams: Record<string, any> = {
        q: args.search_query,
        page: 1,
        page_size: 10
      };

      // Add optional filters
      if (args.jurisdiction) {
        searchParams.court = args.jurisdiction;
      }
      if (args.date_range_start) {
        searchParams.date_filed_after = args.date_range_start;
      }
      if (args.date_range_end) {
        searchParams.date_filed_before = args.date_range_end;
      }

      const searchResults = await this.courtListener.searchOpinions(searchParams);

      // Format the top cases for analysis
      const topCases = searchResults.results.slice(0, 5).map(cluster => {
        let clusterId = cluster.id;
        if (!clusterId && cluster.absolute_url) {
          const urlMatch = cluster.absolute_url.match(/\/opinion\/(\d+)\//);
          if (urlMatch) {
            clusterId = parseInt(urlMatch[1]);
          }
        }
        
        return {
          id: clusterId,
          case_name: cluster.case_name,
          court: cluster.court,
          date_filed: cluster.date_filed,
          citation_count: cluster.citation_count,
          precedential_status: cluster.precedential_status,
          relevance_score: this.calculateRelevanceScore(args.argument, cluster),
          absolute_url: cluster.absolute_url
        };
      });

      const analysis = {
        argument_summary: args.argument,
        search_strategy: args.search_query,
        total_cases_found: searchResults.count || 0,
        top_cases: topCases,
        argument_strength: this.assessArgumentStrength(topCases),
        research_suggestions: this.generateResearchSuggestions(args.argument, topCases)
      };
      
      const result = {
        analysis: analysis,
        metadata: {
          search_performed: true,
          filters_applied: Object.keys(searchParams).filter(k => k !== 'q' && k !== 'page' && k !== 'page_size'),
          timestamp: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, args, result, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private calculateRelevanceScore(argument: string, cluster: any): number {
    // Simple relevance scoring based on text matching
    const argumentWords = argument.toLowerCase().split(/\s+/);
    const caseName = (cluster.case_name || '').toLowerCase();
    const summary = (cluster.summary || '').toLowerCase();
    
    let score = 0;
    argumentWords.forEach(word => {
      if (word.length > 3) { // Only count meaningful words
        if (caseName.includes(word)) score += 2;
        if (summary.includes(word)) score += 1;
      }
    });
    
    // Boost score for high citation count (influential cases)
    if (cluster.citation_count > 100) score += 3;
    else if (cluster.citation_count > 50) score += 2;
    else if (cluster.citation_count > 10) score += 1;
    
    return Math.min(score, 10); // Cap at 10
  }

  private assessArgumentStrength(cases: any[]): string {
    const highQualityCases = cases.filter(c => c.citation_count > 50).length;
    const recentCases = cases.filter(c => {
      const year = new Date(c.date_filed).getFullYear();
      return year > 2010;
    }).length;
    
    if (highQualityCases >= 3 && recentCases >= 2) {
      return "Strong - Multiple highly-cited and recent cases support this argument";
    } else if (highQualityCases >= 2 || recentCases >= 3) {
      return "Moderate - Some supporting precedent exists";
    } else {
      return "Weak - Limited supporting precedent found";
    }
  }

  private generateResearchSuggestions(argument: string, cases: any[]): string[] {
    const suggestions = [
      "Review the full text of top-cited cases using get_opinion_text",
      "Analyze citation networks using get_citation_network for influential cases",
      "Search for more recent cases in the same jurisdiction"
    ];
    
    if (cases.length > 0) {
      suggestions.push(`Focus on ${cases[0].case_name} as it appears most relevant`);
    }
    
    if (cases.some(c => c.precedential_status === 'Published')) {
      suggestions.push("Prioritize published opinions for stronger precedential value");
    }
    
    return suggestions;
  }

  private async handleGetFinancialDisclosures(args: any) {
    const timer = this.logger.startTimer('get_financial_disclosures');
    try {
      const params = {
        judge: args.judge,
        year: args.year,
        page: args.page,
        page_size: Math.min(args.page_size || 20, 100)
      };

      const cacheKey = 'financial_disclosures';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const results = await this.courtListener.getFinancialDisclosures(params);

      const responseData = {
        search_parameters: params,
        total_disclosures: results.count || 0,
        disclosures: results.results || results,
        metadata: {
          purpose: "Judge conflict of interest analysis",
          data_source: "CourtListener Financial Disclosures API",
          cache_recommendation: "30 days (annual updates)"
        }
      };

      this.cache.set(cacheKey, params, responseData);
      this.metrics.recordRequest(timer.end(true));
      return this.formatResponse(responseData);
    } catch (error) {
      this.metrics.recordFailure(timer.endWithError(error as Error));
      throw error;
    }
  }

  private async handleGetFinancialDisclosure(args: any) {
    this.validateInput("get_financial_disclosure", args, ["disclosure_id"]);
    
    const timer = this.logger.startTimer('get_financial_disclosure');
    try {
      const cacheKey = 'financial_disclosure';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const disclosure = await this.courtListener.getFinancialDisclosure(args.disclosure_id);
      
      const result = {
        disclosure_id: args.disclosure_id,
        disclosure: disclosure
      };

      this.cache.set(cacheKey, args, result, 86400); // Cache for 24 hours
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetPartiesAndAttorneys(args: any) {
    this.validateInput("get_parties_and_attorneys", args, ["docket_id"]);
    
    const timer = this.logger.startTimer('get_parties_and_attorneys');
    try {
      const cacheKey = 'parties_and_attorneys';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const [parties, attorneys] = await Promise.all([
        this.courtListener.getParties({ docket: args.docket_id }),
        this.courtListener.getAttorneys({ docket: args.docket_id })
      ]);
      
      const result = {
        docket_id: args.docket_id,
        parties: parties,
        attorneys: attorneys
      };

      this.cache.set(cacheKey, args, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetRECAPDocuments(args: any) {
    this.validateInput("get_recap_documents", args, ["docket_id"]);
    
    const timer = this.logger.startTimer('get_recap_documents');
    try {
      const params = {
        docket: args.docket_id,
        page: args.page || 1,
        page_size: Math.min(args.page_size || 20, 100)
      };

      const cacheKey = 'recap_documents';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const documents = await this.courtListener.getRECAPDocuments(params);
      
      const result = {
        docket_id: args.docket_id,
        documents: documents,
        pagination: {
          page: params.page,
          page_size: params.page_size,
          total_results: documents.count || 0
        }
      };

      this.cache.set(cacheKey, params, result, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetRECAPDocument(args: any) {
    this.validateInput("get_recap_document", args, ["document_id"]);
    
    const timer = this.logger.startTimer('get_recap_document');
    try {
      const cacheKey = 'recap_document';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const document = await this.courtListener.getRECAPDocument(args.document_id);
      
      const result = {
        document_id: args.document_id,
        document: document
      };

      this.cache.set(cacheKey, args, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleManageAlerts(args: any) {
    this.validateInput("manage_alerts", args, ["action"]);
    
    const timer = this.logger.startTimer('manage_alerts');
    try {
      let result;
      
      switch (args.action) {
        case 'list':
          const alerts = await this.courtListener.getAlerts({
            page: args.page || 1,
            page_size: Math.min(args.page_size || 20, 100)
          });
          result = {
            action: 'list',
            alerts: alerts,
            pagination: {
              page: args.page || 1,
              page_size: args.page_size || 20
            }
          };
          break;
          
        case 'create':
          this.validateInput("manage_alerts", args, ["search_params"]);
          result = {
            action: 'create',
            status: 'Alert creation requires authentication',
            message: 'Please use the CourtListener web interface to create alerts'
          };
          break;
          
        case 'delete':
          this.validateInput("manage_alerts", args, ["alert_id"]);
          result = {
            action: 'delete',
            status: 'Alert deletion requires authentication',
            message: 'Please use the CourtListener web interface to delete alerts'
          };
          break;
          
        default:
          throw new Error(`Unknown alert action: ${args.action}`);
      }

      this.metrics.recordRequest(timer.end(true), false);
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetCitationNetwork(args: any) {
    this.validateInput("get_citation_network", args, ["opinion_id"]);
    
    const timer = this.logger.startTimer('get_citation_network');
    try {
      const params = {
        depth: args.depth || 2,
        direction: args.direction || 'both' // 'cited', 'citing', or 'both'
      };

      const cacheKey = 'citation_network';
      const cacheParams = { ...args, ...params };
      const cached = this.cache.get(cacheKey, cacheParams);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const network = await this.courtListener.getCitationNetwork(args.opinion_id, params);
      
      const result = {
        opinion_id: args.opinion_id,
        network: network,
        analysis: {
          depth: params.depth,
          direction: params.direction,
          nodes: network.nodes?.length || 0,
          edges: network.edges?.length || 0
        }
      };

      this.cache.set(cacheKey, cacheParams, result, 7200); // Cache for 2 hours
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleAnalyzeCaseAuthorities(args: any) {
    this.validateInput("analyze_case_authorities", args, ["opinion_id"]);
    
    const timer = this.logger.startTimer('analyze_case_authorities');
    try {
      const cacheKey = 'case_authorities';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const authorities = await this.courtListener.getAuthorities(args.opinion_id);
      
      // Analyze the authorities for insights
      const analysis = {
        total_authorities: authorities.length || 0,
        authority_types: this.categorizeAuthorities(authorities),
        citation_strength: this.analyzeCitationStrength(authorities),
        temporal_distribution: this.analyzeTemporalDistribution(authorities)
      };
      
      const result = {
        opinion_id: args.opinion_id,
        authorities: authorities,
        analysis: analysis
      };

      this.cache.set(cacheKey, args, result, 7200); // Cache for 2 hours
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private categorizeAuthorities(authorities: any[]): any {
    if (!authorities || !Array.isArray(authorities)) return {};
    
    const categories = {
      supreme_court: 0,
      circuit_court: 0,
      district_court: 0,
      state_court: 0,
      other: 0
    };

    authorities.forEach(auth => {
      const court = auth.court?.toLowerCase() || '';
      if (court.includes('supreme')) {
        categories.supreme_court++;
      } else if (court.includes('circuit') || court.includes('court of appeals')) {
        categories.circuit_court++;
      } else if (court.includes('district')) {
        categories.district_court++;
      } else if (court.includes('state')) {
        categories.state_court++;
      } else {
        categories.other++;
      }
    });

    return categories;
  }

  private analyzeCitationStrength(authorities: any[]): any {
    if (!authorities || !Array.isArray(authorities)) return {};
    
    return {
      heavily_cited: authorities.filter(a => (a.citation_count || 0) > 100).length,
      moderately_cited: authorities.filter(a => (a.citation_count || 0) > 10 && (a.citation_count || 0) <= 100).length,
      lightly_cited: authorities.filter(a => (a.citation_count || 0) <= 10).length
    };
  }

  private analyzeTemporalDistribution(authorities: any[]): any {
    if (!authorities || !Array.isArray(authorities)) return {};
    
    const now = new Date();
    const currentYear = now.getFullYear();
    
    return {
      recent: authorities.filter(a => {
        const year = new Date(a.date_filed || '1900').getFullYear();
        return currentYear - year <= 5;
      }).length,
      historical: authorities.filter(a => {
        const year = new Date(a.date_filed || '1900').getFullYear();
        return currentYear - year > 5 && currentYear - year <= 20;
      }).length,
      foundational: authorities.filter(a => {
        const year = new Date(a.date_filed || '1900').getFullYear();
        return currentYear - year > 20;
      }).length
    };
  }

  private async handleGetDockets(args: any) {
    const timer = this.logger.startTimer('get_dockets');
    try {
      const params = {
        docket_number: args.docket_number,
        court: args.court,
        date_created_after: args.date_created_after,
        date_created_before: args.date_created_before,
        page: args.page,
        page_size: Math.min(args.page_size || 20, 100)
      };

      const cacheKey = 'dockets';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const results = await this.courtListener.getDockets(params);

      const responseData = {
        search_parameters: params,
        total_dockets: results.count || 0,
        dockets: results.results || results,
        research_applications: [
          "Track case procedural history",
          "Monitor case progress and filings",
          "Analyze court efficiency metrics",
          "Research docket management patterns"
        ],
        metadata: {
          endpoint: "/dockets/",
          data_type: "Case procedural information and docket entries"
        }
      };

      this.cache.set(cacheKey, params, responseData);
      this.metrics.recordRequest(timer.end(true));
      return this.formatResponse(responseData);
    } catch (error) {
      this.metrics.recordFailure(timer.endWithError(error as Error));
      throw error;
    }
  }

  private async handleGetDocket(args: any) {
    this.validateInput("get_docket", args, ["docket_id"]);
    
    const timer = this.logger.startTimer('get_docket');
    try {
      const cacheKey = 'docket';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const docket = await this.courtListener.getDocket(args.docket_id);
      
      const result = {
        docket_id: args.docket_id,
        docket: docket
      };

      this.cache.set(cacheKey, args, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetJudges(args: any) {
    const timer = this.logger.startTimer('get_judges');
    try {
      const params = {
        name_first: args.name_first,
        name_last: args.name_last,
        court: args.court,
        appointer: args.appointer,
        political_affiliation: args.political_affiliation,
        page: args.page,
        page_size: Math.min(args.page_size || 20, 100)
      };

      const cacheKey = 'judges';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const results = await this.courtListener.getJudges(params);

      const responseData = {
        search_parameters: params,
        total_judges: results.count || 0,
        judges: results.results || results,
        research_applications: [
          "Judicial appointment analysis",
          "Court composition studies",
          "Judge-specific case research",
          "Judicial career tracking",
          "Political affiliation analysis"
        ],
        metadata: {
          endpoint: "/people/",
          data_type: "Judicial officers and court personnel"
        }
      };

      this.cache.set(cacheKey, params, responseData);
      this.metrics.recordRequest(timer.end(true));
      return this.formatResponse(responseData);
    } catch (error) {
      this.metrics.recordFailure(timer.endWithError(error as Error));
      throw error;
    }
  }

  private async handleGetJudge(args: any) {
    this.validateInput("get_judge", args, ["judge_id"]);
    
    const timer = this.logger.startTimer('get_judge');
    try {
      const cacheKey = 'judge';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const judge = await this.courtListener.getJudge(args.judge_id);
      
      const result = {
        judge_id: args.judge_id,
        judge: judge
      };

      this.cache.set(cacheKey, args, result, 86400); // Cache for 24 hours (judge info changes rarely)
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetOralArguments(args: any) {
    const timer = this.logger.startTimer('get_oral_arguments');
    try {
      const params: Record<string, any> = {
        docket: args.docket_id,
        case_name: args.case_name,
        court: args.court,
        date_argued_after: args.date_argued_after,
        date_argued_before: args.date_argued_before,
        page: args.page || 1,
        page_size: Math.min(args.page_size || 20, 100)
      };

      // Remove undefined parameters
      Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

      const cacheKey = 'oral_arguments';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const arguments_data = await this.courtListener.getOralArguments(params);
      
      const result = {
        search_params: params,
        oral_arguments: arguments_data,
        pagination: {
          page: params.page,
          page_size: params.page_size,
          total_results: arguments_data.count || 0
        }
      };

      this.cache.set(cacheKey, params, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetOralArgument(args: any) {
    this.validateInput("get_oral_argument", args, ["audio_id"]);
    
    const timer = this.logger.startTimer('get_oral_argument');
    try {
      const cacheKey = 'oral_argument';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const oral_argument = await this.courtListener.getOralArgument(args.audio_id);
      
      const result = {
        audio_id: args.audio_id,
        oral_argument: oral_argument
      };

      this.cache.set(cacheKey, args, result, 86400); // Cache for 24 hours
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleAdvancedSearch(args: any) {
    const timer = this.logger.startTimer('advanced_search');
    try {
      // Build search parameters, filtering out undefined values
      const searchParams: Record<string, any> = {
        type: args.type || 'o',
        page_size: Math.min(args.page_size || 20, 100)
      };
      
      // Add search parameters only if they have values
      if (args.query) searchParams.q = args.query;
      if (args.court) searchParams.court = args.court;
      if (args.judge) searchParams.judge = args.judge;
      if (args.case_name) searchParams.case_name = args.case_name;
      if (args.citation) searchParams.citation = args.citation;
      if (args.docket_number) searchParams.docket_number = args.docket_number;
      if (args.date_filed_after) searchParams.date_filed_after = args.date_filed_after;
      if (args.date_filed_before) searchParams.date_filed_before = args.date_filed_before;
      if (args.precedential_status) searchParams.precedential_status = args.precedential_status;
      if (args.cited_lt !== undefined) searchParams.cited_lt = args.cited_lt;
      if (args.cited_gt !== undefined) searchParams.cited_gt = args.cited_gt;
      if (args.status) searchParams.status = args.status;
      if (args.nature_of_suit) searchParams.nature_of_suit = args.nature_of_suit;

      // Validate that at least one search parameter is provided
      const searchKeys = Object.keys(searchParams).filter(k => 
        k !== 'type' && k !== 'order_by' && k !== 'page_size'
      );
      
      if (searchKeys.length === 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'At least one search parameter must be provided for advanced search (query, court, judge, case_name, citation, etc.)'
        );
      }

      const cacheKey = 'advanced_search';
      const cached = this.cache.get(cacheKey, searchParams);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const results = await this.courtListener.advancedSearch(searchParams);

      const searchTypeLabels = {
        'o': 'Opinions',
        'r': 'RECAP Documents', 
        'p': 'People/Judges',
        'oa': 'Oral Arguments'
      };

      const responseData = {
        search_type: searchTypeLabels[args.type as keyof typeof searchTypeLabels] || 'Opinions',
        search_parameters: searchParams,
        total_results: results.count || 0,
        results: results.results || results,
        advanced_features: {
          citation_filtering: args.cited_lt || args.cited_gt ? "Applied" : "Available",
          temporal_analysis: args.date_filed_after || args.date_filed_before ? "Applied" : "Available",
          jurisdictional_filtering: args.court ? "Applied" : "Available",
          procedural_filtering: args.status || args.nature_of_suit ? "Applied" : "Available"
        },
        research_recommendations: [
          "Use citation count filters to find influential cases",
          "Apply temporal filters for trend analysis", 
          "Combine multiple search types for comprehensive research",
          "Use specific court filters for jurisdictional analysis"
        ]
      };

      this.cache.set(cacheKey, searchParams, responseData);
      this.metrics.recordRequest(timer.end(true));
      return this.formatResponse(responseData);
    } catch (error) {
      this.metrics.recordFailure(timer.endWithError(error as Error));
      throw error;
    }
  }

  private async handleGetVisualizationData(args: any) {
    this.validateInput("get_visualization_data", args, ["data_type"]);
    
    const timer = this.logger.startTimer('get_visualization_data');
    try {
      const cacheKey = 'visualization_data';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      let result;
      
      switch (args.data_type) {
        case 'court_distribution':
          result = await this.generateCourtDistributionData(args);
          break;
          
        case 'case_timeline':
          result = await this.generateCaseTimelineData(args);
          break;
          
        case 'citation_network':
          result = await this.generateCitationNetworkData(args);
          break;
          
        case 'judge_statistics':
          result = await this.generateJudgeStatisticsData(args);
          break;
          
        default:
          throw new Error(`Unknown visualization type: ${args.data_type}`);
      }

      this.cache.set(cacheKey, args, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async generateCourtDistributionData(args: any) {
    const courts = await this.courtListener.getCourts({ in_use: true });
    
    const distribution = courts.results.reduce((acc: any, court: any) => {
      const jurisdiction = court.jurisdiction || 'Unknown';
      acc[jurisdiction] = (acc[jurisdiction] || 0) + 1;
      return acc;
    }, {});

    return {
      type: 'court_distribution',
      data: distribution,
      chart_type: 'pie',
      total_courts: courts.count
    };
  }

  private async generateCaseTimelineData(args: any) {
    // This would require aggregated case data by date
    // For now, return a sample structure
    return {
      type: 'case_timeline',
      data: {
        message: 'Timeline generation requires specific date range and case criteria',
        required_params: ['start_date', 'end_date', 'court_id']
      },
      chart_type: 'timeline'
    };
  }

  private async generateCitationNetworkData(args: any) {
    if (!args.opinion_id) {
      throw new Error('opinion_id required for citation network visualization');
    }
    
    const network = await this.courtListener.getCitationNetwork(args.opinion_id, {
      depth: args.depth || 2
    });
    
    return {
      type: 'citation_network',
      data: network,
      chart_type: 'network_graph',
      center_opinion: args.opinion_id
    };
  }

  private async generateJudgeStatisticsData(args: any) {
    const judges = await this.courtListener.getJudges({
      page_size: args.limit || 50
    });
    
    return {
      type: 'judge_statistics',
      data: {
        total_judges: judges.count,
        active_judges: judges.results.filter((j: any) => j.date_termination === null).length,
        by_court: judges.results.reduce((acc: any, judge: any) => {
          const court = judge.court || 'Unknown';
          acc[court] = (acc[court] || 0) + 1;
          return acc;
        }, {})
      },
      chart_type: 'bar'
    };
  }

  private async handleGetBulkData(args: any) {
    this.validateInput("get_bulk_data", args, ["data_type"]);
    
    const timer = this.logger.startTimer('get_bulk_data');
    try {
      const result: Record<string, any> = {
        data_type: args.data_type,
        status: 'bulk_data_available',
        message: 'Bulk data access requires special permissions and is typically handled through CourtListener\'s bulk data API',
        available_formats: ['JSON', 'CSV', 'XML'],
        recommended_approach: 'Use CourtListener\'s official bulk data downloads',
        bulk_data_url: 'https://www.courtlistener.com/help/api/bulk-data/',
        note: 'For large datasets, consider using the pagination parameters in regular API calls'
      };

      if (args.data_type === 'sample') {
        // Provide a sample of data for demonstration
        const sampleCases = await this.courtListener.searchOpinions({
          page_size: Math.min(args.sample_size || 10, 50)
        });
        
        result['sample_data'] = {
          type: 'opinion_clusters',
          count: sampleCases.results?.length || 0,
          data: sampleCases.results?.slice(0, 5) || [] // Limit sample
        };
      }

      this.metrics.recordRequest(timer.end(true), false);
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  private async handleGetBankruptcyData(args: any) {
    const timer = this.logger.startTimer('get_bankruptcy_data');
    try {
      const params: Record<string, any> = {
        court: args.court,
        case_name: args.case_name,
        docket_number: args.docket_number,
        date_filed_after: args.date_filed_after,
        date_filed_before: args.date_filed_before,
        page: args.page || 1,
        page_size: Math.min(args.page_size || 20, 100)
      };

      // Remove undefined parameters
      Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

      const cacheKey = 'bankruptcy_data';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      // Search for bankruptcy-related dockets
      const bankruptcyDockets = await this.courtListener.getDockets({
        ...params,
        court__jurisdiction: 'FB' // Federal Bankruptcy jurisdiction
      });
      
      const result = {
        search_params: params,
        bankruptcy_cases: bankruptcyDockets,
        pagination: {
          page: params.page,
          page_size: params.page_size,
          total_results: bankruptcyDockets.count || 0
        },
        data_notes: [
          'Bankruptcy data includes cases from US Bankruptcy Courts',
          'Use specific court codes for targeted searches',
          'RECAP documents may be available for detailed case information'
        ]
      };

      this.cache.set(cacheKey, params, result, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get docket entries (Enhanced)
   */
  private async handleGetDocketEntries(args: any) {
    this.validateInput("get_docket_entries", args);
    
    const timer = this.logger.startTimer('get_docket_entries');
    try {
      const params = {
        docket: args.docket,
        entry_number: args.entry_number,
        date_filed_after: args.date_filed_after,
        date_filed_before: args.date_filed_before,
        page: args.page || 1,
        page_size: Math.min(args.page_size || 20, 100)
      };

      const cacheKey = 'docket_entries';
      const cached = this.cache.get(cacheKey, params);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const entries = await this.courtListener.getDocketEntries(params);

      const result = {
        docket_id: args.docket,
        docket_entries: entries,
        pagination: {
          page: params.page,
          page_size: params.page_size,
          total_results: entries.count || 0
        }
      };

      this.cache.set(cacheKey, params, result, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get comprehensive judge profile (Enhanced)
   */
  private async handleGetComprehensiveJudgeProfile(args: any) {
    this.validateInput("get_comprehensive_judge_profile", args, ["judge_id"]);
    
    const timer = this.logger.startTimer('get_comprehensive_judge_profile');
    try {
      const cacheKey = 'comprehensive_judge_profile';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const profile = await this.courtListener.getComprehensiveJudgeProfile(args.judge_id);

      this.cache.set(cacheKey, args, profile, 86400); // Cache for 24 hours
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(profile);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get comprehensive case analysis (Enhanced)
   */
  private async handleGetComprehensiveCaseAnalysis(args: any) {
    this.validateInput("get_comprehensive_case_analysis", args, ["cluster_id"]);
    
    const timer = this.logger.startTimer('get_comprehensive_case_analysis');
    try {
      const cacheKey = 'comprehensive_case_analysis';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const analysis = await this.courtListener.getComprehensiveCaseAnalysis(args.cluster_id);

      this.cache.set(cacheKey, args, analysis, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(analysis);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get financial disclosure details (Enhanced)
   */
  private async handleGetFinancialDisclosureDetails(args: any) {
    this.validateInput("get_financial_disclosure_details", args, ["disclosure_type"]);
    
    const timer = this.logger.startTimer('get_financial_disclosure_details');
    try {
      const { disclosure_type, ...params } = args;
      
      const cacheKey = 'financial_disclosure_details';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      let result;
      switch (disclosure_type) {
        case 'investments':
          result = await this.courtListener.getFinancialInvestments(params);
          break;
        case 'debts':
          result = await this.courtListener.getFinancialDebts(params);
          break;
        case 'gifts':
          result = await this.courtListener.getFinancialGifts(params);
          break;
        case 'agreements':
          result = await this.courtListener.getFinancialAgreements(params);
          break;
        case 'positions':
          result = await this.courtListener.getDisclosurePositions(params);
          break;
        case 'reimbursements':
          result = await this.courtListener.getReimbursements(params);
          break;
        case 'spouse_incomes':
          result = await this.courtListener.getSpouseIncomes(params);
          break;
        case 'non_investment_incomes':
          result = await this.courtListener.getNonInvestmentIncomes(params);
          break;
        default:
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unknown disclosure type: ${disclosure_type}`
          );
      }

      this.cache.set(cacheKey, args, result, 3600); // Cache for 1 hour
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Validate citations (Enhanced)
   */
  private async handleValidateCitations(args: any) {
    this.validateInput("validate_citations", args, ["text"]);
    
    const timer = this.logger.startTimer('validate_citations');
    try {
      const cacheKey = 'validate_citations';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      const validation = await this.courtListener.validateCitations(args.text);

      this.cache.set(cacheKey, args, validation, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(validation);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get enhanced RECAP data (Enhanced)
   */
  private async handleGetEnhancedRECAPData(args: any) {
    this.validateInput("get_enhanced_recap_data", args, ["action"]);
    
    const timer = this.logger.startTimer('get_enhanced_recap_data');
    try {
      const { action, ...params } = args;
      
      const cacheKey = 'enhanced_recap_data';
      const cached = this.cache.get(cacheKey, args);
      if (cached) {
        this.metrics.recordRequest(timer.end(true), true);
        return this.formatResponse(cached);
      }

      let result;
      switch (action) {
        case 'fetch':
          result = await this.courtListener.getRECAPFetch(params);
          break;
        case 'query':
          result = await this.courtListener.getRECAPQuery(params);
          break;
        case 'email':
          result = await this.courtListener.getRECAPEmail(params);
          break;
        default:
          throw new McpError(
            ErrorCode.InvalidParams,
            `Unknown RECAP action: ${action}`
          );
      }

      this.cache.set(cacheKey, args, result, 1800); // Cache for 30 minutes
      this.metrics.recordRequest(timer.end(true), false);
      
      return this.formatResponse(result);
    } catch (error) {
      this.metrics.recordRequest(timer.endWithError(error as Error), false);
      throw error;
    }
  }

  /**
   * Get server health and metrics
   */
  public getHealth() {
    return {
      ...this.metrics.getHealth(),
      cache_stats: this.cache.getStats(),
      config: {
        cache_enabled: this.cache.isEnabled(),
        log_level: this.config.logging.level
      }
    };
  }

  /**
   * Start the server
   */
  async run() {
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
    this.logger.info('Legal MCP Server started', {
      version: '1.0.0',
      transport: 'stdio',
      tools_count: getEnhancedToolDefinitions().length,
      cache_enabled: this.cache.isEnabled(),
      metrics_enabled: this.config.metrics.enabled,
      health_server_port: this.config.metrics.port
    });

    console.error("Legal MCP Server v1.0.0 - Best Practice Implementation");
    console.error("Enhanced with caching, logging, metrics, and error handling");
    if (this.healthServer) {
      console.error(`Health server running on http://localhost:${this.config.metrics.port}`);
    }
    console.error("Repository: https://github.com/blakeox/courtlistener-mcp");
    console.error("MCP Docs: https://modelcontextprotocol.io/");
  }

  /**
   * Public method to list available tools
   * @returns {Promise<Object>} List of available tools
   */
  async listTools(): Promise<{ tools: Tool[] }> {
    const timer = this.logger.startTimer('list_tools');
    
    try {
      const enhancedTools = getEnhancedToolDefinitions();
      
      // Convert enhanced tools to MCP tool format
      const tools: Tool[] = enhancedTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      const duration = timer.end();
      this.metrics.recordRequest(duration, false);
      
      return { tools };
    } catch (error) {
      timer.endWithError(error as Error);
      throw error;
    }
  }

  /**
   * Public method for testing - handles a tool call directly
   * @param {Object} request - Tool call request with name and arguments
   * @returns {Promise<Object>} Tool call result
   */
  async handleToolCall(request: { name: string; arguments: any }): Promise<any> {
    const { name, arguments: args } = request;
    const timer = this.logger.startTimer(`tool_${name}`);
    
    try {
      this.logger.info('Tool execution started', {
        toolName: name,
        arguments: args
      });

      let result;
      
      // Route to appropriate handler (same as main handler for consistency)
      switch (name) {
        case 'search_cases':
          result = await this.handleSearchCases(args);
          break;
        case 'get_case_details':
          result = await this.handleGetCaseDetails(args);
          break;
        case 'get_opinion_text':
          result = await this.handleGetOpinionText(args);
          break;
        case 'lookup_citation':
          result = await this.handleLookupCitation(args);
          break;
        case 'get_related_cases':
          result = await this.handleGetRelatedCases(args);
          break;
        case 'list_courts':
          result = await this.handleListCourts(args);
          break;
        case 'analyze_legal_argument':
          result = await this.handleAnalyzeLegalArgument(args);
          break;
        case 'get_financial_disclosures':
          result = await this.handleGetFinancialDisclosures(args);
          break;
        case 'get_financial_disclosure':
          result = await this.handleGetFinancialDisclosure(args);
          break;
        case 'get_parties_and_attorneys':
          result = await this.handleGetPartiesAndAttorneys(args);
          break;
        case 'get_recap_documents':
          result = await this.handleGetRECAPDocuments(args);
          break;
        case 'get_recap_document':
          result = await this.handleGetRECAPDocument(args);
          break;
        case 'manage_alerts':
          result = await this.handleManageAlerts(args);
          break;
        case 'get_citation_network':
          result = await this.handleGetCitationNetwork(args);
          break;
        case 'analyze_case_authorities':
          result = await this.handleAnalyzeCaseAuthorities(args);
          break;
        case 'get_dockets':
          result = await this.handleGetDockets(args);
          break;
        case 'get_docket':
          result = await this.handleGetDocket(args);
          break;
        case 'get_judges':
          result = await this.handleGetJudges(args);
          break;
        case 'get_judge':
          result = await this.handleGetJudge(args);
          break;
        case 'get_oral_arguments':
          result = await this.handleGetOralArguments(args);
          break;
        case 'get_oral_argument':
          result = await this.handleGetOralArgument(args);
          break;
        case 'advanced_search':
          result = await this.handleAdvancedSearch(args);
          break;
        case 'get_visualization_data':
          result = await this.handleGetVisualizationData(args);
          break;
        case 'get_bulk_data':
          result = await this.handleGetBulkData(args);
          break;
        case 'get_bankruptcy_data':
          result = await this.handleGetBankruptcyData(args);
          break;
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }

      // Update metrics
      const duration = timer.end();
      this.metrics.recordRequest(duration, false);
      
      this.logger.info('Tool execution completed', {
        toolName: name,
        duration: duration,
        success: true
      });

      return result;
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
  }

  /**
   * Cleanup method to properly dispose of resources
   */
  destroy(): void {
    // Cleanup cache intervals to prevent hanging processes
    if (this.cache && typeof this.cache.destroy === 'function') {
      this.cache.destroy();
    }

    // Stop health server if running
    if (this.healthServer && typeof this.healthServer.stop === 'function') {
      this.healthServer.stop().catch(() => {
        // Ignore errors during cleanup
      });
    }

    this.logger.info('LegalMCPServer cleanup completed');
  }
}

// Main execution
async function main() {
  const server = new LegalMCPServer();
  await server.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Failed to start Legal MCP Server:", error);
    process.exit(1);
  });
}
