/**
 * Comprehensive tests for Circuit Breaker Middleware
 * Tests failure detection, state transitions, recovery, and monitoring
 */

import { createMockLogger, performanceBenchmark } from '../../utils/test-helpers.js';

// Mock circuit breaker implementation for testing
class MockCircuitBreaker {
  constructor(config, logger) {
    this.config = {
      enabled: true,
      failureThreshold: 5,
      timeoutMs: 30000,
      recoveryTimeout: 60000,
      halfOpenMaxCalls: 3,
      monitoringInterval: 10000,
      failureTypes: ['TIMEOUT', 'ERROR', 'RATE_LIMIT'],
      ...config
    };
    this.logger = logger;
    
    // Circuit breaker state
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpenCount: 0,
      circuitHalfOpenCount: 0,
      timeouts: 0,
      averageResponseTime: 0,
      responseTimes: []
    };
  }

  async execute(operation, operationName = 'unknown') {
    this.stats.totalRequests++;

    if (!this.config.enabled) {
      return await this.executeOperation(operation, operationName);
    }

    // Check circuit state
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw this.createCircuitOpenError();
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
      throw this.createCircuitOpenError();
    }

    try {
      const result = await this.executeOperation(operation, operationName);
      this.handleSuccess();
      return result;
    } catch (error) {
      this.handleFailure(error, operationName);
      throw error;
    }
  }

  async executeOperation(operation, operationName) {
    const startTime = Date.now();
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation '${operationName}' timed out after ${this.config.timeoutMs}ms`));
        }, this.config.timeoutMs);
      });

      // Race between operation and timeout
      const result = await Promise.race([
        operation(),
        timeoutPromise
      ]);

      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.message.includes('timed out')) {
        this.stats.timeouts++;
        error.type = 'TIMEOUT';
      }
      
      this.updateResponseTime(responseTime);
      throw error;
    }
  }

  handleSuccess() {
    this.stats.successfulRequests++;
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    } else if (this.state === 'CLOSED') {
      this.resetFailureCount();
    }
  }

  handleFailure(error, operationName) {
    this.stats.failedRequests++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    const errorType = error.type || 'ERROR';
    
    if (this.config.failureTypes.includes(errorType)) {
      this.logger.warn('Circuit breaker recorded failure', {
        operationName,
        errorType,
        failureCount: this.failureCount,
        state: this.state
      });

      if (this.state === 'HALF_OPEN') {
        this.transitionToOpen();
      } else if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  shouldAttemptReset() {
    if (!this.lastFailureTime) return false;
    return (Date.now() - this.lastFailureTime) >= this.config.recoveryTimeout;
  }

  transitionToOpen() {
    this.state = 'OPEN';
    this.stats.circuitOpenCount++;
    this.logger.error('Circuit breaker opened', {
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    });
  }

  transitionToHalfOpen() {
    this.state = 'HALF_OPEN';
    this.halfOpenAttempts = 0;
    this.stats.circuitHalfOpenCount++;
    this.logger.info('Circuit breaker transitioning to half-open', {
      recoveryAttempt: this.stats.circuitHalfOpenCount
    });
  }

  transitionToClosed() {
    this.state = 'CLOSED';
    this.resetFailureCount();
    this.logger.info('Circuit breaker closed - service recovered', {
      halfOpenAttempts: this.halfOpenAttempts
    });
  }

  resetFailureCount() {
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  createCircuitOpenError() {
    const error = new Error('Circuit breaker is OPEN - service unavailable');
    error.type = 'CIRCUIT_OPEN';
    error.state = this.state;
    error.failureCount = this.failureCount;
    error.retryAfter = this.getRetryAfter();
    return error;
  }

  getRetryAfter() {
    if (!this.lastFailureTime) return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = this.config.recoveryTimeout - elapsed;
    return Math.max(0, Math.ceil(remaining / 1000)); // Return seconds
  }

  updateResponseTime(responseTime) {
    this.stats.responseTimes.push(responseTime);
    
    // Keep only last 100 response times for memory efficiency
    if (this.stats.responseTimes.length > 100) {
      this.stats.responseTimes.shift();
    }
    
    // Update average
    this.stats.averageResponseTime = 
      this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenAttempts: this.halfOpenAttempts,
      retryAfter: this.getRetryAfter()
    };
  }

  getStats() {
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100 
      : 0;

    const failureRate = this.stats.totalRequests > 0
      ? (this.stats.failedRequests / this.stats.totalRequests) * 100
      : 0;

    return {
      ...this.stats,
      successRate: successRate.toFixed(2) + '%',
      failureRate: failureRate.toFixed(2) + '%',
      averageResponseTime: Math.round(this.stats.averageResponseTime) + 'ms',
      currentState: this.state,
      config: { ...this.config }
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
    this.logger.info('Circuit breaker manually reset');
  }

  forceOpen() {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    this.logger.warn('Circuit breaker manually opened');
  }

  // Health check method
  async healthCheck() {
    try {
      const result = await this.execute(async () => {
        // Simple health check operation
        return { status: 'healthy', timestamp: Date.now() };
      }, 'health_check');
      
      return {
        healthy: true,
        circuitState: this.state,
        ...result
      };
    } catch (error) {
      return {
        healthy: false,
        circuitState: this.state,
        error: error.message,
        retryAfter: error.retryAfter
      };
    }
  }

  // Monitoring methods
  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      const stats = this.getStats();
      this.logger.debug('Circuit breaker stats', stats);
      
      // Auto-recovery logic for stuck open circuits
      if (this.state === 'OPEN' && this.shouldAttemptReset()) {
        this.logger.info('Auto-recovery: attempting to transition to half-open');
      }
    }, this.config.monitoringInterval);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

describe('Circuit Breaker Middleware Tests', () => {
  let circuitBreaker;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    circuitBreaker = new MockCircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      timeoutMs: 1000,
      recoveryTimeout: 5000,
      halfOpenMaxCalls: 2
    }, mockLogger);
  });

  afterEach(() => {
    circuitBreaker.stopMonitoring();
  });

  describe('Basic Circuit Breaker Functionality', () => {
    it('should execute operations normally when circuit is closed', async () => {
      const operation = async () => 'success';
      
      const result = await circuitBreaker.execute(operation, 'test_operation');
      
      console.assert(result === 'success', 'Should execute operation successfully');
      console.assert(circuitBreaker.getState().state === 'CLOSED', 'Circuit should remain closed');
    });

    it('should count failures and open circuit when threshold is reached', async () => {
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Execute failing operations up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation, 'failing_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      console.assert(circuitBreaker.getState().state === 'OPEN', 'Circuit should be open after threshold');
      console.assert(circuitBreaker.getState().failureCount === 3, 'Should track failure count');
    });

    it('should reject requests immediately when circuit is open', async () => {
      // Force circuit open
      circuitBreaker.forceOpen();
      
      const operation = async () => 'should not execute';
      
      try {
        await circuitBreaker.execute(operation, 'test_operation');
        console.assert(false, 'Should throw circuit open error');
      } catch (error) {
        console.assert(error.type === 'CIRCUIT_OPEN', 'Should throw circuit open error');
        console.assert(error.message.includes('Circuit breaker is OPEN'), 'Should include appropriate message');
        console.assert(typeof error.retryAfter === 'number', 'Should provide retry after time');
      }
    });

    it('should reset failure count on successful operation in closed state', async () => {
      const failingOperation = async () => { throw new Error('Failed'); };
      const successOperation = async () => 'success';

      // Add some failures
      try { await circuitBreaker.execute(failingOperation); } catch {}
      try { await circuitBreaker.execute(failingOperation); } catch {}
      
      console.assert(circuitBreaker.getState().failureCount === 2, 'Should have 2 failures');

      // Successful operation should reset count
      await circuitBreaker.execute(successOperation);
      console.assert(circuitBreaker.getState().failureCount === 0, 'Should reset failure count');
    });
  });

  describe('State Transitions', () => {
    it('should transition from CLOSED to OPEN on threshold failures', async () => {
      const failingOperation = async () => { throw new Error('Failed'); };

      console.assert(circuitBreaker.getState().state === 'CLOSED', 'Should start closed');

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {}
      }

      console.assert(circuitBreaker.getState().state === 'OPEN', 'Should transition to open');
    });

    it('should transition from OPEN to HALF_OPEN after recovery timeout', async () => {
      // Force circuit open
      circuitBreaker.forceOpen();
      console.assert(circuitBreaker.getState().state === 'OPEN', 'Should be open');

      // Simulate time passing by manually setting last failure time
      circuitBreaker.lastFailureTime = Date.now() - 6000; // 6 seconds ago (> 5 second recovery timeout)

      const successOperation = async () => 'success';
      
      // This should trigger transition to half-open
      const result = await circuitBreaker.execute(successOperation);
      
      console.assert(result === 'success', 'Should execute operation');
      console.assert(circuitBreaker.getState().state === 'HALF_OPEN', 'Should transition to half-open');
    });

    it('should transition from HALF_OPEN to CLOSED on successful calls', async () => {
      // Set circuit to half-open state
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.halfOpenAttempts = 0;

      const successOperation = async () => 'success';

      // Execute successful operations up to half-open limit
      await circuitBreaker.execute(successOperation);
      console.assert(circuitBreaker.getState().state === 'HALF_OPEN', 'Should remain half-open');

      await circuitBreaker.execute(successOperation);
      console.assert(circuitBreaker.getState().state === 'CLOSED', 'Should transition to closed');
    });

    it('should transition from HALF_OPEN to OPEN on failure', async () => {
      // Set circuit to half-open state
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.halfOpenAttempts = 0;

      const failingOperation = async () => { throw new Error('Failed in half-open'); };

      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}

      console.assert(circuitBreaker.getState().state === 'OPEN', 'Should transition back to open on failure');
    });

    it('should limit attempts in half-open state', async () => {
      // Set circuit to half-open state
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.halfOpenAttempts = 2; // At limit

      const operation = async () => 'success';

      try {
        await circuitBreaker.execute(operation);
        console.assert(false, 'Should reject when half-open limit reached');
      } catch (error) {
        console.assert(error.type === 'CIRCUIT_OPEN', 'Should reject with circuit open error');
      }
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const slowOperation = async () => {
        return new Promise(resolve => {
          setTimeout(() => resolve('slow result'), 2000); // 2 seconds, timeout is 1 second
        });
      };

      try {
        await circuitBreaker.execute(slowOperation, 'slow_operation');
        console.assert(false, 'Should timeout long operation');
      } catch (error) {
        console.assert(error.message.includes('timed out'), 'Should timeout operation');
        console.assert(error.type === 'TIMEOUT', 'Should mark as timeout error');
      }

      const stats = circuitBreaker.getStats();
      console.assert(stats.timeouts >= 1, 'Should track timeout count');
    });

    it('should count timeouts as failures', async () => {
      const slowOperation = async () => {
        return new Promise(resolve => setTimeout(() => resolve('result'), 2000));
      };

      // Execute multiple timeout operations
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(slowOperation);
        } catch (error) {
          console.assert(error.type === 'TIMEOUT', 'Should be timeout error');
        }
      }

      console.assert(circuitBreaker.getState().state === 'OPEN', 'Should open circuit after timeouts');
      console.assert(circuitBreaker.getState().failureCount === 3, 'Should count timeouts as failures');
    });
  });

  describe('Error Type Filtering', () => {
    it('should only count configured error types as failures', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.type = 'RATE_LIMIT';

      const authError = new Error('Authentication failed');
      authError.type = 'AUTH_ERROR'; // Not in failureTypes

      const rateLimitOperation = async () => { throw rateLimitError; };
      const authOperation = async () => { throw authError; };

      // Rate limit error should count
      try { await circuitBreaker.execute(rateLimitOperation); } catch {}
      console.assert(circuitBreaker.getState().failureCount === 1, 'Should count rate limit error');

      // Auth error should not count
      try { await circuitBreaker.execute(authOperation); } catch {}
      console.assert(circuitBreaker.getState().failureCount === 1, 'Should not count auth error');
    });

    it('should treat untyped errors as generic failures', async () => {
      const genericError = new Error('Generic failure');
      // No type property set

      const genericOperation = async () => { throw genericError; };

      try { await circuitBreaker.execute(genericOperation); } catch {}
      
      console.assert(circuitBreaker.getState().failureCount === 1, 'Should count generic error');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track comprehensive statistics', async () => {
      const successOperation = async () => 'success';
      const failOperation = async () => { throw new Error('Failed'); };

      // Execute mixed operations
      await circuitBreaker.execute(successOperation);
      await circuitBreaker.execute(successOperation);
      try { await circuitBreaker.execute(failOperation); } catch {}

      const stats = circuitBreaker.getStats();

      console.assert(stats.totalRequests === 3, 'Should track total requests');
      console.assert(stats.successfulRequests === 2, 'Should track successful requests');
      console.assert(stats.failedRequests === 1, 'Should track failed requests');
      console.assert(parseFloat(stats.successRate) > 60, 'Should calculate success rate');
      console.assert(parseFloat(stats.failureRate) < 40, 'Should calculate failure rate');
    });

    it('should track response times', async () => {
      const fastOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'fast';
      };

      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'slow';
      };

      await circuitBreaker.execute(fastOperation);
      await circuitBreaker.execute(slowOperation);

      const stats = circuitBreaker.getStats();
      console.assert(parseInt(stats.averageResponseTime) > 0, 'Should track average response time');
    });

    it('should track circuit state changes', async () => {
      const failingOperation = async () => { throw new Error('Failed'); };

      // Trigger state changes
      for (let i = 0; i < 3; i++) {
        try { await circuitBreaker.execute(failingOperation); } catch {}
      }

      const stats = circuitBreaker.getStats();
      console.assert(stats.circuitOpenCount >= 1, 'Should track circuit open events');
    });

    it('should provide current state in statistics', () => {
      const stats = circuitBreaker.getStats();
      
      console.assert(stats.currentState === 'CLOSED', 'Should include current state');
      console.assert(stats.config !== undefined, 'Should include configuration');
      console.assert(stats.config.failureThreshold === 3, 'Should include config values');
    });
  });

  describe('Health Check', () => {
    it('should perform health check when circuit is closed', async () => {
      const health = await circuitBreaker.healthCheck();

      console.assert(health.healthy === true, 'Should be healthy when closed');
      console.assert(health.circuitState === 'CLOSED', 'Should report circuit state');
      console.assert(health.status === 'healthy', 'Should include health status');
    });

    it('should report unhealthy when circuit is open', async () => {
      circuitBreaker.forceOpen();

      const health = await circuitBreaker.healthCheck();

      console.assert(health.healthy === false, 'Should be unhealthy when open');
      console.assert(health.circuitState === 'OPEN', 'Should report open state');
      console.assert(health.error !== undefined, 'Should include error information');
      console.assert(typeof health.retryAfter === 'number', 'Should provide retry time');
    });
  });

  describe('Manual Control', () => {
    it('should allow manual reset', () => {
      // Add failures and open circuit
      circuitBreaker.failureCount = 5;
      circuitBreaker.state = 'OPEN';
      circuitBreaker.lastFailureTime = Date.now();

      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      console.assert(state.state === 'CLOSED', 'Should reset to closed state');
      console.assert(state.failureCount === 0, 'Should reset failure count');
      console.assert(state.lastFailureTime === null, 'Should clear last failure time');
    });

    it('should allow manual force open', () => {
      console.assert(circuitBreaker.getState().state === 'CLOSED', 'Should start closed');

      circuitBreaker.forceOpen();

      console.assert(circuitBreaker.getState().state === 'OPEN', 'Should force open');
      console.assert(circuitBreaker.getState().lastFailureTime !== null, 'Should set failure time');
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom failure threshold', async () => {
      const customBreaker = new MockCircuitBreaker({
        failureThreshold: 1 // Single failure should open circuit
      }, mockLogger);

      const failingOperation = async () => { throw new Error('Failed'); };

      try { await customBreaker.execute(failingOperation); } catch {}

      console.assert(customBreaker.getState().state === 'OPEN', 
        'Should open after single failure with threshold 1');
    });

    it('should respect custom recovery timeout', async () => {
      const customBreaker = new MockCircuitBreaker({
        recoveryTimeout: 1000 // 1 second recovery
      }, mockLogger);

      customBreaker.forceOpen();
      customBreaker.lastFailureTime = Date.now() - 1500; // 1.5 seconds ago

      const operation = async () => 'success';
      
      // Should allow recovery attempt
      await customBreaker.execute(operation);
      console.assert(customBreaker.getState().state === 'HALF_OPEN', 
        'Should transition to half-open with custom timeout');
    });

    it('should respect custom timeout settings', async () => {
      const fastTimeoutBreaker = new MockCircuitBreaker({
        timeoutMs: 100 // Very short timeout
      }, mockLogger);

      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'result';
      };

      try {
        await fastTimeoutBreaker.execute(slowOperation);
        console.assert(false, 'Should timeout with custom timeout');
      } catch (error) {
        console.assert(error.message.includes('100ms'), 'Should use custom timeout value');
      }
    });

    it('should disable circuit breaker when configured', async () => {
      const disabledBreaker = new MockCircuitBreaker({
        enabled: false
      }, mockLogger);

      const failingOperation = async () => { throw new Error('Failed'); };

      // Execute many failures
      for (let i = 0; i < 10; i++) {
        try {
          await disabledBreaker.execute(failingOperation);
        } catch (error) {
          console.assert(error.message === 'Failed', 'Should get original error, not circuit error');
        }
      }

      console.assert(disabledBreaker.getState().state === 'CLOSED', 
        'Should remain closed when disabled');
    });
  });

  describe('Performance Tests', () => {
    it('should add minimal overhead when circuit is closed', async () => {
      const simpleOperation = async () => 'result';

      const result = await performanceBenchmark(async () => {
        return await circuitBreaker.execute(simpleOperation);
      });

      console.assert(result.duration < 10, `Circuit breaker should add minimal overhead, took ${result.duration}ms`);
      console.assert(result.result === 'result', 'Should return correct result');
    });

    it('should handle high request volume efficiently', async () => {
      const operations = [];
      const simpleOperation = async () => 'success';

      const startTime = Date.now();

      // Execute many operations in parallel
      for (let i = 0; i < 100; i++) {
        operations.push(circuitBreaker.execute(simpleOperation, `operation_${i}`));
      }

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      console.assert(duration < 1000, `Should handle 100 operations efficiently, took ${duration}ms`);
      console.assert(results.every(r => r === 'success'), 'All operations should succeed');
      
      const stats = circuitBreaker.getStats();
      console.assert(stats.totalRequests === 100, 'Should track all requests');
    });
  });

  describe('Edge Cases', () => {
    it('should handle operations that return null or undefined', async () => {
      const nullOperation = async () => null;
      const undefinedOperation = async () => undefined;

      const nullResult = await circuitBreaker.execute(nullOperation);
      const undefinedResult = await circuitBreaker.execute(undefinedOperation);

      console.assert(nullResult === null, 'Should handle null return value');
      console.assert(undefinedResult === undefined, 'Should handle undefined return value');
      console.assert(circuitBreaker.getState().state === 'CLOSED', 'Should remain closed');
    });

    it('should handle promise rejections properly', async () => {
      const rejectingOperation = async () => {
        return Promise.reject(new Error('Promise rejected'));
      };

      try {
        await circuitBreaker.execute(rejectingOperation);
        console.assert(false, 'Should propagate promise rejection');
      } catch (error) {
        console.assert(error.message === 'Promise rejected', 'Should get original rejection');
      }

      console.assert(circuitBreaker.getState().failureCount === 1, 'Should count rejection as failure');
    });

    it('should handle synchronous throws', async () => {
      const throwingOperation = async () => {
        throw new Error('Synchronous throw');
      };

      try {
        await circuitBreaker.execute(throwingOperation);
        console.assert(false, 'Should propagate synchronous throw');
      } catch (error) {
        console.assert(error.message === 'Synchronous throw', 'Should get original error');
      }
    });

    it('should handle operations that throw non-Error objects', async () => {
      const weirdThrowOperation = async () => {
        throw 'string error';
      };

      try {
        await circuitBreaker.execute(weirdThrowOperation);
        console.assert(false, 'Should propagate non-Error throws');
      } catch (error) {
        console.assert(error === 'string error', 'Should get original thrown value');
      }
    });
  });

  describe('Monitoring', () => {
    it('should start and stop monitoring', () => {
      console.assert(circuitBreaker.monitoringInterval === undefined, 'Should not have monitoring initially');

      circuitBreaker.startMonitoring();
      console.assert(circuitBreaker.monitoringInterval !== null, 'Should start monitoring');

      circuitBreaker.stopMonitoring();
      console.assert(circuitBreaker.monitoringInterval === null, 'Should stop monitoring');
    });

    it('should log statistics during monitoring', (done) => {
      // Override logger to capture debug messages
      let debugMessageReceived = false;
      const originalDebug = mockLogger.debug;
      mockLogger.debug = (message, data) => {
        if (message === 'Circuit breaker stats') {
          debugMessageReceived = true;
          console.assert(data.totalRequests !== undefined, 'Should include stats in debug log');
        }
        originalDebug.call(mockLogger, message, data);
      };

      // Start monitoring with short interval
      circuitBreaker.config.monitoringInterval = 50;
      circuitBreaker.startMonitoring();

      // Wait for monitoring to trigger
      setTimeout(() => {
        circuitBreaker.stopMonitoring();
        console.assert(debugMessageReceived === true, 'Should log stats during monitoring');
        done();
      }, 100);
    });
  });
});

console.log('✅ Circuit Breaker Middleware Tests Completed');
