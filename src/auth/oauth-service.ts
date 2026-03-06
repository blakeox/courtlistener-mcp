import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { HOSTED_MCP_OAUTH_CONTRACT, HOSTED_MCP_OAUTH_DEFAULT_SCOPE } from './oauth-contract.js';

export function getHostedMcpScopesSupported(): string[] {
  return [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported];
}

export function resolveHostedMcpRequestedScopes(scopes?: string[]): string[] {
  const supportedScopes = getHostedMcpScopesSupported();
  if (!scopes?.length) return supportedScopes;
  const validScopes = scopes.filter((scope) => supportedScopes.includes(scope));
  if (validScopes.length === 0) {
    throw new Error(`No valid scopes requested. Supported: ${supportedScopes.join(', ')}`);
  }
  return validScopes;
}

export function buildHostedMcpDefaultClientAttributes(
  clientSecret?: string,
): Pick<
  OAuthClientInformationFull,
  'token_endpoint_auth_method' | 'grant_types' | 'response_types' | 'scope'
> {
  return {
    token_endpoint_auth_method: clientSecret ? 'client_secret_post' : 'none',
    grant_types: [...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported],
    response_types: [...HOSTED_MCP_OAUTH_CONTRACT.responseTypesSupported],
    scope: HOSTED_MCP_OAUTH_DEFAULT_SCOPE,
  };
}
