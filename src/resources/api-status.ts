import { ReadResourceResult, Resource } from '@modelcontextprotocol/server';
import { CacheManager } from '../infrastructure/cache.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';
import type { ConfigEnvironment } from '../infrastructure/config.js';

const DEFAULT_SUBSCRIPTION_REFRESH_TTL_MS = 60_000;

function resolveSubscriptionRefreshTtlMs(
  defaultTtlMs: number,
  environment: ConfigEnvironment,
): number {
  const override = environment.MCP_TEST_SUBSCRIPTION_REFRESH_MS;
  if (!override) {
    return defaultTtlMs;
  }

  const parsed = Number.parseInt(override, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTtlMs;
}

export class ApiStatusResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://api/status';
  readonly name = 'API Status';
  readonly description = 'API health, rate limit status, and cache stats';
  readonly mimeType = 'application/json';

  get subscriptionRefreshTtlMs(): number {
    return resolveSubscriptionRefreshTtlMs(DEFAULT_SUBSCRIPTION_REFRESH_TTL_MS, this.environment);
  }

  constructor(
    private cache: CacheManager,
    private metrics: MetricsCollector,
    private environment: ConfigEnvironment = {},
  ) {}

  matches(uri: string): boolean {
    return uri === 'courtlistener://api/status';
  }

  async read(uri: string, _context: ResourceContext): Promise<ReadResourceResult> {
    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      cache: this.cache.getStats(),
      metrics: this.metrics.getMetrics(),
      performance: this.metrics.getPerformanceSummary(),
    };

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  list(): Resource[] {
    return [
      {
        uri: 'courtlistener://api/status',
        name: 'API Status',
        description: 'Check API connectivity, cache stats, and rate limit status',
        mimeType: 'application/json',
      },
    ];
  }
}
