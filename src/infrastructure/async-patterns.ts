/**
 * Async Pattern Optimizations
 * Advanced patterns for improved performance and concurrency
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: any types required for generic Promise/Queue patterns that can't be typed more strictly

import { Logger } from './logger.js';
import { cryptoId } from '../common/utils.js'; /**
 * Connection Pool Manager
 * Manages HTTP connection reuse for improved performance
 */
export class ConnectionPoolManager {
  private pools = new Map<string, ConnectionPool>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child('ConnectionPool');
  }

  getPool(hostname: string, options: ConnectionPoolOptions = {}): ConnectionPool {
    const poolKey = `${hostname}:${options.port || 443}`;

    let pool = this.pools.get(poolKey);
    if (!pool) {
      this.logger.info('Creating new connection pool', { hostname, poolKey });
      pool = new ConnectionPool(hostname, options, this.logger);
      this.pools.set(poolKey, pool);
    }

    return pool;
  }

  async closeAll(): Promise<void> {
    this.logger.info('Closing all connection pools', {
      poolCount: this.pools.size,
    });

    await Promise.all(Array.from(this.pools.values()).map((pool) => pool.close()));

    this.pools.clear();
  }

  getStats(): ConnectionPoolStats {
    const stats: ConnectionPoolStats = {
      totalPools: this.pools.size,
      pools: {},
    };

    this.pools.forEach((pool, key) => {
      stats.pools[key] = pool.getStats();
    });

    return stats;
  }
}

/**
 * Individual Connection Pool
 */
export class ConnectionPool {
  private connections: PooledConnection[] = [];
  private activeConnections = new Set<PooledConnection>();
  private waitQueue: ConnectionRequest[] = [];
  private options: Required<ConnectionPoolOptions>;
  private logger: Logger;
  private closed = false;

  constructor(
    private hostname: string,
    options: ConnectionPoolOptions = {},
    logger: Logger,
  ) {
    this.options = {
      maxConnections: options.maxConnections || 10,
      maxIdleTime: options.maxIdleTime || 30000,
      connectionTimeout: options.connectionTimeout || 5000,
      port: options.port || 443,
      keepAlive: options.keepAlive !== false,
    };

    this.logger = logger.child(`Pool:${hostname}`);
    this.startMaintenanceTimer();
  }

  async acquire(): Promise<PooledConnection> {
    if (this.closed) {
      throw new Error('Connection pool is closed');
    }

    // Try to get an idle connection
    const idleConnection = this.connections.find(
      (conn) => !this.activeConnections.has(conn) && !conn.isExpired(),
    );

    if (idleConnection) {
      this.activeConnections.add(idleConnection);
      this.logger.debug('Reusing idle connection', {
        connectionId: idleConnection.id,
      });
      return idleConnection;
    }

    // Create new connection if under limit
    if (this.connections.length < this.options.maxConnections) {
      const connection = await this.createConnection();
      this.connections.push(connection);
      this.activeConnections.add(connection);
      return connection;
    }

    // Wait for available connection
    return this.waitForConnection();
  }

  release(connection: PooledConnection): void {
    this.activeConnections.delete(connection);
    connection.lastUsed = Date.now();

    // Process waiting requests
    if (this.waitQueue.length > 0) {
      const request = this.waitQueue.shift();
      if (request) {
        this.activeConnections.add(connection);
        request.resolve(connection);
      }
    }

    this.logger.debug('Released connection', {
      connectionId: connection.id,
      queueLength: this.waitQueue.length,
    });
  }

  private async createConnection(): Promise<PooledConnection> {
    const connectionId = cryptoId('conn');

    this.logger.debug('Creating new connection', {
      connectionId,
      hostname: this.hostname,
    });

    const connection: PooledConnection = {
      id: connectionId,
      hostname: this.hostname,
      port: this.options.port,
      created: Date.now(),
      lastUsed: Date.now(),
      isExpired: () => {
        const age = Date.now() - connection.lastUsed;
        return age > this.options.maxIdleTime;
      },
    };

    return connection;
  }

