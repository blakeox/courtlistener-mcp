#!/usr/bin/env node

/**
 * Legal MCP Server - MCP v2 Entry Point
 *
 * Bootstraps the dependency-injected services and starts the MCP v2 runtime.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { runDoctor } from './cli/doctor.js';
import { runSetup } from './cli/setup.js';
import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { Logger } from './infrastructure/logger.js';
import { LocalMcpV2Runtime, createLocalMcpV2Server } from './server/mcp-v2-server.js';

// Handle --setup flag before any heavy initialisation
if (process.argv.includes('--setup')) {
  runSetup().catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
} else if (process.argv.includes('--doctor')) {
  runDoctor().catch((err) => {
    console.error('Doctor failed:', err);
    process.exit(1);
  });
} else {
  async function main(): Promise<void> {
    bootstrapServices(process.env);

    const logger = container.get<Logger>('logger');
    let stdioHandle: { close(): Promise<void> } | undefined;
    try {
      stdioHandle = serveStdio(() => createLocalMcpV2Server(), {
        legacy: 'reject',
        onerror: (error) => logger.error('MCP v2 stdio error', error),
      });
    } catch (error) {
      logger.error('Failed to start Legal MCP Server', error as Error);
      process.exit(1);
    }

    const shutdown = async () => {
      await stdioHandle?.close();
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
  }

  if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
      console.error('Fatal error starting Legal MCP Server:', error);
      process.exit(1);
    });
  }
} // end else (not --setup / --doctor)

function ensureBootstrapped() {
  // If core services aren't registered yet, initialize the container
  if (!container.has('logger') || !container.has('config')) {
    bootstrapServices(process.env);
  }
}

export class LegalMCPServer extends LocalMcpV2Runtime {
  constructor() {
    ensureBootstrapped();
    super();
  }
}
export { LocalMcpV2Runtime, createLocalMcpV2Server } from './server/mcp-v2-server.js';
