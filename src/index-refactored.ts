#!/usr/bin/env node

/**
 * Refactored Legal MCP Server Entry Point
 * Clean, modular implementation with dependency injection
 */

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { RefactoredLegalMCPServer } from './server/refactored-server.js';

async function main() {
  try {
    // Bootstrap all services and dependencies
    bootstrapServices();
    
    // Create and start server
    const server = new RefactoredLegalMCPServer();
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    // Start the server
    await server.start();
    
  } catch (error) {
    console.error('Failed to start Legal MCP Server:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}