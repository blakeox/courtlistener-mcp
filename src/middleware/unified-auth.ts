import { verifyAccessToken, OAuthConfig } from '../security/oidc.js';
import { Logger } from '../infrastructure/logger.js';

export interface UnifiedAuthConfig {
  oidc?: OAuthConfig;
  staticToken?: string;
}

export interface AuthResult {
  isAuthenticated: boolean;
  error?: {
    status: number;
    message: string;
    headers?: Record<string, string>;
  };
  payload?: unknown;
}

export class UnifiedAuthMiddleware {
  constructor(
    private config: UnifiedAuthConfig,
    private logger?: Logger,
  ) {}

  async authenticate(request: Request): Promise<AuthResult> {
    const { oidc, staticToken } = this.config;

    // If no auth configured, allow (or should we default to deny? worker.ts implies optional auth)
    // worker.ts logic:
    // const oidcCfg = g().__OIDC;
    // const expectedToken = g().__SSE_AUTH_TOKEN__;
    // if (oidcCfg?.issuer) { ... } else if (expectedToken) { ... }

    // If neither is configured, we assume it's open or handled elsewhere?
    // In worker.ts, if neither is set, it falls through (implicitly allowed).
    if (!oidc?.issuer && !staticToken) {
      return { isAuthenticated: true };
    }

    const url = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    const lowerAuth = authHeader?.toLowerCase() ?? '';
    const headerToken =
      authHeader && lowerAuth.startsWith('bearer ') ? authHeader.slice(7).trim() : undefined;
    const queryToken = url.searchParams.get('access_token') ?? undefined;
    const presentedToken = headerToken || queryToken;

    // 1. OIDC Check
    if (oidc?.issuer) {
      if (!presentedToken) {
        return this.createError(401, 'Unauthorized', {
          'WWW-Authenticate':
            'Bearer realm="mcp", error="invalid_request", error_description="missing_token"',
        });
      }

      try {
        const result = await verifyAccessToken(presentedToken, oidc);
        return { isAuthenticated: true, payload: result.payload };
      } catch (err: unknown) {
        this.logger?.error(
          'OIDC verification failed',
          err instanceof Error ? err : new Error(String(err)),
        );
        const errorMessage = err instanceof Error ? err.message : String(err);
        return this.createError(403, 'Forbidden', {
          'WWW-Authenticate': `Bearer realm="mcp", error="insufficient_scope", error_description="${errorMessage}"`,
        });
      }
    }

    // 2. Static Token Check
    if (staticToken) {
      if (!presentedToken) {
        return this.createError(401, 'Unauthorized', {
          'WWW-Authenticate': 'Bearer realm="mcp"',
        });
      }

      if (presentedToken !== staticToken) {
        this.logger?.warn('Invalid static token presented');
        return this.createError(403, 'Forbidden');
      }

      return { isAuthenticated: true, payload: { sub: 'static-token-user' } };
    }

    return { isAuthenticated: true };
  }

  private createError(
    status: number,
    message: string,
    headers?: Record<string, string>,
  ): AuthResult {
    return {
      isAuthenticated: false,
      error: {
        status,
        message,
        ...(headers !== undefined && { headers }),
      },
    };
  }
}
