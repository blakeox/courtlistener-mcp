/**
 * Server Factory
 * Creates and configures MCP servers with different configurations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServerConfig } from '../types.js';
import { Logger } from '../infrastructure/logger.js';

export interface ServerFactory {
  createServer(config: ServerConfig): Server;
  createTransport(): StdioServerTransport;
}

export class MCPServerFactory implements ServerFactory {
  constructor(private logger: Logger) {}

  createServer(config: ServerConfig): Server {
    this.logger.info('Creating MCP server instance');

    return new Server(
      {
        name: 'legal-mcp-server',
        version: '1.0.0',
        description: 'Legal research MCP server with CourtListener integration',
      },
      {
        capabilities: {
          tools: {},
          logging: config.logging.enabled ? {} : undefined,
        },
      },
    );
  }

  createTransport(): StdioServerTransport {
    this.logger.debug('Creating stdio transport');
    return new StdioServerTransport();
  }
}
