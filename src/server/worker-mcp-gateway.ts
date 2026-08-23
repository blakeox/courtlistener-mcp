/// <reference types="@cloudflare/workers-types" />

import type { WorkerSecurityEnv } from './worker-security.js';
import {
  handleMcpTransportBoundary,
  type HandleMcpTransportBoundaryParams,
} from './mcp-transport-runtime-facade.js';

export interface HandleMcpGatewayRouteParams<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> extends HandleMcpTransportBoundaryParams<Env> {}

type McpGatewayRouteContext<
  Env extends WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string },
> = Pick<
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
  return handleMcpTransportBoundary(params);
}
