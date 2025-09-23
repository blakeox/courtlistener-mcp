/**
 * Authentication middleware for Legal MCP Server
 * Provides optional API key authentication for enhanced security
 */

import { Logger } from '../infrastructure/logger.js';

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
    logger: Logger
  ) {
    this.logger = logger.child('Authentication');
    
    if (this.config.enabled) {
      this.logger.info('Authentication middleware enabled', {
        allowAnonymous: this.config.allowAnonymous,
        configuredKeys: this.config.apiKeys.length,
        headerName: this.config.headerName
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
        permissions: ['*']
      };
    }

    const apiKey = this.extractApiKey(headers);
    
    if (!apiKey) {
      if (this.config.allowAnonymous) {
        this.logger.debug('Anonymous request allowed');
        return {
          isAuthenticated: false,
          permissions: ['read']
        };
      } else {
        this.logger.warn('Authentication required but no API key provided');
        throw new Error('Authentication required: API key missing');
      }
    }

    const isValid = this.validateApiKey(apiKey);
    
    if (!isValid) {
      this.logger.warn('Invalid API key provided', { 
        keyPrefix: apiKey.substring(0, 8) + '...' 
      });
      throw new Error('Authentication failed: Invalid API key');
    }

    const clientId = this.generateClientId(apiKey);
    
    this.logger.debug('Request authenticated successfully', { 
      clientId,
      keyPrefix: apiKey.substring(0, 8) + '...' 
    });

    return {
      isAuthenticated: true,
      apiKey,
      clientId,
      permissions: ['read', 'write', 'admin']
    };
  }

  /**
   * Extract API key from request headers
   */
  private extractApiKey(headers: Record<string, string>): string | undefined {
    const authHeader = headers[this.config.headerName.toLowerCase()] || 
                      headers['authorization'];

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
    return context.permissions.includes('*') || 
           context.permissions.includes(permission);
  }
}

/**
 * Create authentication middleware from environment
 */
export function createAuthMiddleware(logger: Logger): AuthenticationMiddleware {
  const config: AuthConfig = {
    enabled: process.env.AUTH_ENABLED === 'true',
    apiKeys: process.env.AUTH_API_KEYS ? 
             process.env.AUTH_API_KEYS.split(',').map(key => key.trim()) : [],
    allowAnonymous: process.env.AUTH_ALLOW_ANONYMOUS !== 'false',
    headerName: process.env.AUTH_HEADER_NAME || 'x-api-key'
  };

  return new AuthenticationMiddleware(config, logger);
}