  private async waitForConnection(): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitQueue.findIndex((req) => req.resolve === resolve);
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(`Connection timeout after ${this.options.connectionTimeout}ms`));
      }, this.options.connectionTimeout);

      this.waitQueue.push({
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject,
      });
    });
  }

  private startMaintenanceTimer(): void {
    setInterval(
      () => {
        this.cleanupExpiredConnections();
      },
      Math.min(this.options.maxIdleTime / 2, 30000),
    );
  }

  private cleanupExpiredConnections(): void {
    const beforeCount = this.connections.length;

    this.connections = this.connections.filter((conn) => {
      if (this.activeConnections.has(conn)) {
        return true; // Keep active connections
      }

      if (conn.isExpired()) {
        this.logger.debug('Removing expired connection', {
          connectionId: conn.id,
        });
        return false;
      }

      return true;
    });

    if (this.connections.length !== beforeCount) {
      this.logger.debug('Cleaned up expired connections', {
        before: beforeCount,
        after: this.connections.length,
        removed: beforeCount - this.connections.length,
      });
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.activeConnections.clear();
    this.connections.length = 0;

    // Reject all waiting requests
    this.waitQueue.forEach((request) => {
      request.reject(new Error('Connection pool closed'));
    });
    this.waitQueue.length = 0;

    this.logger.info('Connection pool closed');
  }

  getStats(): PoolStats {
    return {
      hostname: this.hostname,
      totalConnections: this.connections.length,
      activeConnections: this.activeConnections.size,
      idleConnections: this.connections.length - this.activeConnections.size,
      queueLength: this.waitQueue.length,
      maxConnections: this.options.maxConnections,
    };
  }
}

/**
 * Request Queue Manager
 * Manages request queuing and rate limiting
 */
export class RequestQueueManager {
  private queues = new Map<string, RequestQueue>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child('RequestQueue');
  }

  getQueue(name: string, options: RequestQueueOptions = {}): RequestQueue {
    let queue = this.queues.get(name);
    if (!queue) {
      this.logger.info('Creating new request queue', { name });
      queue = new RequestQueue(name, options, this.logger);
      this.queues.set(name, queue);
    }

    return queue;
  }

  async closeAll(): Promise<void> {
    this.logger.info('Closing all request queues', {
      queueCount: this.queues.size,
    });

    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));

    this.queues.clear();
  }

  getStats(): RequestQueueStats {
    const stats: RequestQueueStats = {
      totalQueues: this.queues.size,
      queues: {},
    };

    this.queues.forEach((queue, name) => {
      stats.queues[name] = queue.getStats();
    });

    return stats;
  }
}

/**
 * Individual Request Queue
 */
