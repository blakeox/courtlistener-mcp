import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { CacheManager } from '../infrastructure/cache.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class ApiStatusResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://api/status';
  readonly name = 'API Status';
  readonly description = 'API health, rate limit status, and cache stats';
  readonly mimeType = 'application/json';

  constructor(
    private cache: CacheManager,
    private metrics: MetricsCollector,
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
