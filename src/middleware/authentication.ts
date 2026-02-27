/**
 * Authentication middleware for Legal MCP Server
 *
 * Supports two authentication modes:
 *  - API key via `x-api-key` header (used for stdio/local connections)
 *  - Modern: OAuth 2.1 Bearer tokens (handled by the SDK's requireBearerAuth
 *    middleware on the HTTP/SSE transport; see src/auth/oauth-provider.ts)
 *
 * This module implements the API-key path. The OAuth path is wired up
 * at the transport layer and does not flow through this middleware.
 */

import { Logger } from '../infrastructure/logger.js';
import { getConfig } from '../infrastructure/config.js';

export interface AuthConfig {
  enabled: boolean;
  apiKeys: string[];
  allowAnonymous: boolean;
  headerName: string;
}

export interface AuthContext {
  isAuthenticated: boolean;
  apiKey?: string;
  clientId?: string;
  permissions: string[];
}

export class AuthenticationMiddleware {
  private logger: Logger;

  constructor(
    private config: AuthConfig,
    logger: Logger,
  ) {
    this.logger = logger.child('Authentication');

    if (this.config.enabled) {
      this.logger.info('Authentication middleware enabled', {
        allowAnonymous: this.config.allowAnonymous,
        configuredKeys: this.config.apiKeys.length,
        headerName: this.config.headerName,
      });
    }
  }

  /**
   * Authenticate a request and return auth context
   */
  async authenticate(headers: Record<string, string>): Promise<AuthContext> {
    if (!this.config.enabled) {
      return {
        isAuthenticated: true,
        permissions: ['*'],
      };
    }

    const apiKey = this.extractApiKey(headers);

    if (!apiKey) {
      if (this.config.allowAnonymous) {
        this.logger.debug('Anonymous request allowed');
        return {
          isAuthenticated: false,
          permissions: ['read'],
        };
      } else {
        this.logger.warn('Authentication required but no API key provided');
        throw new Error('Authentication required: API key missing');
      }
    }

    const isValid = this.validateApiKey(apiKey);

    if (!isValid) {
      this.logger.warn('Invalid API key provided', {
        keyPrefix: apiKey.substring(0, 8) + '...',
      });
      throw new Error('Authentication failed: Invalid API key');
    }

    const clientId = this.generateClientId(apiKey);

    this.logger.debug('Request authenticated successfully', {
      clientId,
      keyPrefix: apiKey.substring(0, 8) + '...',
    });

    return {
      isAuthenticated: true,
      apiKey,
      clientId,
      permissions: ['read', 'write', 'admin'],
    };
  }

  /**
   * Extract API key from request headers
   */
  private extractApiKey(headers: Record<string, string>): string | undefined {
    const authHeader = headers[this.config.headerName.toLowerCase()] || headers['authorization'];

    if (!authHeader) {
      return undefined;
    }

    // Support both "Bearer <key>" and direct key formats
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }

  /**
   * Validate API key against configured keys
   */
  private validateApiKey(apiKey: string): boolean {
    return this.config.apiKeys.includes(apiKey);
  }

  /**
   * Generate a client ID from API key for rate limiting
   */
  private generateClientId(apiKey: string): string {
    // Use first 8 characters as client identifier
    return `client_${apiKey.substring(0, 8)}`;
  }

  /**
   * Check if client has specific permission
   */
  hasPermission(context: AuthContext, permission: string): boolean {
    return context.permissions.includes('*') || context.permissions.includes(permission);
  }
}

/**
 * Create authentication middleware from centralized config
 */
export function createAuthMiddleware(logger: Logger): AuthenticationMiddleware {
  const cfg = getConfig();
  const config: AuthConfig = {
    enabled: cfg.security.authEnabled,
    apiKeys: cfg.security.apiKeys,
    allowAnonymous: cfg.security.allowAnonymous,
    headerName: cfg.security.headerName,
  };

  return new AuthenticationMiddleware(config, logger);
}
