/// <reference types="@cloudflare/workers-types" />

import type { WorkerSecurityEnv } from './worker-security.js';
import {
  handleWorkerMcpTransportBoundary,
  type HandleWorkerMcpTransportBoundaryParams,
} from './worker-mcp-transport-boundary.js';

export interface HandleMcpGatewayRouteParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> extends HandleWorkerMcpTransportBoundaryParams<Env> {}

type McpGatewayRouteContext<Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string }> = Pick<
  HandleMcpGatewayRouteParams<Env>,
  'request' | 'env' | 'ctx' | 'pathname' | 'requestMethod' | 'origin' | 'allowedOrigins' | 'mcpPath'
>;

export type McpGatewayBoundaryPolicyParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> = Omit<
  HandleMcpGatewayRouteParams<Env>,
  'request' | 'env' | 'ctx' | 'pathname' | 'requestMethod' | 'origin' | 'allowedOrigins' | 'mcpPath'
>;

export function buildMcpGatewayRouteParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
>(
  context: McpGatewayRouteContext<Env>,
  policy: McpGatewayBoundaryPolicyParams<Env>,
): HandleMcpGatewayRouteParams<Env> {
  return { ...context, ...policy };
}

export async function handleMcpGatewayRoute<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
>(params: HandleMcpGatewayRouteParams<Env>): Promise<Response | null> {
  return handleWorkerMcpTransportBoundary(params);
}
