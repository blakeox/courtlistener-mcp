/**
 * Configuration Validation System
 * Provides schema validation and runtime validation for all configurations
 */

import { ServerConfig, CourtListenerConfig, CacheConfig, LogConfig } from '../types.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigValidator {
  validate(config: unknown): ValidationResult;
}

export class CourtListenerConfigValidator implements ConfigValidator {
  validate(config: CourtListenerConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!config.baseUrl) {
      errors.push('CourtListener baseUrl is required');
    } else if (!config.baseUrl.startsWith('http')) {
      errors.push('CourtListener baseUrl must be a valid HTTP/HTTPS URL');
    }

    if (!config.version) {
      errors.push('CourtListener API version is required');
    }

    // Numeric validations
    if (config.timeout < 1000) {
      errors.push('CourtListener timeout must be at least 1000ms');
    } else if (config.timeout > 60000) {
      warnings.push('CourtListener timeout is very high (>60s), consider reducing');
    }

    if (config.retryAttempts < 0) {
      errors.push('CourtListener retryAttempts cannot be negative');
    } else if (config.retryAttempts > 10) {
      warnings.push('CourtListener retryAttempts is very high (>10), consider reducing');
    }

    if (config.rateLimitPerMinute <= 0) {
      errors.push('CourtListener rateLimitPerMinute must be positive');
    } else if (config.rateLimitPerMinute > 1000) {
      warnings.push('CourtListener rateLimitPerMinute is very high (>1000), verify API limits');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export class CacheConfigValidator implements ConfigValidator {
  validate(config: CacheConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (config.ttl < 0) {
      errors.push('Cache TTL cannot be negative');
    } else if (config.ttl > 3600) {
      warnings.push('Cache TTL is very high (>1 hour), consider reducing for fresh data');
    }

    if (config.maxSize <= 0) {
      errors.push('Cache maxSize must be positive');
    } else if (config.maxSize > 10000) {
      warnings.push('Cache maxSize is very high (>10000), monitor memory usage');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export class LogConfigValidator implements ConfigValidator {
  validate(config: LogConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(config.level)) {
      errors.push(`Log level must be one of: ${validLevels.join(', ')}`);
    }

    const validFormats = ['json', 'text'];
    if (!validFormats.includes(config.format)) {
      errors.push(`Log format must be one of: ${validFormats.join(', ')}`);
    }

    if (config.level === 'debug' && config.enabled) {
      warnings.push('Debug logging enabled, this may impact performance in production');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export class ServerConfigValidator implements ConfigValidator {
  private validators: Map<string, ConfigValidator>;

  constructor() {
    this.validators = new Map<string, ConfigValidator>([
      ['courtListener', new CourtListenerConfigValidator()],
      ['cache', new CacheConfigValidator()],
      ['logging', new LogConfigValidator()],
    ]);
  }

  validate(config: ServerConfig): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Validate each section
    for (const [section, validator] of this.validators) {
      const sectionConfig = (config as unknown as Record<string, unknown>)[section];
      if (!sectionConfig) {
        allErrors.push(`Configuration section '${section}' is missing`);
        continue;
      }

      const result = validator.validate(sectionConfig);

      // Prefix errors and warnings with section name
      allErrors.push(...result.errors.map((error) => `[${section}] ${error}`));
      allWarnings.push(...result.warnings.map((warning) => `[${section}] ${warning}`));
    }

    // Cross-section validations
    this.validateCrossSections(config, allErrors, allWarnings);

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }

  private validateCrossSections(config: ServerConfig, errors: string[], warnings: string[]): void {
    // Check if debug logging is enabled in production
    if (process.env.NODE_ENV === 'production' && config.logging.level === 'debug') {
      warnings.push('Debug logging should not be used in production');
    }

    // Check if caching is disabled with high rate limits
    if (!config.cache.enabled && config.courtListener.rateLimitPerMinute > 100) {
      warnings.push('High rate limits without caching may impact performance');
    }

    // Check security configurations
    if (config.security) {
      if (config.security.authEnabled && config.security.apiKeys.length === 0) {
        errors.push('Authentication enabled but no API keys configured');
      }

      if (config.security.allowAnonymous && config.security.authEnabled) {
        warnings.push(
          'Anonymous access allowed with authentication enabled - verify this is intentional',
        );
      }
    }
  }
}

/**
 * Environment-specific configuration validation
 */
export class EnvironmentConfigValidator {
  validateEnvironment(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check Node.js version
    const nodeVersion = process.version;
    const versionPart = nodeVersion.split('.')[0];
    const majorVersion = versionPart ? parseInt(versionPart.substring(1)) : 0;

    if (majorVersion < 18) {
      errors.push(`Node.js version ${nodeVersion} is not supported. Minimum version is 18.0.0`);
    }

    // Check environment variables
    const requiredEnvVars: string[] = [];
    const _optionalEnvVars = [
      'COURTLISTENER_BASE_URL',
      'LOG_LEVEL',
      'CACHE_ENABLED',
      'METRICS_ENABLED',
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        errors.push(`Required environment variable ${envVar} is not set`);
      }
    }

    // Check for conflicting environment settings
    if (process.env.NODE_ENV === 'production') {
      if (process.env.LOG_LEVEL === 'debug') {
        warnings.push('Debug logging enabled in production environment');
      }

      if (process.env.CACHE_ENABLED === 'false') {
        warnings.push('Caching disabled in production environment');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Main configuration validation facade
 */
export class ConfigurationValidator {
  private serverValidator = new ServerConfigValidator();
  private environmentValidator = new EnvironmentConfigValidator();

  validateAll(config: ServerConfig): ValidationResult {
    const serverResult = this.serverValidator.validate(config);
    const envResult = this.environmentValidator.validateEnvironment();

    return {
      isValid: serverResult.isValid && envResult.isValid,
      errors: [...serverResult.errors, ...envResult.errors],
      warnings: [...serverResult.warnings, ...envResult.warnings],
    };
  }

  validateAndThrow(config: ServerConfig): void {
    const result = this.validateAll(config);

    if (!result.isValid) {
      const errorMessage = `Configuration validation failed:\n${result.errors.join('\n')}`;
      throw new Error(errorMessage);
    }

    if (result.warnings.length > 0) {
      console.warn('Configuration warnings:');
      result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
    }
  }
}