export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private options: Required<RequestQueueOptions>;
  private logger: Logger;
  private lastExecution = 0;
  private closed = false;

  constructor(
    private name: string,
    options: RequestQueueOptions = {},
    logger: Logger,
  ) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 5,
      rateLimit: options.rateLimit || 0, // 0 = no limit
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
    };

    this.logger = logger.child(`Queue:${name}`);
  }

  async enqueue<T>(
    operation: () => Promise<T>,
    priority: number = 0,
    metadata?: Record<string, any>,
  ): Promise<T> {
    if (this.closed) {
      throw new Error('Request queue is closed');
    }

    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: cryptoId('req'),
        operation,
        priority,
        ...(metadata !== undefined && { metadata }),
        resolve,
        reject,
        attempts: 0,
        createdAt: Date.now(),
      };

      // Insert based on priority (higher priority first)
      const insertIndex = this.queue.findIndex((item) => item.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIndex, 0, request);
      }

      this.logger.debug('Request enqueued', {
        requestId: request.id,
        priority,
        queueLength: this.queue.length,
        metadata,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const currentlyProcessing: Promise<void>[] = [];

      while (this.queue.length > 0 && currentlyProcessing.length < this.options.maxConcurrent) {
        // Rate limiting
        if (this.options.rateLimit > 0) {
          const timeSinceLastExecution = Date.now() - this.lastExecution;
          const minInterval = 1000 / this.options.rateLimit;

          if (timeSinceLastExecution < minInterval) {
            await new Promise((resolve) =>
              setTimeout(resolve, minInterval - timeSinceLastExecution),
            );
          }
        }

        const request = this.queue.shift();
        if (!request) continue; // Queue was empty, shouldn't happen but handle gracefully
        this.lastExecution = Date.now();

        const processingPromise = this.processRequest(request);
        currentlyProcessing.push(processingPromise);

        // Remove completed promises
        processingPromise.finally(() => {
          const index = currentlyProcessing.indexOf(processingPromise);
          if (index >= 0) {
            currentlyProcessing.splice(index, 1);
          }
        });
      }

      // Wait for current batch to complete before processing more
      await Promise.all(currentlyProcessing);

      // Continue processing if there are more requests
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    } finally {
      this.processing = false;
    }
  }

  private async processRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();
    request.attempts++;

    try {
      this.logger.debug('Processing request', {
        requestId: request.id,
        attempt: request.attempts,
        queueTime: startTime - request.createdAt,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.options.timeout);
      });

      const result = await Promise.race([request.operation(), timeoutPromise]);

      const duration = Date.now() - startTime;
      this.logger.debug('Request completed', {
        id: request.id,
        duration,
        attempts: request.attempts,
      });

      request.resolve(result);
    } catch (error) {
      const duration = Date.now() - startTime;

      if (request.attempts < this.options.retryAttempts) {
        this.logger.warn('Request failed, retrying', {
          id: request.id,
          attempt: request.attempts,
          error: (error as Error).message,
          duration,
        });

        // Add delay before retry
        setTimeout(() => {
          this.queue.unshift(request); // Put back at front for retry
          this.processQueue();
        }, this.options.retryDelay * request.attempts);
      } else {
        this.logger.error('Request failed after all retries', error as Error, {
          id: request.id,
          attempts: request.attempts,
          duration,
        });

        request.reject(error as Error);
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;

    // Reject all pending requests
    this.queue.forEach((request) => {
      request.reject(new Error('Request queue closed'));
    });
    this.queue.length = 0;

    this.logger.info('Request queue closed');
  }

  getStats(): QueueStats {
    return {
      name: this.name,
      queueLength: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.options.maxConcurrent,
      rateLimit: this.options.rateLimit,
    };
  }
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures and improves resilience
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: CircuitBreakerState = 'CLOSED';
  private nextAttemptTime = 0;
  private logger: Logger;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions,
    logger: Logger,
  ) {
    this.logger = logger.child(`CircuitBreaker:${name}`);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
      this.state = 'HALF_OPEN';
      this.logger.info('Circuit breaker transitioning to HALF_OPEN', {
        name: this.name,
      });
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.logger.info('Circuit breaker closed after successful request', {
        name: this.name,
      });
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.options.timeout;

      this.logger.warn('Circuit breaker opened due to failures', {
        name: this.name,
        failureCount: this.failureCount,
        nextAttemptTime: this.nextAttemptTime,
      });
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

// Type definitions
export interface ConnectionPoolOptions {
  maxConnections?: number;
  maxIdleTime?: number;
  connectionTimeout?: number;
  port?: number;
  keepAlive?: boolean;
}

export interface PooledConnection {
  id: string;
  hostname: string;
  port: number;
  created: number;
  lastUsed: number;
  isExpired(): boolean;
}

export interface ConnectionRequest {
  resolve: (connection: PooledConnection) => void;
  reject: (error: Error) => void;
}

export interface PoolStats {
  hostname: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  queueLength: number;
  maxConnections: number;
}

export interface ConnectionPoolStats {
  totalPools: number;
  pools: Record<string, PoolStats>;
}

export interface RequestQueueOptions {
  maxConcurrent?: number;
  rateLimit?: number; // requests per second
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface QueuedRequest {
  id: string;
  operation: () => Promise<any>;
  priority: number;
  metadata?: Record<string, any>;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  attempts: number;
  createdAt: number;
}

export interface QueueStats {
  name: string;
  queueLength: number;
  processing: boolean;
  maxConcurrent: number;
  rateLimit: number;
}

export interface RequestQueueStats {
  totalQueues: number;
  queues: Record<string, QueueStats>;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  timeout: number; // Recovery timeout in ms
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStats {
  name: string;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}
