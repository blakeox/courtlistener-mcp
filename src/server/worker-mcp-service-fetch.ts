import type { WorkerEdgeEnv } from './worker-runtime-contract.js';

const DEFAULT_DEV_MCP_UPSTREAM = 'http://127.0.0.1:3001';

/**
 * Forward a request to the MCP worker (production service binding or local dev upstream).
 */
export function fetchMcpWorkerService(request: Request, env: WorkerEdgeEnv): Promise<Response> {
  if (env.MCP_SERVICE) {
    return env.MCP_SERVICE.fetch(request);
  }

  const upstreamBase = (env.MCP_DEV_UPSTREAM_URL ?? DEFAULT_DEV_MCP_UPSTREAM).replace(/\/$/, '');
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, upstreamBase);
  return fetch(new Request(target, request));
}
