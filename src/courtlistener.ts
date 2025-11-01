/**
 * Enhanced CourtListener API client with rate limiting, caching, and error handling
 */

import fetch from 'node-fetch';
import {
  CourtListenerConfig,
  CourtListenerResponse,
  OpinionCluster,
  Opinion,
  Court,
  Judge,
  Docket,
  SearchParams,
  AdvancedSearchParams,
} from './types.js';
import { CacheManager } from './infrastructure/cache.js';
import { Logger } from './infrastructure/logger.js';
import { MetricsCollector } from './infrastructure/metrics.js';

export class CourtListenerAPI {
  private rateLimitQueue: Array<() => void> = [];
  private isProcessingQueue = false;
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(
    private config: CourtListenerConfig,
    private cache: CacheManager,
    private logger: Logger,
    private metrics: MetricsCollector,
  ) {
    this.logger.info('CourtListener API client initialized', {
      baseUrl: this.config.baseUrl,
      rateLimitPerMinute: this.config.rateLimitPerMinute,
    });
  }

  /**
   * Enhanced request method with caching, rate limiting, and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    params?: Record<string, any>,
    options: { useCache?: boolean; cacheTtlOverride?: number } = {},
  ): Promise<T> {
    const timer = this.logger.startTimer(`API ${endpoint}`);
    const { useCache = true, cacheTtlOverride } = options;

    try {
      // Check cache first
      if (useCache && this.cache.isEnabled()) {
        const cached = this.cache.get<T>(endpoint, params);
        if (cached !== null) {
          this.metrics.recordRequest(timer.end(), true);
          return cached;
        }
      }

      // Build URL with parameters
      const url = this.buildUrl(endpoint, params);

      // Rate limit the request
      await this.rateLimit();

      // Make the request
      const response = await this.executeRequest(url);

      // Handle HTTP errors first (before consuming body)
      if (!response.ok) {
        const errorText = await response.text();
        throw this.createApiError(response, endpoint, errorText);
      }

      const data = (await response.json()) as T;

      // Cache successful responses
      if (useCache && this.cache.isEnabled() && response.ok && params) {
        this.cache.set(endpoint, params, data);
      }

      const duration = timer.end();
      this.metrics.recordRequest(duration, false);

      this.logger.apiCall('GET', endpoint, duration, response.status, {
        params,
        cached: false,
      });

      return data;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      this.metrics.recordFailure(duration);

      if (error instanceof Error) {
        this.logger.error(`API request failed: ${endpoint}`, error, { params });
      }

      throw error;
    }
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, unknown>): string {
    const baseUrl = `${this.config.baseUrl}${endpoint}`;

    if (!params || Object.keys(params).length === 0) {
      return baseUrl;
    }

    // Filter out undefined, null, and empty string values
    const cleanParams = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .reduce<Record<string, string>>(
        (obj, [key, value]) => ({ ...obj, [key]: String(value) }),
        {},
      );

    const searchParams = new URLSearchParams();
    Object.entries(cleanParams).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });

    return `${baseUrl}?${searchParams.toString()}`;
  }

  /**
   * Execute HTTP request with timeout and retry logic
   */
  private async executeRequest(url: string): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Legal-MCP-Server/1.0',
            Accept: 'application/json',
          },
        });

        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Request attempt ${attempt} failed`, {
          url,
          error: lastError.message,
          attempt,
          maxAttempts: this.config.retryAttempts,
        });

        // Don't retry on final attempt
        if (attempt === this.config.retryAttempts) break;

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Request failed after all retry attempts');
  }

  /**
   * Create structured API error
   */
  private createApiError(response: any, endpoint: string, body: string): Error {
    const suggestions: Record<number, string[]> = {
      400: [
        'Check that all parameters are valid and properly formatted',
        'Remove any unsupported order_by parameters',
        'Verify date formats are YYYY-MM-DD',
      ],
      401: [
        'Check if API authentication is required for this endpoint',
        'Verify API credentials if using authenticated endpoints',
      ],
      403: [
        'This endpoint may require special permissions',
        'Check if the requested resource is restricted',
      ],
      404: [
        'Verify the resource ID exists',
        'Use search tools to find valid IDs',
        'Check if the resource has been merged or removed',
      ],
      429: ['Reduce request frequency', 'Implement request queuing', 'Consider caching responses'],
      500: [
        'This is a server error - try again later',
        'Check CourtListener status page for known issues',
      ],
    };

    const statusSuggestions = suggestions[response.status] || [
      'Check the CourtListener API documentation',
      'Verify your request parameters',
    ];

    const message =
      `CourtListener API error: ${response.status} ${response.statusText}\n` +
      `Endpoint: ${endpoint}\n` +
      `Suggestions:\n${statusSuggestions.map((s: string) => `• ${s}`).join('\n')}\n` +
      `Response: ${body}`;

    const error = new Error(message);
    (error as any).status = response.status;
    (error as any).endpoint = endpoint;
    return error;
  }

  /**
   * Rate limiting implementation
   */
  private async rateLimit(): Promise<void> {
    return new Promise((resolve) => {
      this.rateLimitQueue.push(resolve);
      this.processQueue();
    });
  }

  /**
   * Process rate limit queue
   */
  private processQueue(): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const processNext = () => {
      const now = Date.now();

      // Reset window if needed
      if (now - this.windowStart >= 60000) {
        this.requestCount = 0;
        this.windowStart = now;
      }

      if (this.rateLimitQueue.length === 0) {
        this.isProcessingQueue = false;
        return;
      }

      if (this.requestCount < this.config.rateLimitPerMinute) {
        const resolve = this.rateLimitQueue.shift()!;
        this.requestCount++;
        resolve();

        // Process next immediately if under limit
        setImmediate(processNext);
      } else {
        // Wait until next window
        const waitTime = 60000 - (now - this.windowStart);
        setTimeout(processNext, waitTime);
      }
    };

    processNext();
  }

  // API Methods
  async searchOpinions(params: SearchParams): Promise<CourtListenerResponse<OpinionCluster>> {
    return this.makeRequest<CourtListenerResponse<OpinionCluster>>('/search/', params);
  }

  async getOpinionCluster(clusterId: number): Promise<OpinionCluster> {
    return this.makeRequest<OpinionCluster>(`/clusters/${clusterId}/`);
  }

  async getOpinion(opinionId: number): Promise<Opinion> {
    return this.makeRequest<Opinion>(`/opinions/${opinionId}/`);
  }

  async getCourts(params?: any): Promise<CourtListenerResponse<Court>> {
    return this.makeRequest<CourtListenerResponse<Court>>('/courts/', params);
  }

  async getJudges(params?: any): Promise<CourtListenerResponse<Judge>> {
    return this.makeRequest<CourtListenerResponse<Judge>>('/people/', params);
  }

  async getJudge(judgeId: number): Promise<Judge> {
    return this.makeRequest<Judge>(`/people/${judgeId}/`);
  }

  async getDockets(params?: any): Promise<CourtListenerResponse<Docket>> {
    return this.makeRequest<CourtListenerResponse<Docket>>('/dockets/', params);
  }

  async getDocket(docketId: number): Promise<Docket> {
    return this.makeRequest<Docket>(`/dockets/${docketId}/`);
  }

  async advancedSearch(params: AdvancedSearchParams): Promise<CourtListenerResponse<any>> {
    return this.makeRequest<CourtListenerResponse<any>>('/search/', params);
  }

  // Utility methods for backward compatibility
  async searchCitations(citation: string): Promise<any> {
    return this.searchOpinions({ citation });
  }

  async getRelatedCases(opinionId: number): Promise<any> {
    return this.makeRequest(`/opinions/${opinionId}/cited-by/`);
  }

  async getCitationNetwork(opinionId: number, params: any): Promise<any> {
    return this.makeRequest(`/opinions/${opinionId}/citations/`, params);
  }

  async getOpinionCitations(opinionId: number): Promise<any> {
    return this.makeRequest(`/opinions/${opinionId}/citations/`);
  }

  async getAuthorities(opinionId: number): Promise<any> {
    return this.makeRequest(`/opinions/${opinionId}/authorities/`);
  }

  async getFinancialDisclosures(params: any): Promise<any> {
    return this.makeRequest('/financial-disclosures/', params);
  }

  async getFinancialDisclosure(disclosureId: number): Promise<any> {
    return this.makeRequest(`/financial-disclosures/${disclosureId}/`);
  }

  async getParties(params: any): Promise<any> {
    return this.makeRequest('/parties/', params);
  }

  async getAttorneys(params: any): Promise<any> {
    return this.makeRequest('/attorneys/', params);
  }

  async getRECAPDocuments(params: any): Promise<any> {
    return this.makeRequest('/recap/', params);
  }

  async getRECAPDocument(documentId: number): Promise<any> {
    return this.makeRequest(`/recap/${documentId}/`);
  }

  async createAlert(params: any): Promise<any> {
    // Note: This would typically be a POST request
    return this.makeRequest('/alerts/', params, { useCache: false });
  }

  async getAlerts(params: any): Promise<any> {
    return this.makeRequest('/alerts/', params);
  }

  async getOralArguments(params: any): Promise<any> {
    return this.makeRequest('/audio/', params);
  }

  async getOralArgument(audioId: number): Promise<any> {
    return this.makeRequest(`/audio/${audioId}/`);
  }

  // Additional methods to support enterprise server functionality

  // Search cases (alias for searchOpinions)
  async searchCases(params: any): Promise<any> {
    return this.searchOpinions(params);
  }

  // Get case details (alias for getOpinionCluster)
  async getCaseDetails(args: any): Promise<any> {
    if (args.clusterId) {
      return this.getOpinionCluster(args.clusterId);
    }
    if (args.id) {
      return this.getOpinionCluster(args.id);
    }
    throw new Error('clusterId or id required for getCaseDetails');
  }

  // Get opinion text
  async getOpinionText(args: any): Promise<any> {
    if (args.opinionId) {
      return this.getOpinion(args.opinionId);
    }
    if (args.id) {
      return this.getOpinion(args.id);
    }
    throw new Error('opinionId or id required for getOpinionText');
  }

  // Lookup citation using citation-lookup endpoint
  async lookupCitation(args: any): Promise<any> {
    return this.makeRequest('/citation-lookup/', args);
  }

  // List courts (alias for getCourts)
  async listCourts(args: any): Promise<any> {
    return this.getCourts(args);
  }

  // Analyze legal argument - placeholder method
  async analyzeLegalArgument(args: any): Promise<any> {
    // This would require custom implementation or external service
    return {
      analysis: 'Legal argument analysis not yet implemented',
      arguments: args,
    };
  }

  // Get parties and attorneys combined
  async getPartiesAndAttorneys(args: any): Promise<any> {
    const [parties, attorneys] = await Promise.all([
      this.getParties(args),
      this.getAttorneys(args),
    ]);
    return { parties, attorneys };
  }

  // Manage alerts (using alerts endpoint)
  async manageAlerts(args: any): Promise<any> {
    if (args.action === 'create') {
      return this.createAlert(args);
    }
    return this.getAlerts(args);
  }

  // Analyze case authorities - using opinions-cited endpoint
  async analyzeCaseAuthorities(args: any): Promise<any> {
    return this.makeRequest('/opinions-cited/', args);
  }

  // Get visualization data
  async getVisualizationData(args: any): Promise<any> {
    return this.makeRequest('/visualizations/json/', args);
  }

  // Get bulk data - placeholder for bulk operations
  async getBulkData(args: any): Promise<any> {
    // This would typically require special bulk API endpoints
    return {
      message: 'Bulk data operations not yet implemented',
      args,
    };
  }

  // Get bankruptcy data - using fjc-integrated-database for bankruptcy info
  async getBankruptcyData(args: any): Promise<any> {
    return this.makeRequest('/fjc-integrated-database/', args);
  }

  // Enhanced REST API Methods for missing endpoints

  // Docket entries - individual court filings and orders
  async getDocketEntries(params: any): Promise<any> {
    return this.makeRequest('/docket-entries/', params);
  }

  async getDocketEntry(entryId: number): Promise<any> {
    return this.makeRequest(`/docket-entries/${entryId}/`);
  }

  // Judicial positions and appointments
  async getJudicialPositions(params: any): Promise<any> {
    return this.makeRequest('/positions/', params);
  }

  async getJudicialPosition(positionId: number): Promise<any> {
    return this.makeRequest(`/positions/${positionId}/`);
  }

  // Judge education history
  async getJudgeEducations(params: any): Promise<any> {
    return this.makeRequest('/educations/', params);
  }

  // Judge political affiliations
  async getJudgePoliticalAffiliations(params: any): Promise<any> {
    return this.makeRequest('/political-affiliations/', params);
  }

  // ABA ratings for judges
  async getABARatings(params: any): Promise<any> {
    return this.makeRequest('/aba-ratings/', params);
  }

  // Judicial retention events
  async getRetentionEvents(params: any): Promise<any> {
    return this.makeRequest('/retention-events/', params);
  }

  // Educational institutions
  async getSchools(params: any): Promise<any> {
    return this.makeRequest('/schools/', params);
  }

  // Enhanced financial disclosure endpoints
  async getFinancialAgreements(params: any): Promise<any> {
    return this.makeRequest('/agreements/', params);
  }

  async getFinancialDebts(params: any): Promise<any> {
    return this.makeRequest('/debts/', params);
  }

  async getFinancialGifts(params: any): Promise<any> {
    return this.makeRequest('/gifts/', params);
  }

  async getFinancialInvestments(params: any): Promise<any> {
    return this.makeRequest('/investments/', params);
  }

  async getNonInvestmentIncomes(params: any): Promise<any> {
    return this.makeRequest('/non-investment-incomes/', params);
  }

  async getDisclosurePositions(params: any): Promise<any> {
    return this.makeRequest('/disclosure-positions/', params);
  }

  async getReimbursements(params: any): Promise<any> {
    return this.makeRequest('/reimbursements/', params);
  }

  async getSpouseIncomes(params: any): Promise<any> {
    return this.makeRequest('/spouse-incomes/', params);
  }

  // Enhanced RECAP functionality
  async getRECAPFetch(params: any): Promise<any> {
    return this.makeRequest('/recap-fetch/', params);
  }

  async getRECAPQuery(params: any): Promise<any> {
    return this.makeRequest('/recap-query/', params);
  }

  async getRECAPEmail(params: any): Promise<any> {
    return this.makeRequest('/recap-email/', params);
  }

  // Originating court information for appeals
  async getOriginatingCourtInfo(params: any): Promise<any> {
    return this.makeRequest('/originating-court-information/', params);
  }

  // Tagging system
  async getTags(params: any): Promise<any> {
    return this.makeRequest('/tags/', params);
  }

  async getDocketTags(params: any): Promise<any> {
    return this.makeRequest('/docket-tags/', params);
  }

  // Docket-specific alerts
  async getDocketAlerts(params: any): Promise<any> {
    return this.makeRequest('/docket-alerts/', params);
  }

  async createDocketAlert(params: any): Promise<any> {
    return this.makeRequest('/docket-alerts/', params, { useCache: false });
  }

  // Professional memberships
  async getMemberships(params: any): Promise<any> {
    return this.makeRequest('/memberships/', params);
  }

  // Citation parsing and validation
  async validateCitations(text: string): Promise<any> {
    return this.makeRequest('/citation-lookup/', { text });
  }

  // Enhanced visualization endpoints
  async getVisualizationMetadata(params: any): Promise<any> {
    return this.makeRequest('/visualizations/', params);
  }

  // Comprehensive judge research combining multiple endpoints
  async getComprehensiveJudgeProfile(judgeId: number): Promise<any> {
    const [
      judge,
      positions,
      educations,
      politicalAffiliations,
      abaRatings,
      retentionEvents,
      financialDisclosures,
    ] = await Promise.all([
      this.getJudge(judgeId),
      this.getJudicialPositions({ person: judgeId }),
      this.getJudgeEducations({ person: judgeId }),
      this.getJudgePoliticalAffiliations({ person: judgeId }),
      this.getABARatings({ person: judgeId }),
      this.getRetentionEvents({ person: judgeId }),
      this.getFinancialDisclosures({ person: judgeId }),
    ]);

    return {
      judge,
      positions: positions.results || [],
      educations: educations.results || [],
      politicalAffiliations: politicalAffiliations.results || [],
      abaRatings: abaRatings.results || [],
      retentionEvents: retentionEvents.results || [],
      financialDisclosures: financialDisclosures.results || [],
    };
  }

  // Enhanced case analysis with all related data
  async getComprehensiveCaseAnalysis(clusterId: number): Promise<any> {
    const [cluster, docket, docketEntries, parties, attorneys, tags] = await Promise.all([
      this.getOpinionCluster(clusterId),
      this.getDocket(clusterId).catch(() => null),
      this.getDocketEntries({ docket: clusterId }).catch(() => ({ results: [] })),
      this.getParties({ docket: clusterId }).catch(() => ({ results: [] })),
      this.getAttorneys({ docket: clusterId }).catch(() => ({ results: [] })),
      this.getDocketTags({ docket: clusterId }).catch(() => ({ results: [] })),
    ]);

    return {
      cluster,
      docket,
      docketEntries: docketEntries.results || [],
      parties: parties.results || [],
      attorneys: attorneys.results || [],
      tags: tags.results || [],
    };
  }
}
