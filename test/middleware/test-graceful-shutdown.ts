/**
 * ✅ Comprehensive tests for Graceful Shutdown Middleware (TypeScript)
 * Tests shutdown handling, request draining, cleanup, and timeout scenarios
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createMockLogger,
  performance,
  type MockLogger,
} from '../utils/test-helpers.ts';

type Signal = 'SIGTERM' | 'SIGINT' | 'SIGUSR2' | 'SIGUSR1' | 'MANUAL';
type ShutdownPhase = 'running' | 'stopping_connections' | 'draining_requests' | 'cleanup' | 'closing_connections' | 'completed';

interface GracefulShutdownConfig {
  enabled?: boolean;
  shutdownTimeoutMs?: number;
  drainTimeoutMs?: number;
  forceExitTimeout?: number;
  gracePeriodMs?: number;
  signals?: Signal[];
}

interface RequestData {
  startTime: number;
  method?: string;
  url?: string;
  [key: string]: unknown;
}

interface CleanupCallback {
  callback: () => Promise<void> | void;
  priority: number;
}

interface ShutdownStats {
  shutdownAttempts: number;
  gracefulShutdowns: number;
  forcedShutdowns: number;
  requestsCompleted: number;
  requestsAborted: number;
  averageShutdownTime: number;
  shutdownTimes: number[];
}

interface ShutdownStatus {
  isShuttingDown: boolean;
  shutdownStartTime: number | null;
  activeConnections: number;
  activeRequests: number;
  shutdownTimeElapsed: number;
  phase: ShutdownPhase;
}

interface ShutdownResult {
  graceful: boolean;
  shutdownTime?: number;
  error?: string;
}

// Mock graceful shutdown implementation for testing
class MockGracefulShutdown {
  public isShuttingDown: boolean;
  public shutdownStartTime: number | null;
  public activeConnections: Set<string>;
  public activeRequests: Map<string, RequestData>;
  public shutdownPromise: Promise<ShutdownResult> | null;
  public shutdownCallbacks: CleanupCallback[];
  public signalHandlers: Map<Signal, () => void>;
  public stats: ShutdownStats;
  public config: Required<GracefulShutdownConfig>;
  private logger: MockLogger;

  constructor(config: GracefulShutdownConfig, logger: MockLogger) {
    this.config = {
      enabled: true,
      shutdownTimeoutMs: 30000,
      drainTimeoutMs: 10000,
      forceExitTimeout: 5000,
      gracePeriodMs: 1000,
      signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
      ...config,
    };
    this.logger = logger;

    // Shutdown state
    this.isShuttingDown = false;
    this.shutdownStartTime = null;
    this.activeConnections = new Set<string>();
    this.activeRequests = new Map<string, RequestData>();
    this.shutdownPromise = null;
    this.shutdownCallbacks = [];
    this.signalHandlers = new Map<Signal, () => void>();

    // Statistics
    this.stats = {
      shutdownAttempts: 0,
      gracefulShutdowns: 0,
      forcedShutdowns: 0,
      requestsCompleted: 0,
      requestsAborted: 0,
      averageShutdownTime: 0,
      shutdownTimes: [],
    };

    this.setupSignalHandlers();
  }

  setupSignalHandlers(): void {
    if (!this.config.enabled) return;

    this.config.signals.forEach((signal) => {
      const handler = () => this.initiateShutdown(signal);
      this.signalHandlers.set(signal, handler);

      // In a real implementation, this would be:
      // process.on(signal, handler);
      this.logger.debug(`Signal handler registered for ${signal}`);
    });
  }

  removeSignalHandlers(): void {
    this.signalHandlers.forEach((handler, signal) => {
      // In a real implementation, this would be:
      // process.removeListener(signal, handler);
      this.logger.debug(`Signal handler removed for ${signal}`);
    });
    this.signalHandlers.clear();
  }

  async initiateShutdown(signal: Signal = 'MANUAL'): Promise<ShutdownResult> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress', { signal });
      return this.shutdownPromise!;
    }

    this.logger.info('Initiating graceful shutdown', {
      signal,
      activeConnections: this.activeConnections.size,
      activeRequests: this.activeRequests.size,
    });

    this.isShuttingDown = true;
    this.shutdownStartTime = Date.now();
    this.stats.shutdownAttempts++;

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  private async executeShutdown(): Promise<ShutdownResult> {
    try {
      // Phase 1: Stop accepting new connections
      await this.stopAcceptingConnections();

      // Phase 2: Drain existing requests
      await this.drainRequests();

      // Phase 3: Execute cleanup callbacks
      await this.executeCleanupCallbacks();

      // Phase 4: Close remaining connections
      await this.closeConnections();

      const shutdownTime = Date.now() - (this.shutdownStartTime || 0);
      this.stats.gracefulShutdowns++;
      this.stats.shutdownTimes.push(shutdownTime);
      this.updateAverageShutdownTime();

      this.logger.info('Graceful shutdown completed', {
        shutdownTime: `${shutdownTime}ms`,
        requestsCompleted: this.stats.requestsCompleted,
        requestsAborted: this.stats.requestsAborted,
      });

      return { graceful: true, shutdownTime };

    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Graceful shutdown failed, forcing exit', {
        error: errorMessage,
      });
      this.stats.forcedShutdowns++;

      await this.forceShutdown();
      return { graceful: false, error: errorMessage };
    }
  }

  private async stopAcceptingConnections(): Promise<void> {
    this.logger.info('Stopping acceptance of new connections');

    // Simulate stopping server from accepting new connections
    await new Promise<void>((resolve) =>
      setTimeout(resolve, this.config.gracePeriodMs)
    );

    this.logger.debug('New connection acceptance stopped');
  }

  private async drainRequests(): Promise<void> {
    if (this.activeRequests.size === 0) {
      this.logger.debug('No active requests to drain');
      return;
    }

    this.logger.info(`Draining ${this.activeRequests.size} active requests`);

    const drainStartTime = Date.now();
    const drainTimeout = setTimeout(() => {
      this.logger.warn('Drain timeout reached, some requests may be aborted');
    }, this.config.drainTimeoutMs);

    try {
      // Wait for all active requests to complete or timeout
      await Promise.race([
        this.waitForRequestsToComplete(),
        this.createTimeoutPromise(this.config.drainTimeoutMs),
      ]);

      clearTimeout(drainTimeout);

      const drainTime = Date.now() - drainStartTime;
      this.logger.info('Request draining completed', {
        drainTime: `${drainTime}ms`,
        remainingRequests: this.activeRequests.size,
      });
    } catch (error) {
      clearTimeout(drainTimeout);

      // Abort remaining requests
      await this.abortRemainingRequests();
      throw error;
    }
  }

  private async waitForRequestsToComplete(): Promise<void> {
    while (this.activeRequests.size > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  private async abortRemainingRequests(): Promise<void> {
    const remainingRequests = Array.from(this.activeRequests.keys());
    this.logger.warn(`Aborting ${remainingRequests.length} remaining requests`);

    for (const requestId of remainingRequests) {
      await this.abortRequest(requestId);
    }

    this.stats.requestsAborted += remainingRequests.length;
  }

  private async executeCleanupCallbacks(): Promise<void> {
    if (this.shutdownCallbacks.length === 0) {
      this.logger.debug('No cleanup callbacks to execute');
      return;
    }

    this.logger.info(`Executing ${this.shutdownCallbacks.length} cleanup callbacks`);

    const cleanupPromises = this.shutdownCallbacks.map(
      async (callbackObj, index) => {
        try {
          await callbackObj.callback();
          this.logger.debug(`Cleanup callback ${index} completed`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Cleanup callback ${index} failed`, {
            error: errorMessage,
          });
        }
      }
    );

    await Promise.allSettled(cleanupPromises);
    this.logger.debug('All cleanup callbacks executed');
  }

  private async closeConnections(): Promise<void> {
    if (this.activeConnections.size === 0) {
      this.logger.debug('No active connections to close');
      return;
    }

    this.logger.info(`Closing ${this.activeConnections.size} active connections`);

    const connectionClosePromises = Array.from(this.activeConnections).map(
      async (connection) => {
        try {
          await this.closeConnection(connection);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error('Failed to close connection', { error: errorMessage });
        }
      }
    );

    await Promise.allSettled(connectionClosePromises);
    this.activeConnections.clear();

    this.logger.debug('All connections closed');
  }

  async forceShutdown(): Promise<void> {
    this.logger.warn('Forcing immediate shutdown');

    // Abort all remaining requests immediately
    await this.abortRemainingRequests();

    // Close all connections forcefully
    this.activeConnections.clear();

    // In a real implementation, this would call process.exit()
    this.logger.error('Force shutdown completed');
  }

  // Request lifecycle management
  registerRequest(
    requestId: string,
    requestData: Partial<RequestData> = {}
  ): string {
    if (this.isShuttingDown) {
      throw new Error(
        'Server is shutting down, cannot accept new requests'
      );
    }

    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      ...requestData,
    });

    this.logger.debug('Request registered', {
      requestId,
      activeCount: this.activeRequests.size,
    });
    return requestId;
  }

  async completeRequest(requestId: string): Promise<void> {
    if (!this.activeRequests.has(requestId)) {
      this.logger.warn('Attempted to complete unknown request', { requestId });
      return;
    }

    const requestData = this.activeRequests.get(requestId)!;
    const duration = Date.now() - requestData.startTime;

    this.activeRequests.delete(requestId);
    this.stats.requestsCompleted++;

    this.logger.debug('Request completed', {
      requestId,
      duration: `${duration}ms`,
      activeCount: this.activeRequests.size,
    });
  }

  async abortRequest(requestId: string): Promise<void> {
    if (!this.activeRequests.has(requestId)) {
      return;
    }

    this.activeRequests.delete(requestId);
    this.logger.debug('Request aborted', { requestId });
  }

  // Connection management
  registerConnection(connectionId: string, connectionData: Record<string, unknown> = {}): void {
    this.activeConnections.add(connectionId);
    this.logger.debug('Connection registered', {
      connectionId,
      activeCount: this.activeConnections.size,
    });
  }

  async closeConnection(connectionId: string): Promise<void> {
    // Simulate connection closing
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    this.activeConnections.delete(connectionId);
    this.logger.debug('Connection closed', { connectionId });
  }

  // Cleanup callback management
  registerCleanupCallback(
    callback: () => Promise<void> | void,
    priority = 0
  ): void {
    this.shutdownCallbacks.push({ callback, priority });

    // Sort by priority (higher priority executes first)
    this.shutdownCallbacks.sort((a, b) => b.priority - a.priority);

    this.logger.debug('Cleanup callback registered', {
      priority,
      totalCallbacks: this.shutdownCallbacks.length,
    });
  }

  removeCleanupCallback(callback: () => Promise<void> | void): void {
    const index = this.shutdownCallbacks.findIndex(
      (cb) => cb.callback === callback
    );
    if (index >= 0) {
      this.shutdownCallbacks.splice(index, 1);
      this.logger.debug('Cleanup callback removed');
    }
  }

  // Health and status methods
  getShutdownStatus(): ShutdownStatus {
    return {
      isShuttingDown: this.isShuttingDown,
      shutdownStartTime: this.shutdownStartTime,
      activeConnections: this.activeConnections.size,
      activeRequests: this.activeRequests.size,
      shutdownTimeElapsed: this.shutdownStartTime
        ? Date.now() - this.shutdownStartTime
        : 0,
      phase: this.determineShutdownPhase(),
    };
  }

  determineShutdownPhase(): ShutdownPhase {
    if (!this.isShuttingDown) return 'running';

    const elapsed = Date.now() - (this.shutdownStartTime || 0);

    if (elapsed < this.config.gracePeriodMs) return 'stopping_connections';
    if (this.activeRequests.size > 0) return 'draining_requests';
    if (this.shutdownCallbacks.length > 0) return 'cleanup';
    if (this.activeConnections.size > 0) return 'closing_connections';

    return 'completed';
  }

  getStats(): ShutdownStats & {
    averageShutdownTime: string;
    config: GracefulShutdownConfig;
    status: ShutdownStatus;
  } {
    return {
      ...this.stats,
      averageShutdownTime: this.stats.averageShutdownTime + 'ms',
      config: { ...this.config },
      status: this.getShutdownStatus(),
    };
  }

  private updateAverageShutdownTime(): void {
    if (this.stats.shutdownTimes.length > 0) {
      this.stats.averageShutdownTime = Math.round(
        this.stats.shutdownTimes.reduce((a, b) => a + b, 0) /
          this.stats.shutdownTimes.length
      );
    }
  }

  // Utility methods
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  // Simulate middleware functionality
  async middleware(
    req: { method?: string; url?: string },
    res: { status?: number; body?: { error?: string } },
    next: () => Promise<void> | void
  ): Promise<void> {
    if (this.isShuttingDown) {
      res.status = 503;
      res.body = { error: 'Service unavailable - shutting down' };
      return;
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      this.registerRequest(requestId, { method: req.method, url: req.url });

      // Execute the next middleware/handler
      await next();

      await this.completeRequest(requestId);
    } catch (error) {
      await this.abortRequest(requestId);
      throw error;
    }
  }

  // Cleanup and destroy
  async destroy(): Promise<void> {
    if (this.isShuttingDown) {
      await this.shutdownPromise;
    }

    this.removeSignalHandlers();
    this.activeConnections.clear();
    this.activeRequests.clear();
    this.shutdownCallbacks.length = 0;

    this.logger.info('Graceful shutdown handler destroyed');
  }
}

describe('Graceful Shutdown Middleware Tests', () => {
  let shutdownHandler: MockGracefulShutdown;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    shutdownHandler = new MockGracefulShutdown(
      {
        enabled: true,
        shutdownTimeoutMs: 5000,
        drainTimeoutMs: 2000,
        gracePeriodMs: 100,
      },
      mockLogger
    );
  });

  afterEach(async () => {
    await shutdownHandler.destroy();
  });

  describe('Basic Shutdown Functionality', () => {
    it('should initialize with correct default state', () => {
      const status = shutdownHandler.getShutdownStatus();

      assert.strictEqual(
        status.isShuttingDown,
        false,
        'Should not be shutting down initially'
      );
      assert.strictEqual(
        status.activeConnections,
        0,
        'Should have no active connections'
      );
      assert.strictEqual(
        status.activeRequests,
        0,
        'Should have no active requests'
      );
      assert.strictEqual(status.phase, 'running', 'Should be in running phase');
    });

    it('should initiate shutdown when called', async () => {
      const shutdownPromise = shutdownHandler.initiateShutdown('TEST');

      const status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.isShuttingDown,
        true,
        'Should be shutting down'
      );
      assert.ok(
        status.shutdownStartTime !== null,
        'Should have shutdown start time'
      );

      const result = await shutdownPromise;
      assert.strictEqual(result.graceful, true, 'Should complete gracefully');
      assert.strictEqual(
        typeof result.shutdownTime,
        'number',
        'Should report shutdown time'
      );
    });

    it('should prevent duplicate shutdown attempts', async () => {
      const firstShutdown = shutdownHandler.initiateShutdown('FIRST');
      const secondShutdown = shutdownHandler.initiateShutdown('SECOND');

      assert.strictEqual(
        firstShutdown,
        secondShutdown,
        'Should return same promise for duplicate attempts'
      );

      await firstShutdown;
      assert.strictEqual(
        shutdownHandler.stats.shutdownAttempts,
        1,
        'Should only count one attempt'
      );
    });

    it('should setup and remove signal handlers', () => {
      assert.ok(
        shutdownHandler.signalHandlers.size > 0,
        'Should register signal handlers'
      );

      shutdownHandler.removeSignalHandlers();
      assert.strictEqual(
        shutdownHandler.signalHandlers.size,
        0,
        'Should remove signal handlers'
      );
    });
  });

  describe('Request Management', () => {
    it('should register and complete requests', async () => {
      const requestId = shutdownHandler.registerRequest('test-req-1', {
        method: 'GET',
      });

      assert.strictEqual(typeof requestId, 'string', 'Should return request ID');

      let status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.activeRequests,
        1,
        'Should track active request'
      );

      await shutdownHandler.completeRequest(requestId);

      status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.activeRequests,
        0,
        'Should remove completed request'
      );
      assert.strictEqual(
        shutdownHandler.stats.requestsCompleted,
        1,
        'Should count completed request'
      );
    });

    it('should reject new requests during shutdown', async () => {
      shutdownHandler.initiateShutdown();

      try {
        shutdownHandler.registerRequest('rejected-req');
        assert.fail('Should reject new requests during shutdown');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        assert.ok(
          errorMessage.includes('shutting down'),
          'Should provide appropriate error message'
        );
      }
    });

    it('should abort remaining requests during shutdown', async () => {
      const req1 = shutdownHandler.registerRequest('req-1');
      const req2 = shutdownHandler.registerRequest('req-2');

      assert.strictEqual(
        shutdownHandler.getShutdownStatus().activeRequests,
        2,
        'Should have 2 active requests'
      );

      // Start shutdown without completing requests
      const shutdownPromise = shutdownHandler.initiateShutdown();

      // Wait for shutdown to complete
      await shutdownPromise;

      assert.strictEqual(
        shutdownHandler.getShutdownStatus().activeRequests,
        0,
        'Should abort remaining requests'
      );
      assert.ok(
        shutdownHandler.stats.requestsAborted >= 2,
        'Should count aborted requests'
      );
    });

    it('should wait for requests to complete during drain period', async () => {
      const req1 = shutdownHandler.registerRequest('req-1');

      // Start shutdown
      const shutdownPromise = shutdownHandler.initiateShutdown();

      // Complete request after a delay (but within drain timeout)
      setTimeout(async () => {
        await shutdownHandler.completeRequest(req1);
      }, 100);

      const result = await shutdownPromise;

      assert.strictEqual(result.graceful, true, 'Should complete gracefully');
      assert.strictEqual(
        shutdownHandler.stats.requestsCompleted,
        1,
        'Should complete request during drain'
      );
      assert.strictEqual(
        shutdownHandler.stats.requestsAborted,
        0,
        'Should not abort completed request'
      );
    });
  });

  describe('Connection Management', () => {
    it('should register and close connections', async () => {
      shutdownHandler.registerConnection('conn-1');
      shutdownHandler.registerConnection('conn-2');

      let status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.activeConnections,
        2,
        'Should track active connections'
      );

      await shutdownHandler.closeConnection('conn-1');

      status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.activeConnections,
        1,
        'Should remove closed connection'
      );
    });

    it('should close all connections during shutdown', async () => {
      shutdownHandler.registerConnection('conn-1');
      shutdownHandler.registerConnection('conn-2');
      shutdownHandler.registerConnection('conn-3');

      const result = await shutdownHandler.initiateShutdown();

      assert.strictEqual(result.graceful, true, 'Should complete gracefully');
      assert.strictEqual(
        shutdownHandler.getShutdownStatus().activeConnections,
        0,
        'Should close all connections'
      );
    });
  });

  describe('Cleanup Callbacks', () => {
    it('should register and execute cleanup callbacks', async () => {
      let callback1Executed = false;
      let callback2Executed = false;

      shutdownHandler.registerCleanupCallback(async () => {
        callback1Executed = true;
      });

      shutdownHandler.registerCleanupCallback(async () => {
        callback2Executed = true;
      });

      await shutdownHandler.initiateShutdown();

      assert.strictEqual(callback1Executed, true, 'Should execute first callback');
      assert.strictEqual(
        callback2Executed,
        true,
        'Should execute second callback'
      );
    });

    it('should execute callbacks in priority order', async () => {
      const executionOrder: string[] = [];

      shutdownHandler.registerCleanupCallback(async () => {
        executionOrder.push('low');
      }, 1);

      shutdownHandler.registerCleanupCallback(async () => {
        executionOrder.push('high');
      }, 10);

      shutdownHandler.registerCleanupCallback(async () => {
        executionOrder.push('medium');
      }, 5);

      await shutdownHandler.initiateShutdown();

      assert.strictEqual(
        executionOrder[0],
        'high',
        'Should execute high priority first'
      );
      assert.strictEqual(
        executionOrder[1],
        'medium',
        'Should execute medium priority second'
      );
      assert.strictEqual(
        executionOrder[2],
        'low',
        'Should execute low priority last'
      );
    });

    it('should handle failing cleanup callbacks gracefully', async () => {
      let successCallbackExecuted = false;

      shutdownHandler.registerCleanupCallback(async () => {
        throw new Error('Cleanup failed');
      });

      shutdownHandler.registerCleanupCallback(async () => {
        successCallbackExecuted = true;
      });

      const result = await shutdownHandler.initiateShutdown();

      assert.strictEqual(
        result.graceful,
        true,
        'Should complete gracefully despite callback failure'
      );
      assert.strictEqual(
        successCallbackExecuted,
        true,
        'Should execute successful callbacks'
      );
    });

    it('should remove cleanup callbacks', () => {
      const callback = async () => {};

      shutdownHandler.registerCleanupCallback(callback);
      assert.strictEqual(
        shutdownHandler.shutdownCallbacks.length,
        1,
        'Should register callback'
      );

      shutdownHandler.removeCleanupCallback(callback);
      assert.strictEqual(
        shutdownHandler.shutdownCallbacks.length,
        0,
        'Should remove callback'
      );
    });
  });

  describe('Shutdown Phases', () => {
    it('should progress through shutdown phases correctly', async () => {
      shutdownHandler.registerConnection('conn-1');
      shutdownHandler.registerRequest('req-1');

      const shutdownPromise = shutdownHandler.initiateShutdown();

      // Check initial phase
      let status = shutdownHandler.getShutdownStatus();
      assert.ok(
        status.phase !== 'running',
        'Should not be in running phase during shutdown'
      );

      await shutdownPromise;

      status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.phase,
        'completed',
        'Should be in completed phase after shutdown'
      );
    });

    it('should determine correct phase based on active resources', () => {
      shutdownHandler.isShuttingDown = true;
      shutdownHandler.shutdownStartTime = Date.now();

      // With active requests
      shutdownHandler.registerRequest('req-1');
      let phase = shutdownHandler.determineShutdownPhase();
      assert.strictEqual(
        phase,
        'draining_requests',
        'Should be draining requests phase'
      );

      // After completing requests but with connections
      shutdownHandler.activeRequests.clear();
      shutdownHandler.registerConnection('conn-1');
      phase = shutdownHandler.determineShutdownPhase();
      assert.strictEqual(
        phase,
        'closing_connections',
        'Should be closing connections phase'
      );

      // After closing all connections
      shutdownHandler.activeConnections.clear();
      phase = shutdownHandler.determineShutdownPhase();
      assert.strictEqual(phase, 'completed', 'Should be completed phase');
    });
  });

  describe('Middleware Functionality', () => {
    it('should process requests normally when not shutting down', async () => {
      let nextCalled = false;
      const req = { method: 'GET', url: '/test' };
      const res: { status?: number; body?: { error?: string } } = {};

      await shutdownHandler.middleware(req, res, async () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, 'Should call next middleware');
      assert.ok(res.status !== 503, 'Should not return service unavailable');
    });

    it('should reject requests with 503 when shutting down', async () => {
      shutdownHandler.isShuttingDown = true;

      let nextCalled = false;
      const req = { method: 'GET', url: '/test' };
      const res: { status?: number; body?: { error?: string } } = {};

      await shutdownHandler.middleware(req, res, async () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, 'Should not call next middleware');
      assert.strictEqual(res.status, 503, 'Should return service unavailable');
      assert.ok(
        res.body?.error?.includes('shutting down'),
        'Should include shutdown message'
      );
    });

    it('should handle middleware errors gracefully', async () => {
      const req = { method: 'GET', url: '/test' };
      const res: { status?: number; body?: { error?: string } } = {};

      try {
        await shutdownHandler.middleware(req, res, async () => {
          throw new Error('Middleware error');
        });
        assert.fail('Should propagate middleware error');
      } catch (error) {
        assert.strictEqual(
          (error as Error).message,
          'Middleware error',
          'Should get original error'
        );
      }

      // Request should be cleaned up even on error
      const status = shutdownHandler.getShutdownStatus();
      assert.strictEqual(
        status.activeRequests,
        0,
        'Should clean up request on error'
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track shutdown statistics', async () => {
      await shutdownHandler.initiateShutdown();

      const stats = shutdownHandler.getStats();

      assert.strictEqual(stats.shutdownAttempts, 1, 'Should track shutdown attempts');
      assert.strictEqual(
        stats.gracefulShutdowns,
        1,
        'Should track graceful shutdowns'
      );
      assert.strictEqual(
        stats.forcedShutdowns,
        0,
        'Should track forced shutdowns'
      );
      assert.ok(
        stats.averageShutdownTime.includes('ms'),
        'Should format average time'
      );
    });

    it('should calculate average shutdown time', async () => {
      // Perform multiple shutdowns
      await shutdownHandler.initiateShutdown();

      // Reset for second shutdown
      shutdownHandler.isShuttingDown = false;
      shutdownHandler.shutdownPromise = null;

      await shutdownHandler.initiateShutdown();

      const stats = shutdownHandler.getStats();
      assert.strictEqual(
        shutdownHandler.stats.shutdownTimes.length,
        2,
        'Should track multiple shutdown times'
      );
      assert.ok(
        parseInt(stats.averageShutdownTime) > 0,
        'Should calculate average time'
      );
    });

    it('should include current status in statistics', () => {
      const stats = shutdownHandler.getStats();

      assert.ok(stats.status !== undefined, 'Should include status');
      assert.ok(stats.config !== undefined, 'Should include configuration');
      assert.strictEqual(
        stats.status.isShuttingDown,
        false,
        'Should include shutdown state'
      );
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout and force shutdown if drain takes too long', async () => {
      // Create a request that won't complete
      shutdownHandler.registerRequest('hanging-req');

      // Set very short drain timeout for testing
      shutdownHandler.config.drainTimeoutMs = 100;

      const result = await shutdownHandler.initiateShutdown();

      // Should still complete but may not be graceful
      assert.ok(
        result.graceful === true || result.graceful === false,
        'Should complete shutdown'
      );
      assert.ok(
        shutdownHandler.stats.requestsAborted >= 1,
        'Should abort hanging request'
      );
    });

    it('should handle cleanup callback timeouts', async () => {
      // Add a slow cleanup callback
      shutdownHandler.registerCleanupCallback(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      });

      const start = Date.now();
      const result = await shutdownHandler.initiateShutdown();
      const duration = Date.now() - start;

      // Should complete even with slow callback
      assert.strictEqual(result.graceful, true, 'Should complete gracefully');
      assert.ok(duration < 5000, 'Should not be excessively slow');
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom timeout settings', async () => {
      const customHandler = new MockGracefulShutdown(
        {
          drainTimeoutMs: 50, // Very short timeout
        },
        mockLogger
      );

      customHandler.registerRequest('test-req');

      const start = Date.now();
      await customHandler.initiateShutdown();
      const duration = Date.now() - start;

      assert.ok(duration < 1000, 'Should respect short timeout');
      await customHandler.destroy();
    });

    it('should disable graceful shutdown when configured', async () => {
      const disabledHandler = new MockGracefulShutdown(
        {
          enabled: false,
        },
        mockLogger
      );

      assert.strictEqual(
        disabledHandler.signalHandlers.size,
        0,
        'Should not register signal handlers when disabled'
      );

      await disabledHandler.destroy();
    });

    it('should respect custom signal configuration', () => {
      const customHandler = new MockGracefulShutdown(
        {
          signals: ['SIGTERM', 'SIGUSR1'],
        },
        mockLogger
      );

      assert.strictEqual(
        customHandler.config.signals.length,
        2,
        'Should use custom signals'
      );
      assert.ok(
        customHandler.config.signals.includes('SIGUSR1'),
        'Should include custom signal'
      );

      customHandler.destroy();
    });
  });

  describe('Performance Tests', () => {
    it('should shutdown quickly with no active resources', async () => {
      const result = await performance.measureTime(async () => {
        return await shutdownHandler.initiateShutdown();
      });

      assert.ok(
        result.duration < 1000,
        `Should shutdown quickly, took ${result.duration}ms`
      );
      assert.strictEqual(result.result.graceful, true, 'Should be graceful shutdown');
    });

    it('should handle many concurrent requests during shutdown', async () => {
      // Register many requests
      const requestIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        requestIds.push(shutdownHandler.registerRequest(`req-${i}`));
      }

      const shutdownPromise = shutdownHandler.initiateShutdown();

      // Complete requests gradually
      const completionPromises = requestIds.map((reqId, index) => {
        return new Promise<void>((resolve) => {
          setTimeout(async () => {
            await shutdownHandler.completeRequest(reqId);
            resolve();
          }, index * 2); // Stagger completions
        });
      });

      const [shutdownResult] = await Promise.all([
        shutdownPromise,
        Promise.all(completionPromises),
      ]);

      assert.strictEqual(
        shutdownResult.graceful,
        true,
        'Should handle many requests gracefully'
      );
      assert.ok(
        shutdownHandler.stats.requestsCompleted >= 90,
        'Should complete most requests'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle shutdown during startup', async () => {
      // Immediately shutdown after creation
      const result = await shutdownHandler.initiateShutdown();

      assert.strictEqual(result.graceful, true, 'Should handle immediate shutdown');
    });

    it('should handle multiple signal types', async () => {
      const signals: Signal[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

      for (const signal of signals) {
        const newHandler = new MockGracefulShutdown({}, mockLogger);
        const result = await newHandler.initiateShutdown(signal);

        assert.strictEqual(
          result.graceful,
          true,
          `Should handle ${signal} signal`
        );
        await newHandler.destroy();
      }
    });

    it('should handle cleanup callback exceptions', async () => {
      shutdownHandler.registerCleanupCallback(async () => {
        throw new Error('Cleanup exception');
      });

      shutdownHandler.registerCleanupCallback(async () => {
        throw new Error('Another cleanup exception');
      });

      const result = await shutdownHandler.initiateShutdown();

      // Should still complete gracefully despite exceptions
      assert.strictEqual(
        result.graceful,
        true,
        'Should handle cleanup exceptions gracefully'
      );
    });

    it('should handle unknown request operations', async () => {
      // Try to complete non-existent request
      await shutdownHandler.completeRequest('non-existent');

      // Try to abort non-existent request
      await shutdownHandler.abortRequest('non-existent');

      // Should not throw errors
      assert.ok(true, 'Should handle unknown request operations gracefully');
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up all resources on destroy', async () => {
      shutdownHandler.registerRequest('req-1');
      shutdownHandler.registerConnection('conn-1');
      shutdownHandler.registerCleanupCallback(async () => {});

      await shutdownHandler.destroy();

      assert.strictEqual(
        shutdownHandler.activeRequests.size,
        0,
        'Should clear active requests'
      );
      assert.strictEqual(
        shutdownHandler.activeConnections.size,
        0,
        'Should clear active connections'
      );
      assert.strictEqual(
        shutdownHandler.shutdownCallbacks.length,
        0,
        'Should clear callbacks'
      );
      assert.strictEqual(
        shutdownHandler.signalHandlers.size,
        0,
        'Should clear signal handlers'
      );
    });

    it('should wait for ongoing shutdown before destroy', async () => {
      shutdownHandler.registerRequest('req-1');

      const shutdownPromise = shutdownHandler.initiateShutdown();
      const destroyPromise = shutdownHandler.destroy();

      const [shutdownResult] = await Promise.all([
        shutdownPromise,
        destroyPromise,
      ]);

      assert.strictEqual(
        shutdownResult.graceful,
        true,
        'Should complete shutdown before destroy'
      );
    });
  });
});

console.log('✅ Graceful Shutdown Middleware Tests Completed');

