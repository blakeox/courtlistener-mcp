/**
 * Middleware Factory
 * Creates and configures middleware components
 */

import { Logger } from '../infrastructure/logger.js';
import { ServerConfig } from '../types.js';

export interface Middleware {
  name: string;
  process(context: unknown, next: () => Promise<unknown>): Promise<unknown>;
}

export interface RequestContext {
  requestId: string;
  userId?: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

export class AuthenticationMiddleware implements Middleware {
  readonly name = 'authentication';

  constructor(
    private config: ServerConfig['security'],
    private logger: Logger,
  ) {}

  async process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.config.authEnabled) {
      return next();
    }

    // Authentication logic would go here
    this.logger.debug('Processing authentication', { requestId: context.requestId });

    return next();
  }
}

export class RateLimitMiddleware implements Middleware {
  readonly name = 'rateLimit';
  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private config: ServerConfig['security'],
    private logger: Logger,
  ) {}

  async process(context: RequestContext, next: () => Promise<unknown>): Promise<unknown> {
    if (!this.config.rateLimitEnabled) {
      return next();
    }

    const clientId = context.userId || 'anonymous';
    const now = Date.now();
    const windowStart = Math.floor(now / 60000) * 60000; // 1-minute windows

    const requestData = this.requestCounts.get(clientId) || { count: 0, resetTime: windowStart };

    if (requestData.resetTime < windowStart) {
      requestData.count = 0;
      requestData.resetTime = windowStart;
    }

    if (requestData.count >= this.config.maxRequestsPerMinute) {
      throw new Error('Rate limit exceeded');
    }

    requestData.count++;
    this.requestCounts.set(clientId, requestData);

    this.logger.debug('Rate limit check passed', {
      requestId: context.requestId,
      clientId,
      count: requestData.count,
      limit: this.config.maxRequestsPerMinute,
    });

    return next();
  }
}

export class MiddlewareFactory {
  constructor(private logger: Logger) {}

  createMiddlewareStack(config: ServerConfig): Middleware[] {
    const middlewares: Middleware[] = [];

    // Add authentication middleware
    if (config.security.authEnabled) {
      middlewares.push(new AuthenticationMiddleware(config.security, this.logger));
    }

    // Add rate limiting middleware
    if (config.security.rateLimitEnabled) {
      middlewares.push(new RateLimitMiddleware(config.security, this.logger));
    }

    this.logger.info('Created middleware stack', {
      middlewareCount: middlewares.length,
      middlewares: middlewares.map((m) => m.name),
    });

    return middlewares;
  }

  async executeMiddlewareStack(
    middlewares: Middleware[],
    context: RequestContext,
    finalHandler: () => Promise<unknown>,
  ): Promise<unknown> {
    let index = 0;

    const next = async (): Promise<unknown> => {
      if (index >= middlewares.length) {
        return finalHandler();
      }

      const middleware = middlewares[index++];
      return middleware.process(context, next);
    };

    return next();
  }
}
