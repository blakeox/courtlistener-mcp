/**
 * API Client Factory
 * Creates and configures API clients with proper dependency injection
 */

import { CourtListenerAPI } from '../courtlistener.js';
import { CacheManager } from '../infrastructure/cache.js';
import { Logger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { CourtListenerConfig } from '../types.js';

export interface ApiClientFactory {
  createCourtListenerClient(config: CourtListenerConfig): CourtListenerAPI;
}

export class DefaultApiClientFactory implements ApiClientFactory {
  constructor(
    private cache: CacheManager,
    private logger: Logger,
    private metrics: MetricsCollector
  ) {}

  createCourtListenerClient(config: CourtListenerConfig): CourtListenerAPI {
    // Create client with dependencies
    return new CourtListenerAPI(
      config,
      this.cache,
      this.logger,
      this.metrics
    );
  }
}