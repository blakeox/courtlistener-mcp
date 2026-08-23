/** Shared test doubles for the current Worker/runtime test suites. */

import type { Logger } from '../../src/infrastructure/logger.js';

interface Logs {
  info: unknown[][];
  warn: unknown[][];
  error: unknown[][];
  debug: unknown[][];
}

export interface MockLogger extends Logger {
  getLogs(): Logs;
  clearLogs(): void;
}

/** Create a deterministic logger double without network or Worker bindings. */
export function createMockLogger(): MockLogger {
  const logs: Logs = {
    info: [],
    warn: [],
    error: [],
    debug: [],
  };

  const mockLogger: MockLogger = {
    child(): MockLogger {
      return mockLogger;
    },
    info(...args: unknown[]): void {
      logs.info.push(args);
    },
    warn(...args: unknown[]): void {
      logs.warn.push(args);
    },
    error(...args: unknown[]): void {
      logs.error.push(args);
    },
    debug(...args: unknown[]): void {
      logs.debug.push(args);
    },
    toolExecution(
      toolName: string,
      duration: number,
      success: boolean,
      metadata?: Record<string, unknown>,
    ): void {
      logs.info.push([`Tool: ${toolName}`, { duration, success, ...metadata }]);
    },
    apiCall(
      method: string,
      endpoint: string,
      duration: number,
      status: number,
      metadata?: Record<string, unknown>,
    ): void {
      logs.info.push([`API ${method} ${endpoint}`, { duration, status, ...metadata }]);
    },
    startTimer(operation: string) {
      const start = Date.now();
      return {
        end(): number {
          return Date.now() - start;
        },
        endWithError(error: Error): number {
          const duration = Date.now() - start;
          logs.error.push([`Timer ${operation} ended with error:`, error]);
          return duration;
        },
      };
    },
    getLogs(): Logs {
      return logs;
    },
    clearLogs(): void {
      logs.info = [];
      logs.warn = [];
      logs.error = [];
      logs.debug = [];
    },
  };

  return mockLogger;
}
