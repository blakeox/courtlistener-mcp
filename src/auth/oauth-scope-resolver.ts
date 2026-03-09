import { HOSTED_MCP_OAUTH_CONTRACT } from './oauth-contract.js';

export function resolveGrantedScopes(authRequest: { scope: string[] }): string[] {
  const supportedScopes = new Set<string>(HOSTED_MCP_OAUTH_CONTRACT.scopesSupported);
  const requestedScopes = authRequest.scope.filter((scope) => supportedScopes.has(scope));
  return requestedScopes.length > 0 ? requestedScopes : [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported];
}
