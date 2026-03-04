/**
 * Enhanced CourtListener API client with rate limiting, caching, and error handling
 */

import fetch, { Response } from 'node-fetch';
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

type EndpointCacheClass =
  | 'default'
  | 'search'
  | 'detail'
  | 'staticReference'
  | 'financial'
  | 'recap';

export class CourtListenerAPI {
  private readonly maxRateLimitQueueSize = 1000;
  private rateLimitQueue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private isProcessingQueue = false;
  private availableTokens: number;
  private lastRefillTime = Date.now();
  private refillTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cacheTtlByClass: Record<EndpointCacheClass, number>;

  constructor(
    private config: CourtListenerConfig,
    private cache: CacheManager,
    private logger: Logger,
    private metrics: MetricsCollector,
  ) {
    this.availableTokens = this.config.rateLimitPerMinute;
    this.cacheTtlByClass = this.buildCacheTtlPolicy();
    this.logger.info('CourtListener API client initialized', {
      baseUrl: this.config.baseUrl,
      rateLimitPerMinute: this.config.rateLimitPerMinute,
      cacheTtlPolicy: this.cacheTtlByClass,
    });
  }

  /**
   * Enhanced request method with caching, rate limiting, and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    params?: object,
    options: { useCache?: boolean; cacheTtlOverride?: number } = {},
  ): Promise<T> {
    const timer = this.logger.startTimer(`API ${endpoint}`);
    const { useCache = true, cacheTtlOverride } = options;
    const operation = `courtlistener.${this.endpointToOperation(endpoint)}`;

    try {
      // Check cache first
      if (useCache && this.cache.isEnabled()) {
        const cached = this.cache.get<T>(endpoint, params);
        if (cached !== null) {
          this.metrics.recordRequest(timer.end(), true, operation);
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
        this.cache.set(endpoint, params, data, this.resolveCacheTtl(endpoint, cacheTtlOverride));
      }

      const duration = timer.end();
      this.metrics.recordRequest(duration, false, operation);

      this.logger.apiCall('GET', endpoint, duration, response.status, {
        cached: false,
        ...this.createParamLogMetadata(params),
      });

      return data;
    } catch (error) {
      const duration = timer.endWithError(error as Error);
      this.metrics.recordFailure(duration, operation);

      if (error instanceof Error) {
        this.logger.error(`API request failed: ${endpoint}`, error, this.createParamLogMetadata(params));
      }

      throw error;
    }
  }

  private endpointToOperation(endpoint: string): string {
    const normalized = endpoint.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
    return normalized || 'root';
  }

  private buildCacheTtlPolicy(): Record<EndpointCacheClass, number> {
    const baseTtl = Number.parseInt(process.env.CACHE_TTL || '300', 10);
    const defaultTtl = Number.isFinite(baseTtl) && baseTtl >= 0 ? baseTtl : 300;

    const defaults: Record<EndpointCacheClass, number> = {
      default: defaultTtl,
      search: defaultTtl,
      detail: Math.max(defaultTtl, 600),
      staticReference: Math.max(defaultTtl, 1800),
      financial: Math.max(defaultTtl, 900),
      recap: Math.max(defaultTtl, 600),
    };

    return this.applyCacheTtlOverrides(defaults, process.env.CACHE_TTL_CLASS_OVERRIDES);
  }

  private applyCacheTtlOverrides(
    defaults: Record<EndpointCacheClass, number>,
    overrides: string | undefined,
  ): Record<EndpointCacheClass, number> {
    if (!overrides) return defaults;

    const applied = { ...defaults };
    const validClasses = new Set<EndpointCacheClass>([
      'default',
      'search',
      'detail',
      'staticReference',
      'financial',
      'recap',
    ]);

    for (const rawEntry of overrides.split(',')) {
      const [rawClass, rawTtl] = rawEntry.split(':').map((part) => part.trim());
      if (!rawClass || !rawTtl || !validClasses.has(rawClass as EndpointCacheClass)) {
        continue;
      }
      const ttl = Number.parseInt(rawTtl, 10);
      if (Number.isFinite(ttl) && ttl >= 0) {
        applied[rawClass as EndpointCacheClass] = ttl;
      }
    }

    return applied;
  }

  private resolveCacheClass(endpoint: string): EndpointCacheClass {
    if (/^\/search\/?$/.test(endpoint)) return 'search';
    if (/^\/(courts|citation-lookup|schools|tags|docket-tags)\/?$/.test(endpoint)) {
      return 'staticReference';
    }
    if (
      /^\/(clusters|opinions|people|dockets|docket-entries|audio|positions|alerts|docket-alerts)\/\d+\/?$/.test(
        endpoint,
      )
    ) {
      return 'detail';
    }
    if (
      /^\/(financial-disclosures|agreements|debts|gifts|investments|non-investment-incomes|disclosure-positions|reimbursements|spouse-incomes)\/?$/.test(
        endpoint,
      )
    ) {
      return 'financial';
    }
    if (/^\/(recap|recap-fetch|recap-query|recap-email)\/?$/.test(endpoint)) {
      return 'recap';
    }
    return 'default';
  }

  private resolveCacheTtl(endpoint: string, cacheTtlOverride?: number): number {
    if (typeof cacheTtlOverride === 'number' && cacheTtlOverride >= 0) {
      return cacheTtlOverride;
    }
    return this.cacheTtlByClass[this.resolveCacheClass(endpoint)] ?? this.cacheTtlByClass.default;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: object): string {
    const baseUrl = `${this.config.baseUrl}${endpoint}`;

    if (!params || Object.keys(params).length === 0) {
      return baseUrl;
    }

    // Filter out undefined, null, and empty string values while building query params
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      searchParams.append(key, String(value));
    }

    return `${baseUrl}?${searchParams.toString()}`;
  }

  /**
   * Execute HTTP request with timeout and retry logic
   */
  private async executeRequest(url: string): Promise<Response> {
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
          ...this.createUrlLogMetadata(url),
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

  private createParamLogMetadata(params?: object): Record<string, unknown> {
    if (!params || Object.keys(params).length === 0) {
      return { paramCount: 0 };
    }

    const keys = Object.keys(params);
    return {
      paramCount: keys.length,
      paramKeys: keys.slice(0, 10),
      ...(keys.length > 10 && { truncatedParamKeys: keys.length - 10 }),
    };
  }

  private createUrlLogMetadata(url: string): Record<string, unknown> {
    try {
      const parsedUrl = new URL(url);
      return {
        path: parsedUrl.pathname,
        queryParamCount: Array.from(parsedUrl.searchParams.keys()).length,
      };
    } catch {
      return {
        urlPreview: `${url.slice(0, 120)}${url.length > 120 ? '…' : ''}`,
        urlLength: url.length,
      };
    }
  }

  /**
   * Create structured API error
   */
  private createApiError(response: Response, endpoint: string, body: string): Error {
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
    // Extend error with additional properties
    Object.assign(error, { status: response.status, endpoint });
    return error;
  }

  /**
   * Rate limiting implementation
   */
  private async rateLimit(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.rateLimitQueue.length >= this.maxRateLimitQueueSize) {
        const error = new Error(
          `Rate limit queue overloaded: ${this.rateLimitQueue.length}/${this.maxRateLimitQueueSize}`
        );
        this.logger.warn('Rate limit queue capacity exceeded', {
          queueLength: this.rateLimitQueue.length,
          maxQueueLength: this.maxRateLimitQueueSize,
          rateLimitPerMinute: this.config.rateLimitPerMinute,
        });
        reject(error);
        return;
      }

      this.rateLimitQueue.push({ resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process rate limit queue using token-bucket scheduling
   */
  private processQueue(): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    const ratePerMillisecond = this.config.rateLimitPerMinute / 60000;
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;

    if (elapsed > 0) {
      this.availableTokens = Math.min(
        this.config.rateLimitPerMinute,
        this.availableTokens + elapsed * ratePerMillisecond,
      );
      this.lastRefillTime = now;
    }

    while (this.rateLimitQueue.length > 0 && this.availableTokens >= 1) {
      this.availableTokens -= 1;
      const queuedRequest = this.rateLimitQueue.shift();
      if (queuedRequest) {
        queuedRequest.resolve();
      }
    }

    if (this.rateLimitQueue.length > 0 && this.refillTimer === null) {
      const millisecondsUntilNextToken = Math.ceil((1 - this.availableTokens) / ratePerMillisecond);
      this.refillTimer = setTimeout(() => {
        this.refillTimer = null;
        this.processQueue();
      }, Math.max(1, millisecondsUntilNextToken));
    }

    this.isProcessingQueue = false;
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

  async getCourts(params?: Record<string, unknown>): Promise<CourtListenerResponse<Court>> {
    return this.makeRequest<CourtListenerResponse<Court>>('/courts/', params);
  }

  async getJudges(params?: Record<string, unknown>): Promise<CourtListenerResponse<Judge>> {
    return this.makeRequest<CourtListenerResponse<Judge>>('/people/', params);
  }

  async getJudge(judgeId: number): Promise<Judge> {
    return this.makeRequest<Judge>(`/people/${judgeId}/`);
  }

  async getDockets(params?: Record<string, unknown>): Promise<CourtListenerResponse<Docket>> {
    return this.makeRequest<CourtListenerResponse<Docket>>('/dockets/', params);
  }

  async getDocket(docketId: number): Promise<Docket> {
    return this.makeRequest<Docket>(`/dockets/${docketId}/`);
  }

  async advancedSearch(params: AdvancedSearchParams): Promise<CourtListenerResponse<unknown>> {
    return this.makeRequest<CourtListenerResponse<unknown>>('/search/', params);
  }

  // Utility methods for backward compatibility
  async searchCitations(citation: string): Promise<unknown> {
    return this.searchOpinions({ citation });
  }

  async getRelatedCases(opinionId: number): Promise<unknown> {
    return this.makeRequest(`/opinions/${opinionId}/cited-by/`);
  }

  async getCitationNetwork(opinionId: number, params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest(`/opinions/${opinionId}/citations/`, params);
  }

  async getOpinionCitations(opinionId: number): Promise<unknown> {
    return this.makeRequest(`/opinions/${opinionId}/citations/`);
  }

  async getAuthorities(opinionId: number): Promise<unknown> {
    return this.makeRequest(`/opinions/${opinionId}/authorities/`);
  }

  async getFinancialDisclosures(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/financial-disclosures/', params);
  }

  async getFinancialDisclosure(disclosureId: number): Promise<unknown> {
    return this.makeRequest(`/financial-disclosures/${disclosureId}/`);
  }

  async getParties(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/parties/', params);
  }

  async getAttorneys(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/attorneys/', params);
  }

  async getRECAPDocuments(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/recap/', params);
  }

  async getRECAPDocument(documentId: number): Promise<unknown> {
    return this.makeRequest(`/recap/${documentId}/`);
  }

  async createAlert(params: Record<string, unknown>): Promise<unknown> {
    // Note: This would typically be a POST request
    return this.makeRequest('/alerts/', params, { useCache: false });
  }

  async getAlerts(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/alerts/', params);
  }

  async getOralArguments(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/audio/', params);
  }

  async getOralArgument(audioId: number): Promise<unknown> {
    return this.makeRequest(`/audio/${audioId}/`);
  }

  // Additional methods to support enterprise server functionality

  // Search cases (alias for searchOpinions)
  async searchCases(params: Record<string, unknown>): Promise<unknown> {
    return this.searchOpinions(params);
  }

  // Get case details (alias for getOpinionCluster)
  async getCaseDetails(args: Record<string, unknown>): Promise<unknown> {
    const clusterId = args.clusterId ?? args.id;
    if (typeof clusterId === 'number') {
      return this.getOpinionCluster(clusterId);
    }
    if (typeof clusterId === 'string') {
      return this.getOpinionCluster(parseInt(clusterId, 10));
    }
    throw new Error('clusterId or id required for getCaseDetails');
  }

  // Get opinion text
  async getOpinionText(args: Record<string, unknown>): Promise<unknown> {
    const opinionId = args.opinionId ?? args.id;
    if (typeof opinionId === 'number') {
      return this.getOpinion(opinionId);
    }
    if (typeof opinionId === 'string') {
      return this.getOpinion(parseInt(opinionId, 10));
    }
    throw new Error('opinionId or id required for getOpinionText');
  }

  // Lookup citation using citation-lookup endpoint
  async lookupCitation(args: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/citation-lookup/', args);
  }

  // List courts (alias for getCourts)
  async listCourts(args: Record<string, unknown>): Promise<unknown> {
    return this.getCourts(args);
  }

  // Analyze legal argument - placeholder method
  async analyzeLegalArgument(args: Record<string, unknown>): Promise<unknown> {
    const searchQuery = typeof args.search_query === 'string' ? args.search_query : '';
    const argument = typeof args.argument === 'string' ? args.argument : '';
    const query = searchQuery || argument;
    if (!query) {
      return { analysis: { top_cases: [], summary: 'No search query provided.' } };
    }

    const searchParams: Record<string, unknown> = {
      q: query,
      page_size: 10,
      order_by: 'score desc',
    };
    if (typeof args.jurisdiction === 'string' && args.jurisdiction) {
      searchParams.court = args.jurisdiction;
    }
    if (typeof args.date_range_start === 'string' && args.date_range_start) {
      searchParams.date_filed_after = args.date_range_start;
    }
    if (typeof args.date_range_end === 'string' && args.date_range_end) {
      searchParams.date_filed_before = args.date_range_end;
    }

    const response = await this.searchOpinions(searchParams);
    const results = response?.results || [];

    const topCases = results.slice(0, 10).map(
      (
        r: OpinionCluster & { caseName?: string; court_id?: string; dateFiled?: string; snippet?: string },
      ) => ({
      case_name: r.case_name || r.caseName || 'Unknown',
      court: r.court || r.court_id || '',
      date_filed: r.date_filed || r.dateFiled || '',
      citation: r.federal_cite_one || r.state_cite_one || r.neutral_cite || '',
      citation_count: r.citation_count ?? 0,
      precedential_status: r.precedential_status || '',
      absolute_url: r.absolute_url || '',
      snippet: r.snippet || r.summary || '',
      }),
    );

    return {
      analysis: {
        top_cases: topCases,
        total_found: response?.count ?? 0,
        query_used: query,
        summary: `Found ${response?.count ?? 0} relevant opinions for: "${query}"`,
      },
    };
  }

  // Get parties and attorneys combined
  async getPartiesAndAttorneys(args: Record<string, unknown>): Promise<unknown> {
    const [parties, attorneys] = await Promise.all([
      this.getParties(args),
      this.getAttorneys(args),
    ]);
    return { parties, attorneys };
  }

  // Manage alerts (using alerts endpoint)
  async manageAlerts(args: Record<string, unknown>): Promise<unknown> {
    if (args.action === 'create') {
      return this.createAlert(args);
    }
    return this.getAlerts(args);
  }

  // Analyze case authorities - using opinions-cited endpoint
  async analyzeCaseAuthorities(args: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/opinions-cited/', args);
  }

  // Get visualization data
  async getVisualizationData(args: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/visualizations/json/', args);
  }

  // Get bulk data - placeholder for bulk operations
  async getBulkData(args: Record<string, unknown>): Promise<unknown> {
    // This would typically require special bulk API endpoints
    return {
      message: 'Bulk data operations not yet implemented',
      args,
    };
  }

  // Get bankruptcy data - using fjc-integrated-database for bankruptcy info
  async getBankruptcyData(args: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/fjc-integrated-database/', args);
  }

  // Enhanced REST API Methods for missing endpoints

  // Docket entries - individual court filings and orders
  async getDocketEntries(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/docket-entries/', params);
  }

  async getDocketEntry(entryId: number): Promise<unknown> {
    return this.makeRequest(`/docket-entries/${entryId}/`);
  }

  // Judicial positions and appointments
  async getJudicialPositions(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/positions/', params);
  }

  async getJudicialPosition(positionId: number): Promise<unknown> {
    return this.makeRequest(`/positions/${positionId}/`);
  }

  // Judge education history
  async getJudgeEducations(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/educations/', params);
  }

  // Judge political affiliations
  async getJudgePoliticalAffiliations(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/political-affiliations/', params);
  }

  // ABA ratings for judges
  async getABARatings(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/aba-ratings/', params);
  }

  // Judicial retention events
  async getRetentionEvents(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/retention-events/', params);
  }

  // Educational institutions
  async getSchools(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/schools/', params);
  }

  // Enhanced financial disclosure endpoints
  async getFinancialAgreements(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/agreements/', params);
  }

  async getFinancialDebts(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/debts/', params);
  }

  async getFinancialGifts(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/gifts/', params);
  }

  async getFinancialInvestments(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/investments/', params);
  }

  async getNonInvestmentIncomes(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/non-investment-incomes/', params);
  }

  async getDisclosurePositions(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/disclosure-positions/', params);
  }

  async getReimbursements(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/reimbursements/', params);
  }

  async getSpouseIncomes(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/spouse-incomes/', params);
  }

  // Enhanced RECAP functionality
  async getRECAPFetch(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/recap-fetch/', params);
  }

  async getRECAPQuery(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/recap-query/', params);
  }

  async getRECAPEmail(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/recap-email/', params);
  }

  // Originating court information for appeals
  async getOriginatingCourtInfo(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/originating-court-information/', params);
  }

  // Tagging system
  async getTags(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/tags/', params);
  }

  async getDocketTags(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/docket-tags/', params);
  }

  // Docket-specific alerts
  async getDocketAlerts(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/docket-alerts/', params);
  }

  async createDocketAlert(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/docket-alerts/', params, { useCache: false });
  }

  // Professional memberships
  async getMemberships(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/memberships/', params);
  }

  // Citation parsing and validation
  async validateCitations(text: string): Promise<unknown> {
    return this.makeRequest('/citation-lookup/', { text });
  }

  // Enhanced visualization endpoints
  async getVisualizationMetadata(params: Record<string, unknown>): Promise<unknown> {
    return this.makeRequest('/visualizations/', params);
  }

  // Comprehensive judge research combining multiple endpoints
  async getComprehensiveJudgeProfile(judgeId: number): Promise<unknown> {
    // Helper type for API responses with results array
    type ApiListResponse = { results?: unknown[] };

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
      this.getJudicialPositions({ person: judgeId }) as Promise<ApiListResponse>,
      this.getJudgeEducations({ person: judgeId }) as Promise<ApiListResponse>,
      this.getJudgePoliticalAffiliations({ person: judgeId }) as Promise<ApiListResponse>,
      this.getABARatings({ person: judgeId }) as Promise<ApiListResponse>,
      this.getRetentionEvents({ person: judgeId }) as Promise<ApiListResponse>,
      this.getFinancialDisclosures({ person: judgeId }) as Promise<ApiListResponse>,
    ]);

    return {
      judge,
      positions: positions.results ?? [],
      educations: educations.results ?? [],
      politicalAffiliations: politicalAffiliations.results ?? [],
      abaRatings: abaRatings.results ?? [],
      retentionEvents: retentionEvents.results ?? [],
      financialDisclosures: financialDisclosures.results ?? [],
    };
  }

  // Enhanced case analysis with all related data
  async getComprehensiveCaseAnalysis(clusterId: number): Promise<unknown> {
    // Helper type for API responses with results array
    type ApiListResponse = { results?: unknown[] };

    const [cluster, docket, docketEntries, parties, attorneys, tags] = await Promise.all([
      this.getOpinionCluster(clusterId),
      this.getDocket(clusterId).catch(() => null),
      this.getDocketEntries({ docket: clusterId }).catch(() => ({
        results: [],
      })) as Promise<ApiListResponse>,
      this.getParties({ docket: clusterId }).catch(() => ({
        results: [],
      })) as Promise<ApiListResponse>,
      this.getAttorneys({ docket: clusterId }).catch(() => ({
        results: [],
      })) as Promise<ApiListResponse>,
      this.getDocketTags({ docket: clusterId }).catch(() => ({
        results: [],
      })) as Promise<ApiListResponse>,
    ]);

    return {
      cluster,
      docket,
      docketEntries: docketEntries.results ?? [],
      parties: parties.results ?? [],
      attorneys: attorneys.results ?? [],
      tags: tags.results ?? [],
    };
  }
}
