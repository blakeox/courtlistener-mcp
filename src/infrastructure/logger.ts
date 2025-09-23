/**
 * Structured logging system for Legal MCP Server
 * Provides consistent, configurable logging with structured output
 */

import { LogConfig } from '../types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  component?: string;
  metadata?: Record<string, any>;
  requestId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private config: LogConfig;
  private component: string;

  constructor(config: LogConfig, component = 'LegalMCP') {
    this.config = config;
    this.component = component;
  }

  /**
   * Create a child logger for a specific component
   */
  child(component: string): Logger {
    return new Logger(this.config, component);
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Info level logging
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const errorData = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined;

    this.log('error', message, metadata, errorData);
  }

  /**
   * Log API request/response
   */
  apiCall(
    method: string,
    endpoint: string,
    duration: number,
    status: number,
    metadata?: Record<string, any>
  ): void {
    const level: LogLevel = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    
    this.log(level, `API ${method} ${endpoint}`, {
      ...metadata,
      duration,
      status,
      endpoint,
      method
    });
  }

  /**
   * Log tool execution
   */
  toolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    const level: LogLevel = success ? 'info' : 'error';
    
    this.log(level, `Tool execution: ${toolName}`, {
      ...metadata,
      toolName,
      duration,
      success
    });
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: { name: string; message: string; stack?: string }
  ): void {
    if (!this.config.enabled) return;
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.component,
      ...(metadata && { metadata }),
      ...(error && { error })
    };

    const output = this.config.format === 'json' 
      ? JSON.stringify(entry)
      : this.formatText(entry);

    // Route all logging to stderr to avoid interfering with MCP protocol on stdout
    console.error(output);
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.config.level];
  }

  /**
   * Format log entry as text
   */
  private formatText(entry: LogEntry): string {
    let output = `[${entry.timestamp}] ${entry.level.toUpperCase()} [${entry.component}] ${entry.message}`;

    if (entry.metadata) {
      const metaStr = Object.entries(entry.metadata)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      output += ` ${metaStr}`;
    }

    if (entry.error) {
      output += `\nError: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n${entry.error.stack}`;
      }
    }

    return output;
  }

  /**
   * Create a timing context for measuring operation duration
   */
  startTimer(operation: string): TimingContext {
    return new TimingContext(this, operation);
  }
}

/**
 * Helper class for timing operations
 */
export class TimingContext {
  private startTime: number;

  constructor(
    private logger: Logger,
    private operation: string
  ) {
    this.startTime = Date.now();
    this.logger.debug(`Started: ${this.operation}`);
  }

  /**
   * End timing and log duration
   */
  end(success = true, metadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    
    if (success) {
      this.logger.debug(`Completed: ${this.operation}`, {
        ...metadata,
        duration,
        success
      });
    } else {
      this.logger.warn(`Completed: ${this.operation}`, {
        ...metadata,
        duration,
        success
      });
    }

    return duration;
  }

  /**
   * End timing with error
   */
  endWithError(error: Error, metadata?: Record<string, any>): number {
    const duration = Date.now() - this.startTime;
    
    this.logger.error(`Failed: ${this.operation}`, error, {
      ...metadata,
      duration
    });

    return duration;
  }
}

/**
 * Create logger instance
 */
export function createLogger(config: LogConfig, component?: string): Logger {
  return new Logger(config, component);
}
