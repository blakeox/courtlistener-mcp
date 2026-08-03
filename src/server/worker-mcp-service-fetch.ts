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

/** Probe MCP readiness with a bounded wait so Edge never hangs on a bad binding. */
export async function fetchMcpWorkerReadiness(
  request: Request,
  env: WorkerEdgeEnv,
  timeoutMs = 1_500,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('mcp_readiness_timeout'), timeoutMs);
  try {
    const probe = new Request(request, { signal: controller.signal });
    if (env.MCP_SERVICE) {
      return await env.MCP_SERVICE.fetch(probe);
    }

    return await fetchMcpWorkerService(probe, env);
  } finally {
    clearTimeout(timeout);
  }
}
