/**
 * Enhanced per-client rate limiting for Legal MCP Server
 * Provides sophisticated rate limiting with client identification
 */

import { Logger } from '../logger.js';

export interface RateLimitConfig {
  enabled: boolean;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  maxRequestsPerDay: number;
  windowSizeMs: number;
  clientIdentification: 'ip' | 'api-key' | 'header';
  identificationHeader?: string;
  whitelistedClients: string[];
  penaltyMultiplier: number;
  persistStorage: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  clientId: string;
  windowUsage: number;
}

export interface ClientStats {
  requests: number;
  lastRequest: number;
  windowStart: number;
  penalties: number;
  totalRequests: number;
}

export class PerClientRateLimiter {
  private clients = new Map<string, ClientStats>();
  private logger: Logger;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private config: RateLimitConfig,
    logger: Logger
  ) {
    this.logger = logger.child('RateLimiter');
    
    if (this.config.enabled) {
      this.setupCleanup();
      this.logger.info('Per-client rate limiting enabled', {
        maxRequestsPerMinute: this.config.maxRequestsPerMinute,
        clientIdentification: this.config.clientIdentification,
        whitelistedClients: this.config.whitelistedClients.length
      });
    }
  }

  /**
   * Check if request is allowed for client
   */
  checkLimit(
    clientId: string,
    headers: Record<string, string> = {},
    metadata?: Record<string, any>
  ): RateLimitResult {
    if (!this.config.enabled) {
      return {
        allowed: true,
        remaining: this.config.maxRequestsPerMinute,
        resetTime: Date.now() + this.config.windowSizeMs,
        clientId,
        windowUsage: 0
      };
    }

    const resolvedClientId = this.resolveClientId(clientId, headers);

    // Check if client is whitelisted
    if (this.config.whitelistedClients.includes(resolvedClientId)) {
      this.logger.debug('Request allowed for whitelisted client', {
        clientId: resolvedClientId
      });
      
      return {
        allowed: true,
        remaining: this.config.maxRequestsPerMinute,
        resetTime: Date.now() + this.config.windowSizeMs,
        clientId: resolvedClientId,
        windowUsage: 0
      };
    }

    const stats = this.getOrCreateClientStats(resolvedClientId);
    const now = Date.now();

    // Check if window needs reset
    if (now - stats.windowStart >= this.config.windowSizeMs) {
      this.resetClientWindow(stats, now);
    }

    // Calculate effective limit (including penalties)
    const effectiveLimit = this.calculateEffectiveLimit(stats);
    
    // Check if request should be allowed
    if (stats.requests >= effectiveLimit) {
      const resetTime = stats.windowStart + this.config.windowSizeMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      this.logger.warn('Rate limit exceeded', {
        clientId: resolvedClientId,
        requests: stats.requests,
        effectiveLimit,
        penalties: stats.penalties,
        retryAfter
      });

      // Apply penalty for exceeding limit
      stats.penalties++;

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
        clientId: resolvedClientId,
        windowUsage: stats.requests / effectiveLimit
      };
    }

    // Allow request and update stats
    stats.requests++;
    stats.totalRequests++;
    stats.lastRequest = now;

    this.logger.debug('Request allowed', {
      clientId: resolvedClientId,
      requests: stats.requests,
      effectiveLimit,
      remaining: effectiveLimit - stats.requests
    });

    return {
      allowed: true,
      remaining: effectiveLimit - stats.requests,
      resetTime: stats.windowStart + this.config.windowSizeMs,
      clientId: resolvedClientId,
      windowUsage: stats.requests / effectiveLimit
    };
  }

  /**
   * Resolve client ID from various sources
   */
  private resolveClientId(
    providedId: string,
    headers: Record<string, string>
  ): string {
    switch (this.config.clientIdentification) {
      case 'api-key':
        const apiKey = headers['x-api-key'] || headers['authorization'];
        if (apiKey) {
          // Use first 8 characters for identification
          const keyId = apiKey.startsWith('Bearer ') ? 
                       apiKey.substring(7, 15) : 
                       apiKey.substring(0, 8);
          return `api-key:${keyId}`;
        }
        break;
        
      case 'header':
        if (this.config.identificationHeader) {
          const headerValue = headers[this.config.identificationHeader.toLowerCase()];
          if (headerValue) {
            return `header:${headerValue}`;
          }
        }
        break;
        
      case 'ip':
      default:
        // Fall through to use provided ID (usually IP)
        break;
    }

    return providedId || 'anonymous';
  }

  /**
   * Get or create client statistics
   */
  private getOrCreateClientStats(clientId: string): ClientStats {
    if (!this.clients.has(clientId)) {
      const now = Date.now();
      this.clients.set(clientId, {
        requests: 0,
        lastRequest: now,
        windowStart: now,
        penalties: 0,
        totalRequests: 0
      });
    }

    return this.clients.get(clientId)!;
  }

  /**
   * Reset client window
   */
  private resetClientWindow(stats: ClientStats, now: number): void {
    stats.requests = 0;
    stats.windowStart = now;
    
    // Reduce penalties over time (forgiveness)
    if (stats.penalties > 0) {
      stats.penalties = Math.max(0, stats.penalties - 1);
    }
  }

  /**
   * Calculate effective limit including penalties
   */
  private calculateEffectiveLimit(stats: ClientStats): number {
    const baseLimit = this.config.maxRequestsPerMinute;
    const penaltyReduction = stats.penalties * this.config.penaltyMultiplier;
    
    return Math.max(1, baseLimit - penaltyReduction);
  }

  /**
   * Setup periodic cleanup of old client data
   */
  private setupCleanup(): void {
    const cleanupIntervalMs = this.config.windowSizeMs * 2; // Cleanup every 2 windows
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldClients();
    }, cleanupIntervalMs);
  }

  /**
   * Remove data for inactive clients
   */
  private cleanupOldClients(): void {
    const now = Date.now();
    const staleThreshold = this.config.windowSizeMs * 5; // 5 windows
    let cleaned = 0;

    for (const [clientId, stats] of this.clients.entries()) {
      if (now - stats.lastRequest > staleThreshold) {
        this.clients.delete(clientId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cleaned up inactive clients', {
        cleaned,
        activeClients: this.clients.size
      });
    }
  }

  /**
   * Get rate limiting statistics
   */
  getStats(): {
    enabled: boolean;
    activeClients: number;
    totalClients: number;
    config: RateLimitConfig;
    topClients: Array<{ clientId: string; requests: number; penalties: number }>;
  } {
    const topClients = Array.from(this.clients.entries())
      .map(([clientId, stats]) => ({
        clientId,
        requests: stats.totalRequests,
        penalties: stats.penalties
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      enabled: this.config.enabled,
      activeClients: this.clients.size,
      totalClients: this.clients.size,
      config: this.config,
      topClients
    };
  }

  /**
   * Reset all client statistics
   */
  reset(): void {
    this.clients.clear();
    this.logger.info('All client rate limit statistics reset');
  }

  /**
   * Cleanup and stop rate limiter
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clients.clear();
    this.logger.info('Rate limiter stopped');
  }
}

/**
 * Create per-client rate limiter from environment configuration
 */
export function createPerClientRateLimiter(logger: Logger): PerClientRateLimiter {
  const config: RateLimitConfig = {
    enabled: process.env.RATE_LIMIT_ENABLED === 'true',
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    maxRequestsPerHour: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_HOUR || '1000'),
    maxRequestsPerDay: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_DAY || '10000'),
    windowSizeMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
    clientIdentification: (process.env.RATE_LIMIT_CLIENT_ID as any) || 'ip',
    identificationHeader: process.env.RATE_LIMIT_ID_HEADER || 'x-client-id',
    whitelistedClients: process.env.RATE_LIMIT_WHITELIST ? 
                        process.env.RATE_LIMIT_WHITELIST.split(',').map(c => c.trim()) : [],
    penaltyMultiplier: parseFloat(process.env.RATE_LIMIT_PENALTY_MULTIPLIER || '0.1'),
    persistStorage: process.env.RATE_LIMIT_PERSIST === 'true'
  };

  return new PerClientRateLimiter(config, logger);
}
