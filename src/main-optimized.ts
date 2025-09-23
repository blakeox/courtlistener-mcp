#!/usr/bin/env node

/**
 * Optimized Legal MCP Server Entry Point
 * Uses refactored architecture with dependency injection, middleware, and async optimizations
 */

import { bootstrapServices } from './infrastructure/bootstrap.js';
import { OptimizedLegalMCPServer } from './server/optimized-server.js';
import { container } from './infrastructure/container.js';
import { Logger } from './infrastructure/logger.js';

async function main() {
  let server: OptimizedLegalMCPServer | undefined;
  let logger: Logger | undefined;

  try {
    // Bootstrap all services and dependencies with validation
    console.log('Bootstrapping services...');
    bootstrapServices();
    console.log('✅ Services bootstrapped successfully');
    
    // Get logger after bootstrap
    logger = container.get<Logger>('logger');
    logger.info('Starting Legal MCP Server with optimized architecture');
    
    // Create optimized server
    server = new OptimizedLegalMCPServer();
    
    // Setup graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger?.info(`Received ${signal}, shutting down gracefully...`);
      
      if (server) {
        try {
          await server.stop();
          logger?.info('Server shutdown completed');
        } catch (error) {
          logger?.error('Error during shutdown', error as Error);
        }
      }
      
      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger?.error('Uncaught exception', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger?.error('Unhandled rejection at promise', new Error(String(reason)), {
        promise: String(promise)
      });
    });

    // Start the server
    await server.start();
    
    // Log health status
    const healthStatus = server.getHealthStatus();
    logger.info('Server health check', healthStatus);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (logger) {
      logger.error('Failed to start Legal MCP Server', error as Error);
    } else {
      console.error('Failed to start Legal MCP Server:', errorMessage);
    }
    
    if (server) {
      try {
        await server.stop();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }
    }
    
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}