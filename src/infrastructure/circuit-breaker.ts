/**
 * Circuit Breaker implementation for Legal MCP Server
 * Provides resilience against external service failures
 */

import { Logger } from './logger.js';

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringWindow: number;
}

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
  totalRequests: number;
  totalFailures: number;
  uptime: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private nextAttemptTime?: number;
  private totalRequests = 0;
  private totalFailures = 0;
  private startTime = Date.now();

  private logger: Logger;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig,
    logger: Logger,
  ) {
    this.logger = logger.child('CircuitBreaker');

    if (this.config.enabled) {
      this.logger.info('Circuit breaker initialized', {
        name: this.name,
        failureThreshold: this.config.failureThreshold,
        resetTimeout: this.config.resetTimeout,
      });
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return await operation();
    }

    this.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime!) {
        const error = new Error(
          `Circuit breaker '${this.name}' is OPEN. Next attempt at ${new Date(this.nextAttemptTime!)}`,
        );
        this.logger.debug('Circuit breaker blocking request', {
          name: this.name,
          state: this.state,
          nextAttemptTime: this.nextAttemptTime,
        });
        throw error;
      } else {
        // Move to half-open state
        this.state = CircuitState.HALF_OPEN;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN', {
          name: this.name,
        });
      }
    }

    try {
      const result = await Promise.race([operation(), this.createTimeoutPromise()]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        // Reset to closed state
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = undefined;
        this.nextAttemptTime = undefined;

        this.logger.info('Circuit breaker reset to CLOSED', {
          name: this.name,
          successCount: this.successCount,
        });
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    this.logger.warn('Circuit breaker recorded failure', {
      name: this.name,
      error: error.message,
      currentFailureCount: this.failureCount,
      state: this.state,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Immediately open on failure in half-open state
      this.openCircuit();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.openCircuit();
      }
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    this.successCount = 0;

    this.logger.error('Circuit breaker opened', undefined, {
      name: this.name,
      failures: this.failureCount,
      nextAttemptTime: this.nextAttemptTime,
    });
  }

  /**
   * Create a timeout promise for operations
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    const stats = this.getStats();

    // Consider healthy if:
    // - Circuit is closed, or
    // - Circuit is half-open with recent successes, or
    // - Failure rate is below threshold
    if (stats.state === CircuitState.CLOSED) {
      return true;
    }

    if (stats.state === CircuitState.HALF_OPEN && stats.successCount > 0) {
      return true;
    }

    if (stats.totalRequests > 0) {
      const failureRate = stats.totalFailures / stats.totalRequests;
      return failureRate < this.config.failureThreshold / 100;
    }

    return false;
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;

    this.logger.info('Circuit breaker manually reset', {
      name: this.name,
    });
  }
}

/**
 * Circuit Breaker Manager to handle multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child('CircuitBreakerManager');
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, config, this.logger);
      this.breakers.set(name, breaker);
    }

    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};

    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }

    return stats;
  }

  /**
   * Check if all circuit breakers are healthy
   */
  areAllHealthy(): boolean {
    for (const breaker of this.breakers.values()) {
      if (!breaker.isHealthy()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }

    this.logger.info('All circuit breakers reset');
  }
}

/**
 * Create circuit breaker configuration from environment
 */
export function createCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    enabled: process.env.CIRCUIT_BREAKER_ENABLED === 'true',
    failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3'),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000'),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000'),
    monitoringWindow: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_WINDOW || '300000'),
  };
}
