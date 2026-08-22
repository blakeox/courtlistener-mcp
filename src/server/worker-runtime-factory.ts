import { bootstrapServices } from '../infrastructure/bootstrap.js';
import { DIContainer } from '../infrastructure/container.js';
import type { ConfigEnvironment } from '../infrastructure/config.js';
import type { Logger } from '../infrastructure/logger.js';
import type { MetricsCollector } from '../infrastructure/metrics.js';
import type { ServerConfig } from '../types.js';
import type { PromptHandlerRegistry } from './prompt-handler.js';
import type { ResourceHandlerRegistry } from './resource-handler.js';
import type { ToolHandlerRegistry } from './tool-handler.js';
import type { WorkerMcpEnv } from './worker-runtime-contract.js';

export interface WorkerRuntime {
  container: DIContainer;
  config: ServerConfig;
  logger: Logger;
  metrics: MetricsCollector;
  promptRegistry: PromptHandlerRegistry;
  resourceRegistry: ResourceHandlerRegistry;
  toolRegistry: ToolHandlerRegistry;
}

export function createWorkerRuntime(env: WorkerMcpEnv): WorkerRuntime {
  const serviceContainer = new DIContainer();
  const configEnvironment: ConfigEnvironment = Object.fromEntries(
    Object.entries(env).filter(([, value]) => typeof value === 'string'),
  );

  bootstrapServices(configEnvironment, serviceContainer);

  return {
    container: serviceContainer,
    config: serviceContainer.get<ServerConfig>('config'),
    logger: serviceContainer.get<Logger>('logger'),
    metrics: serviceContainer.get<MetricsCollector>('metrics'),
    promptRegistry: serviceContainer.get<PromptHandlerRegistry>('promptRegistry'),
    resourceRegistry: serviceContainer.get<ResourceHandlerRegistry>('resourceRegistry'),
    toolRegistry: serviceContainer.get<ToolHandlerRegistry>('toolRegistry'),
  };
}
