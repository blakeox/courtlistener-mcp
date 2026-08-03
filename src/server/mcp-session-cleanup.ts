import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

type SessionCleanupHandler = (sessionId: string) => void;

const sessionCleanupHandlers = new WeakMap<Server, SessionCleanupHandler>();

export function registerMcpSessionCleanup(server: Server, handler: SessionCleanupHandler): void {
  sessionCleanupHandlers.set(server, handler);
}

export function runMcpSessionCleanup(server: Server, sessionId: string): void {
  sessionCleanupHandlers.get(server)?.(sessionId);
}
