#!/usr/bin/env node

/**
 * Legal MCP Server - Best Practice Entry Point
 *
 * Bootstraps the dependency-injected services and starts the refactored
 * `BestPracticeLegalMCPServer`, providing a clean, production-ready runtime.
 */

import type { CallToolRequest, CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { container } from './infrastructure/container.js';
import { Logger } from './infrastructure/logger.js';
import { BestPracticeLegalMCPServer } from './server/best-practice-server.js';

async function main(): Promise<void> {
  bootstrapServices();

  const logger = container.get<Logger>('logger');
  const server = new BestPracticeLegalMCPServer();

  try {
    await server.start();
  } catch (error) {
    logger.error('Failed to start Legal MCP Server', error as Error);

    try {
      await server.stop();
    } finally {
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
