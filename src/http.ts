#!/usr/bin/env node

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import type { Logger } from './infrastructure/logger.js';
import { BestPracticeLegalMCPServer } from './server/mcp-server.js';
import { startHttpTransport } from './server/http-transport-server.js';
import type { ServerConfig } from './types.js';

bootstrapServices();

const logger = container.get<Logger>('logger');
const config = container.get<ServerConfig>('config');

const transportConfig = config.httpTransport ?? {
  port: 3002,
  host: '0.0.0.0',
};
const transportLogger = logger.child('HttpTransportEntrypoint');

const { close } = await startHttpTransport(
  async () => new BestPracticeLegalMCPServer().getServer(),
  transportLogger,
  transportConfig,
);

transportLogger.info('Legal MCP HTTP transport ready', {
  host: transportConfig.host,
  port: transportConfig.port,
});

let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  transportLogger.info('Stopping Legal MCP HTTP transport', { signal });
  try {
    await close();
    process.exit(0);
  } catch (error) {
    transportLogger.error(
      'Failed to stop Legal MCP HTTP transport',
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  }
};

for (const signal of ['SIGTERM', 'SIGINT', 'SIGUSR2']) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
