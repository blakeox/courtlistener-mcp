/**
 * Enhanced CourtListener API Client
 * Uses async patterns for improved performance and reliability
 */

import {
  ConnectionPoolManager,
  RequestQueueManager,
  CircuitBreaker,
  CircuitBreakerOptions,
} from './async-patterns.js';
import { Logger } from './logger.js';
import { CacheManager } from './cache.js';
import { MetricsCollector } from './metrics.js';
import { cryptoId } from '../common/utils.js';

export interface EnhancedAPIOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerOptions?: CircuitBreakerOptions;
  connectionPool?: {
    maxConnections?: number;
    maxIdleTime?: number;
  };
  requestQueue?: {
    maxConcurrent?: number;
    rateLimit?: number;
  };
}

/**
 * Enhanced CourtListener API Client
 * Features connection pooling, request queuing, circuit breakers, and comprehensive error handling
 */
export class EnhancedCourtListenerAPIClient {
  private baseUrl: string;
  private apiKey: string;
  private options: Required<EnhancedAPIOptions>;
  private logger: Logger;
  private cache: CacheManager;
  private metrics: MetricsCollector;

  private connectionPool: ConnectionPoolManager;
  private requestQueue: RequestQueueManager;
  private circuitBreaker?: CircuitBreaker;

  constructor(
    options: EnhancedAPIOptions,
    logger: Logger,
    cache: CacheManager,
    metrics: MetricsCollector,
  ) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.logger = logger.child('EnhancedAPI');
    this.cache = cache;
    this.metrics = metrics;

    // Set defaults
    this.options = {
      ...options,
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      circuitBreakerOptions: {
        failureThreshold: 5,
        timeout: 60000,
        ...options.circuitBreakerOptions,
      },
      connectionPool: {
        maxConnections: 10,
        maxIdleTime: 30000,
        ...options.connectionPool,
      },
      requestQueue: {
        maxConcurrent: 5,
        rateLimit: 10, // 10 requests per second
        ...options.requestQueue,
      },
    };

    // Initialize async patterns
    this.connectionPool = new ConnectionPoolManager(this.logger);
    this.requestQueue = new RequestQueueManager(this.logger);

    if (this.options.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(
        'courtlistener-api',
        this.options.circuitBreakerOptions,
        this.logger,
      );
    }

