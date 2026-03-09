export const HOSTED_MCP_OAUTH_CONTRACT = {
  priorityClients: ['chatgpt', 'codex', 'vscode-copilot'],
  paths: {
    authorizationServerMetadata: '/.well-known/oauth-authorization-server',
    openIdConfiguration: '/.well-known/openid-configuration',
    protectedResourceMetadata: '/.well-known/oauth-protected-resource',
    authorize: '/authorize',
    token: '/token',
    register: '/register',
  },
  responseTypesSupported: ['code'],
  responseModesSupported: ['query'],
  grantTypesSupported: ['authorization_code', 'refresh_token'],
  tokenEndpointAuthMethodsSupported: ['client_secret_basic', 'client_secret_post', 'none'],
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
    response_modes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.responseModesSupported],
    grant_types_supported: [...HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported],
    token_endpoint_auth_methods_supported: [
      ...HOSTED_MCP_OAUTH_CONTRACT.tokenEndpointAuthMethodsSupported,
    ],
    revocation_endpoint: `${origin}${HOSTED_MCP_OAUTH_CONTRACT.paths.token}`,
    code_challenge_methods_supported: [...HOSTED_MCP_OAUTH_CONTRACT.codeChallengeMethodsSupported],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
    client_id_metadata_document_supported: false,
  };
}

export function buildHostedMcpOpenIdConfiguration(origin: string) {
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
  const resource = new URL('/', origin).href.replace(/\/$/, '');
  return {
    resource,
    authorization_servers: [origin],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
    bearer_methods_supported: ['header'],
    resource_name: 'CourtListener MCP',
  };
}

export function buildHostedMcpProtectedResourceMetadataForPath(origin: string, resourcePath: string) {
  const authorizationServer = origin;
  void resourcePath;
  const resource = new URL('/', origin).href.replace(/\/$/, '');
  return {
    resource,
    authorization_servers: [authorizationServer],
    scopes_supported: [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported],
    bearer_methods_supported: ['header'],
    resource_name: 'CourtListener MCP',
  };
}
