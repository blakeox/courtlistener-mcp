import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { HOSTED_MCP_OAUTH_CONTRACT, HOSTED_MCP_OAUTH_DEFAULT_SCOPE } from './oauth-contract.js';

function cleanUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function copyQueryParams(source: URLSearchParams, target: URLSearchParams): void {
  source.forEach((value, key) => {
    target.append(key, value);
  });
}

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

export function buildSupabaseHostedOAuthAuthorizeUrl(
  supabaseUrl: string,
  queryParams: URLSearchParams,
): URL {
  const authorizeUrl = new URL(`${cleanUrl(supabaseUrl)}/auth/v1/authorize`);
  copyQueryParams(queryParams, authorizeUrl.searchParams);
  return authorizeUrl;
}

export function buildSupabaseHostedOAuthTokenUrl(
  supabaseUrl: string,
  queryParams: URLSearchParams,
): URL {
  const tokenUrl = new URL(`${cleanUrl(supabaseUrl)}/auth/v1/token`);
  copyQueryParams(queryParams, tokenUrl.searchParams);
  return tokenUrl;
}
