/// <reference types="@cloudflare/workers-types" />

import type { WorkerSecurityEnv } from './worker-security.js';
import {
  handleMcpTransportBoundary,
  type HandleMcpTransportBoundaryParams,
} from './mcp-transport-runtime-facade.js';

export interface HandleWorkerMcpTransportBoundaryParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> extends HandleMcpTransportBoundaryParams<Env> {}

export async function handleWorkerMcpTransportBoundary<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
>(params: HandleWorkerMcpTransportBoundaryParams<Env>): Promise<Response | null> {
  return handleMcpTransportBoundary(params);
}
