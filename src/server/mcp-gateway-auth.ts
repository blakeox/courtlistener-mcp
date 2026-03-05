import type { McpAuthorizationResult, WorkerSecurityEnv, WorkerSecurityDeps } from './worker-security.js';
import {
  authorizeMcpRequestWithPrincipal,
  parseBoolean,
  validateProtocolHeaderNegotiation,
  validateProtocolVersionHeader,
  type ProtocolHeaderValidationResult,
} from './worker-security.js';

interface McpGatewayAuthDeps {
  authorizeMcpRequestWithPrincipalFn?: (
    request: Request,
    env: WorkerSecurityEnv,
    deps?: WorkerSecurityDeps,
  ) => Promise<McpAuthorizationResult>;
  validateProtocolVersionHeaderFn?: (
    protocolVersion: string | null,
    required: boolean,
    supportedVersions: ReadonlySet<string>,
  ) => Response | null;
  validateProtocolHeaderNegotiationFn?: (
    protocolVersion: string | null,
    capabilityProfile: string | null,
    required: boolean,
    supportedVersions: ReadonlySet<string>,
  ) => ProtocolHeaderValidationResult;
  parseBooleanFn?: (value: string | undefined) => boolean;
}

export interface AuthorizeMcpGatewayRequestParams {
  request: Request;
  env: WorkerSecurityEnv & { MCP_REQUIRE_PROTOCOL_VERSION?: string };
  supportedProtocolVersions: ReadonlySet<string>;
  deps?: McpGatewayAuthDeps;
}

export async function authorizeMcpGatewayRequest(
  params: AuthorizeMcpGatewayRequestParams,
): Promise<McpAuthorizationResult> {
  const { request, env, supportedProtocolVersions, deps } = params;
  const authorize = deps?.authorizeMcpRequestWithPrincipalFn ?? authorizeMcpRequestWithPrincipal;
  const parse = deps?.parseBooleanFn ?? parseBoolean;
  const validate = deps?.validateProtocolVersionHeaderFn ?? validateProtocolVersionHeader;
  const validateNegotiation =
    deps?.validateProtocolHeaderNegotiationFn ?? validateProtocolHeaderNegotiation;

  const authResult = await authorize(request, env);
  if (authResult.authError) {
    return authResult;
  }

  if (request.method === 'POST') {
    const requireProtocolVersion = parse(env.MCP_REQUIRE_PROTOCOL_VERSION);
    const protocolVersion = request.headers.get('MCP-Protocol-Version');
    const capabilityProfile = request.headers.get('MCP-Capability-Profile');
    const negotiation = validateNegotiation(
      protocolVersion,
      capabilityProfile,
      requireProtocolVersion,
      supportedProtocolVersions,
    );
    const protocolError =
      negotiation.error ??
      (deps?.validateProtocolHeaderNegotiationFn === undefined &&
      deps?.validateProtocolVersionHeaderFn !== undefined
        ? validate(protocolVersion, requireProtocolVersion, supportedProtocolVersions)
        : null);
    if (protocolError) {
      return {
        authError: protocolError,
        ...(authResult.principal ? { principal: authResult.principal } : {}),
        protocolNegotiation: negotiation.diagnostics,
      };
    }
    return {
      ...authResult,
      protocolNegotiation: negotiation.diagnostics,
    };
  }

  return authResult;
}
