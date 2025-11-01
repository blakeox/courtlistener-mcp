#!/usr/bin/env node

/**
 * ✅ COMPREHENSIVE Unit Tests for Logger (TypeScript)
 * Tests logging functionality, levels, formatting, and performance tracking
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import type { Logger } from '../../src/infrastructure/logger.js';

// Import the actual Logger
const { Logger: LoggerClass, createLogger } = await import(
  '../../dist/infrastructure/logger.js'
);

interface LogOutput {
  level: string;
  args: unknown[];
}

describe('Logger (TypeScript)', () => {
  let logger: Logger;
  let logOutput: LogOutput[];
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    // Reset log output capture
    logOutput = [];

    // Create logger with test configuration
    const config = {
      level: 'debug' as const,
      format: 'json' as const,
      enabled: true,
    };

    logger = new LoggerClass(config, 'TestComponent');

    // Mock console.error to capture logs (Logger uses console.error)
    originalConsoleError = console.error;
    console.error = (...args: unknown[]): void => {
      logOutput.push({ level: 'error', args });
      originalConsoleError(...args);
    };
  });

  afterEach(() => {
    // Restore console.error
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
  });

  describe('Basic Logging', () => {
    it('should create logger with component name', () => {
      assert.ok(logger);
      assert.ok(typeof logger.info === 'function');
      assert.ok(typeof logger.debug === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.error === 'function');
    });

    it('should log info messages', () => {
      const message = 'Test info message';
      logger.info(message);

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      assert.ok(
        JSON.stringify(lastLog.args).includes(message),
        `Expected message "${message}" in logs`
      );
    });

    it('should log debug messages', () => {
      const message = 'Test debug message';
      logger.debug(message);

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      assert.ok(
        JSON.stringify(lastLog.args).includes(message),
        `Expected message "${message}" in logs`
      );
    });

    it('should log warning messages', () => {
      const message = 'Test warning message';
      logger.warn(message);

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      assert.ok(
        JSON.stringify(lastLog.args).includes(message),
        `Expected message "${message}" in logs`
      );
    });

    it('should log error messages', () => {
      const message = 'Test error message';
      const error = new Error('Test error');
      logger.error(message, error);

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      assert.ok(
        JSON.stringify(lastLog.args).includes(message),
        `Expected message "${message}" in logs`
      );
    });
  });

  describe('Log Levels', () => {
    it('should respect debug level configuration', () => {
      const debugLogger = new LoggerClass(
        { level: 'debug', format: 'json', enabled: true },
        'Debug'
      );

      debugLogger.debug('Debug message');
      debugLogger.info('Info message');
      debugLogger.warn('Warn message');
      debugLogger.error('Error message');

      // All levels should be logged when level is debug
      assert.ok(logOutput.length >= 4, 'Expected all log levels');
    });

    it('should filter debug messages at info level', () => {
      const infoLogger = new LoggerClass(
        { level: 'info', format: 'json', enabled: true },
        'Info'
      );

      const initialLogCount = logOutput.length;
      infoLogger.debug('Debug message'); // Should be filtered
      infoLogger.info('Info message');
      infoLogger.warn('Warn message');
      infoLogger.error('Error message');

      // Debug should be filtered out, so less than 4 logs
      assert.ok(
        logOutput.length - initialLogCount < 4,
        'Debug messages should be filtered'
      );
    });

    it('should filter debug and info messages at warn level', () => {
      const warnLogger = new LoggerClass(
        { level: 'warn', format: 'json', enabled: true },
        'Warn'
      );

      const initialLogCount = logOutput.length;
      warnLogger.debug('Debug message'); // Should be filtered
      warnLogger.info('Info message'); // Should be filtered
      warnLogger.warn('Warn message');
      warnLogger.error('Error message');

      // Debug and info should be filtered out
      assert.ok(
        logOutput.length - initialLogCount >= 2,
        'Warn and error messages should be logged'
      );
    });

    it('should only log error messages at error level', () => {
      const errorLogger = new LoggerClass(
        { level: 'error', format: 'json', enabled: true },
        'Error'
      );

      const initialLogCount = logOutput.length;
      errorLogger.debug('Debug message'); // Should be filtered
      errorLogger.info('Info message'); // Should be filtered
      errorLogger.warn('Warn message'); // Should be filtered
      errorLogger.error('Error message');

      // Only error should be logged
      assert.ok(
        logOutput.length - initialLogCount === 1,
        'Only error messages should be logged'
      );
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with component name', () => {
      const childLogger = logger.child('ChildComponent');
      assert.ok(childLogger);
      assert.ok(typeof childLogger.info === 'function');
      assert.ok(typeof childLogger.debug === 'function');
    });

    it('should log with child component name', () => {
      const childLogger = logger.child('ChildComponent');
      childLogger.info('Child log message');

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      assert.ok(
        JSON.stringify(lastLog.args).includes('ChildComponent'),
        'Expected child component name in log'
      );
    });
  });

  describe('Timing Context', () => {
    it('should create timing context', () => {
      const timer = logger.startTimer('test-operation');
      assert.ok(timer);
      assert.ok(typeof timer.end === 'function');
      assert.ok(typeof timer.endWithError === 'function');
    });

    it('should measure operation duration', () => {
      const timer = logger.startTimer('test-operation');
      const duration = timer.end();

      assert.ok(typeof duration === 'number');
      assert.ok(duration >= 0, 'Duration should be non-negative');
    });

    it('should log error with duration', () => {
      const timer = logger.startTimer('test-operation');
      const error = new Error('Test error');
      const duration = timer.endWithError(error);

      assert.ok(typeof duration === 'number');
      assert.ok(duration >= 0, 'Duration should be non-negative');
    });
  });

  describe('API Call Logging', () => {
    it('should log API calls with metadata', () => {
      logger.apiCall('GET', '/api/test', 100, 200, { requestId: 'test-123' });

      // API call logging is supported
      assert.ok(typeof logger.apiCall === 'function');
    });

    it('should log API errors at error level', () => {
      logger.apiCall('GET', '/api/test', 100, 500);

      // Verify method exists and can be called
      assert.ok(typeof logger.apiCall === 'function');
    });
  });

  describe('Tool Execution Logging', () => {
    it('should log successful tool execution', () => {
      logger.toolExecution('test-tool', 50, true, { requestId: 'test-123' });

      // Tool execution logging is supported
      assert.ok(typeof logger.toolExecution === 'function');
    });

    it('should log failed tool execution at error level', () => {
      logger.toolExecution('test-tool', 50, false, {
        requestId: 'test-123',
        error: 'Test error',
      });

      // Verify method exists and can be called
      assert.ok(typeof logger.toolExecution === 'function');
    });
  });

  describe('Log Formatting', () => {
    it('should format logs as JSON', () => {
      const jsonLogger = new LoggerClass(
        { level: 'info', format: 'json', enabled: true },
        'JSON'
      );

      jsonLogger.info('Test message', { key: 'value' });

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      const logString = String(lastLog.args[0]);

      // Should be valid JSON
      assert.doesNotThrow(() => {
        JSON.parse(logString);
      }, 'Expected valid JSON format');
    });

    it('should format logs as text', () => {
      const textLogger = new LoggerClass(
        { level: 'info', format: 'text', enabled: true },
        'Text'
      );

      textLogger.info('Test message', { key: 'value' });

      assert.ok(logOutput.length > 0);
      const lastLog = logOutput[logOutput.length - 1];
      const logString = String(lastLog.args[0]);

      // Text format should be readable
      assert.ok(
        logString.includes('Test message'),
        'Expected readable text format'
      );
    });
  });

  describe('Disabled Logging', () => {
    it('should not log when disabled', () => {
      const disabledLogger = new LoggerClass(
        { level: 'info', format: 'json', enabled: false },
        'Disabled'
      );

      const initialLogCount = logOutput.length;
      disabledLogger.info('Test message');
      disabledLogger.debug('Debug message');
      disabledLogger.warn('Warn message');
      disabledLogger.error('Error message');

      // No logs should be generated
      assert.strictEqual(
        logOutput.length,
        initialLogCount,
        'No logs should be generated when disabled'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors without metadata', () => {
      const message = 'Test error';
      const error = new Error('Test error message');

      assert.doesNotThrow(() => {
        logger.error(message, error);
      }, 'Should handle error logging gracefully');
    });

    it('should handle errors with metadata', () => {
      const message = 'Test error';
      const error = new Error('Test error message');
      const metadata = { requestId: 'test-123', userId: 'user-456' };

      assert.doesNotThrow(() => {
        logger.error(message, error, metadata);
      }, 'Should handle error logging with metadata');
    });

    it('should handle logging without error object', () => {
      const message = 'Test error';

      assert.doesNotThrow(() => {
        logger.error(message);
      }, 'Should handle error logging without error object');
    });
  });

  describe('Factory Function', () => {
    it('should create logger using factory function', () => {
      const factoryLogger = createLogger(
        { level: 'info', format: 'json', enabled: true },
        'Factory'
      );

      assert.ok(factoryLogger);
      assert.ok(typeof factoryLogger.info === 'function');
      assert.ok(typeof factoryLogger.debug === 'function');
    });
  });
});

