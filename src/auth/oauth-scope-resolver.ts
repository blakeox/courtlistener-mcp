import { HOSTED_MCP_OAUTH_CONTRACT } from './oauth-contract.js';

export interface OAuthScopeAuthorizationRequest {
  scope: string[];
  redirectUri?: string;
  state?: string;
}

export class UnsupportedOAuthScopeError extends Error {
  readonly code = 'invalid_scope' as const;

  constructor(
    readonly authRequest: OAuthScopeAuthorizationRequest,
    readonly unsupportedScopes: string[],
  ) {
    super('The OAuth authorization request contains unsupported scopes.');
    this.name = 'UnsupportedOAuthScopeError';
  }
}

export function getUnsupportedScopes(authRequest: { scope: string[] }): string[] {
  const supportedScopes = new Set<string>(HOSTED_MCP_OAUTH_CONTRACT.scopesSupported);
  return authRequest.scope.filter((scope) => !supportedScopes.has(scope));
}

export function buildOAuthErrorRedirect(
  authRequest: OAuthScopeAuthorizationRequest,
  error: string,
  errorDescription: string,
): string | null {
  if (!authRequest.redirectUri) return null;

  const redirect = new URL(authRequest.redirectUri);
  redirect.hash = '';
  redirect.searchParams.set('error', error);
  redirect.searchParams.set('error_description', errorDescription);
  if (authRequest.state) {
    redirect.searchParams.set('state', authRequest.state);
  }
  return redirect.toString();
}

export function resolveGrantedScopes(authRequest: OAuthScopeAuthorizationRequest): string[] {
  const unsupportedScopes = getUnsupportedScopes(authRequest);
  if (unsupportedScopes.length > 0) {
    throw new UnsupportedOAuthScopeError(authRequest, unsupportedScopes);
  }

  const requestedScopes = authRequest.scope.filter((scope) =>
    HOSTED_MCP_OAUTH_CONTRACT.scopesSupported.includes(
      scope as (typeof HOSTED_MCP_OAUTH_CONTRACT.scopesSupported)[number],
    ),
  );
  return requestedScopes.length > 0
    ? requestedScopes
    : [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported];
}
