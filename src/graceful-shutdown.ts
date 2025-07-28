/**
 * Enhanced graceful shutdown coordinator for Legal MCP Server
 * Manages cleanup of all server components and connections
 */

import { Logger } from './logger.js';

export interface ShutdownConfig {
  enabled: boolean;
  timeout: number; // Maximum time to wait for graceful shutdown
  forceTimeout: number; // Time to wait before force exit
  signals: string[]; // Signals to listen for
}

export interface ShutdownHook {
  name: string;
  priority: number; // Lower numbers execute first
  cleanup: () => Promise<void>;
}

export class GracefulShutdown {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private logger: Logger;
  private shutdownPromise?: Promise<void>;

  constructor(
    private config: ShutdownConfig,
    logger: Logger
  ) {
    this.logger = logger.child('GracefulShutdown');
    
    if (this.config.enabled) {
      this.setupSignalHandlers();
      this.logger.info('Graceful shutdown enabled', {
        timeout: this.config.timeout,
        signals: this.config.signals
      });
    }
  }

  /**
   * Register a cleanup hook
   */
  addHook(hook: ShutdownHook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => a.priority - b.priority);
    
    this.logger.debug('Shutdown hook registered', {
      name: hook.name,
      priority: hook.priority,
      totalHooks: this.hooks.length
    });
  }

  /**
   * Remove a cleanup hook
   */
  removeHook(name: string): void {
    const index = this.hooks.findIndex(hook => hook.name === name);
    if (index !== -1) {
      this.hooks.splice(index, 1);
      this.logger.debug('Shutdown hook removed', { name });
    }
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(reason: string = 'Manual shutdown'): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.logger.info('Initiating graceful shutdown', { reason });

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  /**
   * Perform the actual shutdown process
   */
  private async performShutdown(reason: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Execute cleanup hooks in priority order
      await this.executeCleanupHooks();
      
      const duration = Date.now() - startTime;
      this.logger.info('Graceful shutdown completed', {
        reason,
        duration,
        hooksExecuted: this.hooks.length
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Graceful shutdown failed', undefined, {
        reason,
        duration,
        hooksExecuted: this.hooks.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Execute all cleanup hooks with timeout protection
   */
  private async executeCleanupHooks(): Promise<void> {
    const promises = this.hooks.map(async (hook) => {
      const timer = this.logger.startTimer(`shutdown_${hook.name}`);
      
      try {
        await Promise.race([
          hook.cleanup(),
          this.createTimeoutPromise(hook.name)
        ]);
        
        const duration = timer.end();
        this.logger.debug('Shutdown hook completed', {
          name: hook.name,
          duration
        });
        
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.logger.warn('Shutdown hook failed', {
          name: hook.name,
          duration,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Wait for all hooks with overall timeout
    try {
      await Promise.race([
        Promise.all(promises),
        this.createOverallTimeoutPromise()
      ]);
    } catch (error) {
      this.logger.error('Shutdown hooks timed out', undefined, {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create timeout promise for individual hook
   */
  private createTimeoutPromise(hookName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown hook '${hookName}' timed out`));
      }, this.config.timeout / this.hooks.length);
    });
  }

  /**
   * Create timeout promise for overall shutdown
   */
  private createOverallTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Overall shutdown timed out'));
      }, this.config.timeout);
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    for (const signal of this.config.signals) {
      process.on(signal as NodeJS.Signals, () => {
        this.logger.info(`Received ${signal} signal`);
        
        this.shutdown(`Signal: ${signal}`)
          .then(() => {
            this.logger.info('Graceful shutdown complete, exiting');
            process.exit(0);
          })
          .catch((error) => {
            this.logger.error('Graceful shutdown failed', undefined, {
              error: error instanceof Error ? error.message : String(error)
            });
            this.forceExit();
          });
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      this.shutdown('Uncaught exception')
        .finally(() => this.forceExit());
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', undefined, {
        reason: String(reason),
        promise: promise.toString()
      });
      this.shutdown('Unhandled promise rejection')
        .finally(() => this.forceExit());
    });
  }

  /**
   * Force exit after timeout
   */
  private forceExit(): void {
    setTimeout(() => {
      this.logger.error('Force exiting after timeout');
      process.exit(1);
    }, this.config.forceTimeout);
  }

  /**
   * Get shutdown status
   */
  getStatus(): {
    isShuttingDown: boolean;
    hooksRegistered: number;
    config: ShutdownConfig;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      hooksRegistered: this.hooks.length,
      config: this.config
    };
  }
}

/**
 * Create graceful shutdown from environment configuration
 */
export function createGracefulShutdown(logger: Logger): GracefulShutdown {
  const config: ShutdownConfig = {
    enabled: process.env.GRACEFUL_SHUTDOWN_ENABLED !== 'false',
    timeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT || '30000'),
    forceTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_FORCE_TIMEOUT || '5000'),
    signals: process.env.GRACEFUL_SHUTDOWN_SIGNALS ? 
             process.env.GRACEFUL_SHUTDOWN_SIGNALS.split(',').map(s => s.trim()) :
             ['SIGTERM', 'SIGINT', 'SIGUSR2']
  };

  return new GracefulShutdown(config, logger);
}
