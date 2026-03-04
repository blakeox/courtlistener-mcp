import {
  registerProtocolSurfaceHandlers,
  type HandlerDependencies,
} from './protocol-surface-adapter.js';

export type { HandlerDependencies } from './protocol-surface-adapter.js';

/**
 * Register all MCP protocol handlers on the given server instance.
 */
export function setupHandlers(deps: HandlerDependencies): void {
  registerProtocolSurfaceHandlers(deps);
}
