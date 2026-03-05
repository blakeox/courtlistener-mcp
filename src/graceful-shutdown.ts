/**
 * Enhanced graceful shutdown coordinator for Legal MCP Server
 * Manages cleanup of all server components and connections
 */

import { Logger } from './infrastructure/logger.js';
import { getConfig } from './infrastructure/config.js';

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
  private signalShutdownInitiated = false;
  private exitInitiated = false;
  private forceExitTimer: NodeJS.Timeout | undefined;

  constructor(
    private config: ShutdownConfig,
    logger: Logger,
  ) {
    this.logger = logger.child('GracefulShutdown');

    if (this.config.enabled) {
      this.setupSignalHandlers();
      this.logger.info('Graceful shutdown enabled', {
        timeout: this.config.timeout,
        signals: this.config.signals,
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
      totalHooks: this.hooks.length,
    });
  }

  /**
   * Remove a cleanup hook
   */
  removeHook(name: string): void {
    const index = this.hooks.findIndex((hook) => hook.name === name);
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
        hooksExecuted: this.hooks.length,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Graceful shutdown failed', undefined, {
        reason,
        duration,
        hooksExecuted: this.hooks.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute all cleanup hooks with timeout protection
   */
  private async executeCleanupHooks(): Promise<void> {
    const orderedHooks = [...this.hooks].sort((a, b) => a.priority - b.priority);
    if (orderedHooks.length === 0) {
      return;
    }

    const shutdownDeadline = Date.now() + this.config.timeout;

    for (const [index, hook] of orderedHooks.entries()) {
      const remainingBudgetMs = shutdownDeadline - Date.now();

      if (remainingBudgetMs <= 0) {
        this.logger.error('Shutdown budget exhausted before all hooks completed', undefined, {
          hooksTotal: orderedHooks.length,
          hooksCompleted: index,
          hooksSkipped: orderedHooks.length - index,
        });
        break;
      }

      const remainingHooks = orderedHooks.length - index;
      const perHookTimeoutMs = Math.max(1, Math.floor(remainingBudgetMs / remainingHooks));
      const timer = this.logger.startTimer(`shutdown_${hook.name}`);

      try {
        await Promise.race([hook.cleanup(), this.createTimeoutPromise(hook.name, perHookTimeoutMs)]);

        const duration = timer.end();
        this.logger.debug('Shutdown hook completed', {
          name: hook.name,
          priority: hook.priority,
          duration,
          timeoutMs: perHookTimeoutMs,
          remainingBudgetMs: shutdownDeadline - Date.now(),
        });
      } catch (error) {
        const duration = timer.endWithError(error as Error);
        this.logger.warn('Shutdown hook failed', {
          name: hook.name,
          priority: hook.priority,
          duration,
          timeoutMs: perHookTimeoutMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Create timeout promise for individual hook
   */
  private createTimeoutPromise(hookName: string, timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown hook '${hookName}' timed out`));
      }, timeoutMs);
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    for (const signal of this.config.signals) {
      process.on(signal as NodeJS.Signals, () => {
        this.logger.info(`Received ${signal} signal`);

        if (this.signalShutdownInitiated) {
          this.logger.warn('Signal received while graceful shutdown already in progress', { signal });
          return;
        }
        this.signalShutdownInitiated = true;

        this.shutdown(`Signal: ${signal}`)
          .then(() => {
            this.logger.info('Graceful shutdown complete, exiting');
            this.exitProcess(0);
          })
          .catch((error) => {
            this.logger.error('Graceful shutdown failed', undefined, {
              error: error instanceof Error ? error.message : String(error),
            });
            this.forceExit();
          });
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      this.shutdown('Uncaught exception').finally(() => this.forceExit());
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', undefined, {
        reason: String(reason),
        promise: promise.toString(),
      });
      this.shutdown('Unhandled promise rejection').finally(() => this.forceExit());
    });
  }

  /**
   * Force exit after timeout
   */
  private forceExit(): void {
    if (this.forceExitTimer) {
      return;
    }

    this.forceExitTimer = setTimeout(() => {
      this.logger.error('Force exiting after timeout');
      this.exitProcess(1);
    }, this.config.forceTimeout);
  }

  private exitProcess(code: number): void {
    if (this.exitInitiated) {
      return;
    }

    this.exitInitiated = true;
    if (this.forceExitTimer) {
      clearTimeout(this.forceExitTimer);
      this.forceExitTimer = undefined;
    }
    process.exit(code);
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
      config: this.config,
    };
  }
}

/**
 * Create graceful shutdown from centralized config
 */
export function createGracefulShutdown(logger: Logger): GracefulShutdown {
  const cfg = getConfig();
  const gs = cfg.gracefulShutdown;
  const config: ShutdownConfig = {
    enabled: gs?.enabled ?? true,
    timeout: gs?.timeout ?? 30000,
    forceTimeout: gs?.forceTimeout ?? 5000,
    signals: gs?.signals ?? ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  };

  return new GracefulShutdown(config, logger);
}
