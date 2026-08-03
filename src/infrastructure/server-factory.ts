/**
 * Server Factory
 * Creates and configures MCP servers with different configurations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServerConfig } from '../types.js';
import { Logger } from '../infrastructure/logger.js';
import {
  SERVER_INFO,
  buildServerCapabilities,
  resolveProtocolFeatureFlags,
} from '../infrastructure/protocol-constants.js';
import { MCP_SERVER_INSTRUCTIONS } from '../infrastructure/mcp-server-instructions.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';

export interface ServerFactory {
  createServer(config: ServerConfig, options?: { taskStore?: TaskStore }): Server;
  createTransport(): StdioServerTransport;
}

export class MCPServerFactory implements ServerFactory {
  constructor(private logger: Logger) {}

  createServer(config: ServerConfig, options?: { taskStore?: TaskStore }): Server {
    this.logger.info('Creating MCP server instance');

    return new Server(
      {
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
      },
      {
        capabilities: buildServerCapabilities({
          ...resolveProtocolFeatureFlags(),
          LOGGING: config.logging.enabled,
          SAMPLING: config.sampling.enabled,
        }),
        instructions: MCP_SERVER_INSTRUCTIONS,
        ...(options?.taskStore ? { taskStore: options.taskStore } : {}),
      },
    );
  }

  createTransport(): StdioServerTransport {
    this.logger.debug('Creating stdio transport');
    return new StdioServerTransport();
  }
}
