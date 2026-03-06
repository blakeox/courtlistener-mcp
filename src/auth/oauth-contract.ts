export const HOSTED_MCP_OAUTH_CONTRACT = {
  priorityClients: ['chatgpt', 'codex', 'vscode-copilot'],
  paths: {
    authorizationServerMetadata: '/.well-known/oauth-authorization-server',
    protectedResourceMetadata: '/.well-known/oauth-protected-resource',
    authorize: '/authorize',
    token: '/token',
    register: '/register',
  },
  responseTypesSupported: ['code'],
  grantTypesSupported: ['authorization_code', 'refresh_token'],
  tokenEndpointAuthMethodsSupported: ['client_secret_post', 'none'],
  codeChallengeMethodsSupported: ['S256'],
  scopesSupported: ['legal:read', 'legal:search', 'legal:analyze'],
} as const;

export const HOSTED_MCP_OAUTH_DEFAULT_SCOPE =
  HOSTED_MCP_OAUTH_CONTRACT.scopesSupported.join(' ');

export function buildHostedMcpAuthorizationServerMetadata(origin: string) {
  const issuer = origin;
  return {
    issuer,
    authorization_endpoint: `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.authorize}`,
    token_endpoint: `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`,
    registration_endpoint: `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.register}`,
    response_types_supported: [...HOSTED_MCP_OAUTH_CONTRACT.responseTypesSupported],
    grant_types_supported: [...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported],
    token_endpoint_auth_methods_supported: [
      ...HOSTED_MCP_OAUTH_CONTRACT.tokenEndpointAuthMethodsSupported,
    ],
    code_challenge_methods_supported: [...HOSTED_MCP_OAUTH_CONTRACT.codeChallengeMethodsSupported],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
  };
}

export function buildHostedMcpProtectedResourceMetadata(origin: string) {
  const resource = new URL('/mcp', origin).href;
  return {
    resource,
    authorization_servers: [origin],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
  };
}

export function buildHostedMcpProtectedResourceMetadataForPath(origin: string, resourcePath: string) {
  const authorizationServer = origin;
  const normalizedPath = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  const resource = new URL(normalizedPath, origin).href;
  return {
    resource,
    authorization_servers: [authorizationServer],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
  };
}
