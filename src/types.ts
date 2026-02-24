/**
 * TypeScript type definitions for Legal MCP Server
 * Provides comprehensive type safety and better development experience
 */

export interface CourtListenerConfig {
  baseUrl: string;
  version: string;
  timeout: number;
  retryAttempts: number;
  rateLimitPerMinute: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache entries
}

export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  enabled: boolean;
}

export interface ServerConfig {
  courtListener: CourtListenerConfig;
  cache: CacheConfig;
  logging: LogConfig;
  metrics: {
    enabled: boolean;
    port?: number;
  };
  security: {
    authEnabled: boolean;
    apiKeys: string[];
    allowAnonymous: boolean;
    headerName: string;
    corsEnabled: boolean;
    corsOrigins: string[];
    rateLimitEnabled: boolean;
    maxRequestsPerMinute: number;
    sanitizationEnabled: boolean;
  };
  audit: {
    enabled: boolean;
    logLevel: string;
    includeRequestBody: boolean;
    includeResponseBody: boolean;
    maxBodyLength: number;
    sensitiveFields: string[];
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    resetTimeout: number;
  };
  compression: {
    enabled: boolean;
    threshold: number;
    level: number;
    types: string[];
  };
  sampling: {
    enabled: boolean;
    maxTokens: number;
    defaultModel?: string;
  };
  correlation?: {
    enabled: boolean;
    headerName: string;
    generateId: boolean;
  };
  sanitization?: {
    enabled: boolean;
    maxStringLength: number;
    maxArrayLength: number;
    maxObjectDepth: number;
  };
  rateLimit?: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    maxRequestsPerDay: number;
    windowSizeMs: number;
    clientIdentification: string;
    identificationHeader: string;
    whitelistedClients: string[];
    penaltyMultiplier: number;
    persistStorage: boolean;
  };
  gracefulShutdown?: {
    enabled: boolean;
    timeout: number;
    forceTimeout: number;
    signals: string[];
  };
  httpTransport?: {
    port: number;
    host: string;
    enableJsonResponse: boolean;
    enableSessions: boolean;
    enableResumability: boolean;
    enableDnsRebindingProtection: boolean;
    allowedOrigins?: string[];
    allowedHosts?: string[];
  };
  oauth?: {
    enabled: boolean;
    issuerUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

// CourtListener API Response Types
export interface CourtListenerResponse<T = unknown> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface OpinionCluster {
  id: number;
  case_name: string;
  case_name_short: string;
  court: string;
  date_filed: string;
  citation_count: number;
  precedential_status: string;
  federal_cite_one?: string;
  state_cite_one?: string;
  neutral_cite?: string;
  absolute_url: string;
  summary?: string;
  syllabus?: string;
}

export interface Opinion {
  id: number;
  type: string;
  author_str?: string;
  joined_by_str?: string;
  per_curiam: boolean;
  page_count?: number;
  extracted_by_ocr: boolean;
  plain_text?: string;
  html?: string;
  html_with_citations?: string;
  download_url?: string;
  absolute_url: string;
  cluster: number;
}

export interface Court {
  id: string;
  full_name: string;
  short_name: string;
  citation_string: string;
  jurisdiction: string;
  in_use: boolean;
  has_opinion_scraper: boolean;
  has_oral_argument_scraper: boolean;
  start_date?: string;
  end_date?: string;
  notes?: string;
  url?: string;
}

export interface Judge {
  id: number;
  name_first: string;
  name_last: string;
  name_middle?: string;
  name_suffix?: string;
  date_created: string;
  date_modified: string;
  fjc_id?: number;
  cl_id?: string;
  slug?: string;
  gender?: string;
  religion?: string;
  political_affiliation?: string;
  appointer?: string;
  date_nominated?: string;
  date_elected?: string;
  date_recess_appointment?: string;
  date_referred_to_judicial_committee?: string;
  date_judicial_committee_action?: string;
  judicial_committee_action?: string;
  date_hearing?: string;
  date_confirmation?: string;
  date_start?: string;
  date_granularity_start?: string;
  date_termination?: string;
  termination_reason?: string;
  date_retirement?: string;
  date_death?: string;
  how_selected?: string;
  nomination_process?: string;
  voice_vote?: boolean;
  votes_yes?: number;
  votes_no?: number;
  votes_yes_percent?: number;
  votes_no_percent?: number;
  how_selected_id?: string;
  has_inferred_values?: boolean;
  school?: string;
  educations?: unknown[];
  positions?: unknown[];
  aba_ratings?: unknown[];
  political_affiliations?: unknown[];
  sources?: unknown[];
}

export interface Docket {
  id: number;
  docket_number: string;
  case_name: string;
  case_name_short: string;
  court: string;
  date_created: string;
  date_modified: string;
  date_filed?: string;
  date_terminated?: string;
  assigned_to?: number;
  assigned_to_str?: string;
  referred_to?: number;
  referred_to_str?: string;
  nature_of_suit?: string;
  cause?: string;
  jury_demand?: string;
  pacer_case_id?: string;
  source?: string;
  view_count?: number;
  date_blocked?: string;
  blocked?: boolean;
  appeal_from?: string;
  appeal_from_str?: string;
}

// Search Parameters
export interface SearchParams {
  q?: string;
  court?: string;
  judge?: string;
  case_name?: string;
  citation?: string;
  date_filed_after?: string;
  date_filed_before?: string;
  precedential_status?: string;
  order_by?: string;
  page?: number;
  page_size?: number;
}

export interface AdvancedSearchParams extends SearchParams {
  type?: 'o' | 'r' | 'p' | 'oa';
  docket_number?: string;
  cited_lt?: number;
  cited_gt?: number;
  status?: string;
  nature_of_suit?: string;
}

// Tool Response Types
export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface PaginatedResponse {
  pagination: {
    current_page: number;
    total_pages: number;
    total_results: number;
    page_size: number;
    has_next: boolean;
    has_previous: boolean;
    next_url?: string;
    previous_url?: string;
  };
  search_parameters: Record<string, unknown>;
  results: unknown[];
  endpoint_info: {
    api_endpoint: string;
    documentation: string;
    rate_limits: string;
  };
}

// Error Types
export interface ApiError {
  status: number;
  message: string;
  endpoint: string;
  timestamp: string;
  request_id?: string;
}

// Cache Types
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Metrics Types
export interface Metrics {
  requests_total: number;
  requests_successful: number;
  requests_failed: number;
  cache_hits: number;
  cache_misses: number;
  average_response_time: number;
  last_request_time: string;
  uptime_seconds: number;
}

// Tool Definition Enhancement
export interface EnhancedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: {
    type: 'object';
    properties: Record<string, object>;
    required?: string[];
  };
  examples?: Array<{
    name: string;
    description: string;
    arguments: Record<string, unknown>;
  }>;
  category: 'search' | 'details' | 'analysis' | 'monitoring' | 'reference';
  complexity: 'simple' | 'intermediate' | 'advanced';
  rateLimitWeight: number;
}
