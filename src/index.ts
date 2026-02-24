#!/usr/bin/env node

/**
 * Legal MCP Server - Best Practice Entry Point
 *
 * Bootstraps the dependency-injected services and starts the refactored
 * `BestPracticeLegalMCPServer`, providing a clean, production-ready runtime.
 */

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { runDoctor } from './cli/doctor.js';
import { runSetup } from './cli/setup.js';
import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { Logger } from './infrastructure/logger.js';
import { initTelemetry } from './infrastructure/telemetry.js';
import { BestPracticeLegalMCPServer } from './server/best-practice-server.js';

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
  const otelSdk = initTelemetry();

  async function main(): Promise<void> {
    bootstrapServices();

    const logger = container.get<Logger>('logger');
    const server = new BestPracticeLegalMCPServer();

    process.on('SIGTERM', async () => {
      if (otelSdk) {
        await otelSdk.shutdown();
      }
    });

    try {
      await server.start();
    } catch (error) {
      logger.error('Failed to start Legal MCP Server', error as Error);

      try {
        await server.stop();
      } finally {
        if (otelSdk) await otelSdk.shutdown();
        process.exit(1);
      }
    }
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
    bootstrapServices();
  }
}

export { BestPracticeLegalMCPServer };
export class LegalMCPServer extends BestPracticeLegalMCPServer {
  constructor() {
    ensureBootstrapped();
    super();
  }
}
export type LegacyLegalMCPServer = BestPracticeLegalMCPServer & {
  run(): Promise<void>;
  listTools(): Promise<{ tools: Tool[]; metadata: { categories: string[] } }>;
  handleToolCall(
    input:
      | CallToolRequest
      | {
          name: string;
          arguments?: Record<string, unknown>;
        },
  ): Promise<CallToolResult>;
};