    this.logger.info('Enhanced API client initialized', {
      baseUrl: this.baseUrl,
      circuitBreakerEnabled: this.options.enableCircuitBreaker,
      connectionPoolConfig: this.options.connectionPool,
      requestQueueConfig: this.options.requestQueue,
    });
  }

  /**
   * Enhanced request method with all async patterns
   */
  async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    priority: number = 0,
  ): Promise<T> {
    const requestId = cryptoId('req');
    const startTime = Date.now();

    this.logger.debug('API request started', {
      requestId,
      endpoint,
      method: options.method || 'GET',
      priority,
    });

    try {
      // Check cache first
      const cacheKey = this.buildCacheKey(endpoint, options);
      if (options.method === 'GET' || !options.method) {
        const cached = this.cache.get<T>(cacheKey);
        if (cached !== null) {
          this.logger.debug('Cache hit for request', { requestId, endpoint });
          this.metrics.recordCacheHit();
          const responseTime = Date.now() - startTime;
          this.metrics.recordRequest(responseTime, true);
          return cached;
        }
      }

      // Execute request through queue with circuit breaker
      const queue = this.requestQueue.getQueue('api-requests', this.options.requestQueue);

      const result = await queue.enqueue(
        async () => {
          const operation = async () => this.executeRequest<T>(endpoint, options, requestId);

          if (this.circuitBreaker) {
            return await this.circuitBreaker.execute(operation);
          }

          return await operation();
        },
        priority,
        { requestId, endpoint, method: options.method || 'GET' },
      );

      // Cache successful GET requests - use sync cache API with proper signature
      if ((options.method === 'GET' || !options.method) && options.cacheTtl !== 0) {
        const ttl = options.cacheTtl ?? 300; // 5 minutes default (in seconds for cache API)
        this.cache.set(cacheKey, {}, result as Record<string, unknown>, ttl);
      }

      const responseTime = Date.now() - startTime;
      this.logger.debug('API request completed', {
        requestId,
        endpoint,
        responseTime,
        cached: false,
      });

      this.metrics.recordRequest(responseTime, false);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('API request failed', error as Error, {
        requestId,
        endpoint,
        method: options.method || 'GET',
      });

      this.metrics.recordFailure(responseTime);
      throw error;
    }
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest<T>(
    endpoint: string,
    options: RequestOptions,
    requestId: string,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    const requestOptions: RequestInit = {
      method,
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'CourtListener-MCP-Enhanced/2.0',
        ...options.headers,
      },
      signal: AbortSignal.timeout(this.options.timeout),
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    if (options.params) {
      const urlObj = new URL(url);
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          urlObj.searchParams.append(key, String(value));
        }
      });
      const finalUrl = urlObj.toString();

      this.logger.debug('Executing HTTP request', {
        requestId,
        url: finalUrl,
        method,
      });

      const response = await fetch(finalUrl, requestOptions);
      return await this.handleResponse<T>(response, requestId);
    }

    this.logger.debug('Executing HTTP request', {
      requestId,
      url,
      method,
    });

    const response = await fetch(url, requestOptions);
    return await this.handleResponse<T>(response, requestId);
  }

  /**
   * Handle HTTP response with comprehensive error handling
   */
  private async handleResponse<T>(response: Response, requestId: string): Promise<T> {
    this.logger.debug('Processing response', {
      requestId,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorDetails: Record<string, unknown> = {};

      try {
        const errorBody = await response.text();
        if (errorBody) {
          try {
            errorDetails = JSON.parse(errorBody);
            const detail = errorDetails.detail;
            const message = errorDetails.message;
            errorMessage =
              (typeof detail === 'string' ? detail : undefined) ||
              (typeof message === 'string' ? message : undefined) ||
              errorMessage;
          } catch {
            // If not JSON, use text as error message
            errorMessage = errorBody;
          }
        }
      } catch {
        // Ignore errors when reading error body
      }

      const error = new APIError(errorMessage, response.status, errorDetails);

      this.logger.error('API response error', error, {
        requestId,
        status: response.status,
        errorDetails,
      });

      throw error;
    }

    try {
      const data = await response.json();

      this.logger.debug('Response parsed successfully', {
        requestId,
        dataSize: JSON.stringify(data).length,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to parse response JSON', error as Error, {
        requestId,
      });

      throw new APIError('Invalid JSON response', response.status, { requestId });
    }
  }

  /**
   * Build cache key for request
   */
  private buildCacheKey(endpoint: string, options: RequestOptions): string {
    const parts = ['api', endpoint.replace(/[^\w]/g, '_'), options.method || 'GET'];

    if (options.params) {
      const paramString = Object.entries(options.params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      parts.push(paramString);
    }

    return parts.join(':');
  }

  /**
   * Get performance statistics
   */
  getStats(): EnhancedAPIStats {
    const metrics = this.metrics.getMetrics();
    return {
      connectionPool: this.connectionPool.getStats(),
      requestQueue: this.requestQueue.getStats(),
      circuitBreaker: this.circuitBreaker?.getStats(),
      metrics: {
        cacheHits: metrics.cache_hits,
        requestsSuccess: metrics.requests_successful,
        requestsError: metrics.requests_failed,
        totalRequests: metrics.requests_total,
        averageResponseTime: metrics.average_response_time,
        uptime: metrics.uptime_seconds,
      },
    };
  }

  /**
   * Close all resources
   */
  async close(): Promise<void> {
    this.logger.info('Closing enhanced API client...');

    await Promise.all([this.connectionPool.closeAll(), this.requestQueue.closeAll()]);

    this.logger.info('Enhanced API client closed');
  }

  // Convenience methods for common endpoints
  async searchOpinions(params: Record<string, unknown>, priority: number = 0): Promise<unknown> {
    return this.request(
      '/api/rest/v4/search/',
      {
        method: 'GET',
        params: { type: 'o', ...params },
        cacheTtl: 300000, // 5 minutes
      },
      priority,
    );
  }

  async searchCases(params: Record<string, unknown>, priority: number = 0): Promise<unknown> {
    return this.request(
      '/api/rest/v4/search/',
      {
        method: 'GET',
        params: { type: 'r', ...params },
        cacheTtl: 300000,
      },
      priority,
    );
  }

  async getOpinion(id: string, priority: number = 0): Promise<unknown> {
    return this.request(
      `/api/rest/v4/opinions/${id}/`,
      {
        method: 'GET',
        cacheTtl: 600000, // 10 minutes
      },
      priority,
    );
  }

  async getCase(id: string, priority: number = 0): Promise<unknown> {
    return this.request(
      `/api/rest/v4/dockets/${id}/`,
      {
        method: 'GET',
        cacheTtl: 600000,
      },
      priority,
    );
  }

  async getCourts(priority: number = 0): Promise<unknown> {
    return this.request(
      '/api/rest/v4/courts/',
      {
        method: 'GET',
        cacheTtl: 3600000, // 1 hour
      },
      priority,
    );
  }
}

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown = {},
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Type definitions
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  cacheTtl?: number; // Cache TTL in milliseconds, 0 = no cache
}

export interface EnhancedAPIStats {
  connectionPool: unknown;
  requestQueue: unknown;
  circuitBreaker?: unknown;
  metrics: {
    cacheHits: number;
    requestsSuccess: number;
    requestsError: number;
    totalRequests: number;
    averageResponseTime: number;
    uptime: number;
  };
}
