/**
 * Backward-compatible re-export.
 *
 * The implementation has been split into focused modules:
 * - {@link ./mcp-server.js} — main server class
 * - {@link ./handler-registry.js} — MCP handler registration
 * - {@link ./tool-builder.js} — tool definition building
 *
 * Import from here or directly from the submodules.
 */
export { BestPracticeLegalMCPServer } from './mcp-server.js';
