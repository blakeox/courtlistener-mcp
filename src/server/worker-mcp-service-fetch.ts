import type { WorkerEdgeEnv } from './worker-runtime-contract.js';

/**
 * Forward a request to the MCP worker through the Cloudflare service binding.
 */
export function fetchMcpWorkerService(request: Request, env: WorkerEdgeEnv): Promise<Response> {
  const forwardedRequest = withMcpServiceToken(request, env);
  const service = env.MCP_SERVICE;
  if (!service) {
    return Promise.reject(new Error('MCP_SERVICE binding is missing.'));
  }
  return service.fetch(forwardedRequest);
}

function withMcpServiceToken(request: Request, env: WorkerEdgeEnv): Request {
  const serviceToken = env.MCP_AUTH_TOKEN?.trim();
  if (!serviceToken) return request;

  const headers = new Headers(request.headers);
  const serviceHeader = env.MCP_SERVICE_TOKEN_HEADER?.trim() || 'x-mcp-service-token';
  headers.set(serviceHeader, serviceToken);
  return new Request(request, { headers });
}

/** Probe MCP readiness with a bounded wait so Edge never hangs on a bad binding. */
export async function fetchMcpWorkerReadiness(
  request: Request,
  env: WorkerEdgeEnv,
  timeoutMs = 1_500,
): Promise<Response> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort('mcp_readiness_timeout');
      reject(new Error('mcp_readiness_timeout'));
    }, timeoutMs);
  });
  try {
    const probe = new Request(request, { signal: controller.signal });
    const service = env.MCP_SERVICE;
    if (!service) {
      throw new Error('MCP_SERVICE binding is missing.');
    }
    return await Promise.race([service.fetch(probe), timeoutError]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
