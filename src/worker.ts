/**
 * @deprecated Monolith entry replaced by split workers:
 * - `worker-edge.ts` — portal, OAuth, SPA, UI API
 * - `worker-mcp.ts` — `/mcp`, `/sse`, CourtListenerMCP DO, async queue
 */
export { default } from './worker-edge.js';
export { CourtListenerMCP } from './worker/courtlistener-mcp-agent.js';
