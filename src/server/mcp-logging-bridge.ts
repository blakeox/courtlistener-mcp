import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';

import type { Logger } from '../infrastructure/logger.js';

function mapLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): LoggingLevel | null {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'error':
      return 'error';
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

function formatLogData(data: unknown): string | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  if (typeof data === 'string') {
    return data;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Forwards selected server log lines to MCP clients via notifications/message.
 * The SDK handles logging/setLevel when the logging capability is advertised.
 */
export function attachMcpLoggingBridge(
  server: Server,
  logger: Logger,
  options: { enabled?: boolean; sessionId?: string } = {},
): void {
  if (options.enabled === false) {
    return;
  }

  const sessionId = options.sessionId;

  const forward = (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => {
    const mappedLevel = mapLogLevel(level);
    if (!mappedLevel) {
      return;
    }

    void server
      .sendLoggingMessage(
        {
          level: mappedLevel,
          logger: 'courtlistener-mcp',
          data: formatLogData(data) ?? message,
        },
        sessionId,
      )
      .catch(() => {
        /* transport may be disconnected */
      });
  };

  const originalDebug = logger.debug.bind(logger);
  logger.debug = (message, metadata) => {
    originalDebug(message, metadata);
    forward('debug', message, metadata);
  };

  const originalInfo = logger.info.bind(logger);
  logger.info = (message, metadata) => {
    originalInfo(message, metadata);
    forward('info', message, metadata);
  };

  const originalWarn = logger.warn.bind(logger);
  logger.warn = (message, metadata) => {
    originalWarn(message, metadata);
    forward('warn', message, metadata);
  };

  const originalError = logger.error.bind(logger);
  logger.error = (message, error, metadata) => {
    originalError(message, error, metadata);
    forward('error', message, metadata ?? error?.message);
  };
}
