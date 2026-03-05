import {
  HOSTED_MCP_OAUTH_CONTRACT,
  buildHostedMcpAuthorizationServerMetadata,
  buildHostedMcpProtectedResourceMetadata,
} from '../auth/oauth-contract.js';
import {
  buildSupabaseHostedOAuthAuthorizeUrl,
  buildSupabaseHostedOAuthTokenUrl,
} from '../auth/oauth-service.js';

interface WorkerOAuthRouteContext<TEnv> {
  request: Request;
  url: URL;
  env: TEnv;
}

interface SupabaseSignupLikeConfig {
  url: string;
  anonKey: string;
}

export interface WorkerOAuthRouteDeps<TEnv, TSignupConfig extends SupabaseSignupLikeConfig> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
  getSupabaseSignupConfig: (env: TEnv) => TSignupConfig | null;
  redirectResponse: (location: string, status?: number, extraHeaders?: HeadersInit) => Response;
  fetchFn?: typeof fetch;
}

function getRequestOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export async function handleWorkerOAuthRoutes<TEnv, TSignupConfig extends SupabaseSignupLikeConfig>(
  context: WorkerOAuthRouteContext<TEnv>,
  deps: WorkerOAuthRouteDeps<TEnv, TSignupConfig>,
): Promise<Response | null> {
  const { request, url, env } = context;

  if (url.pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorizationServerMetadata) {
    if (request.method !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const origin = getRequestOrigin(url);
    return deps.jsonResponse(
      buildHostedMcpAuthorizationServerMetadata(origin),
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  if (url.pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.protectedResourceMetadata) {
    if (request.method !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const origin = getRequestOrigin(url);
    return deps.jsonResponse(
      buildHostedMcpProtectedResourceMetadata(origin),
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  if (url.pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.authorize) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!signupConfig) {
      return deps.jsonError(
        'Supabase public signup is not configured on this worker.',
        503,
        'supabase_signup_not_configured',
      );
    }

    let authorizeParams = url.searchParams;
    if (request.method === 'POST') {
      const mergedParams = new URLSearchParams(url.searchParams);
      const bodyParams = new URLSearchParams(await request.text());
      bodyParams.forEach((value, key) => mergedParams.append(key, value));
      authorizeParams = mergedParams;
    }

    const authorizeUrl = buildSupabaseHostedOAuthAuthorizeUrl(signupConfig.url, authorizeParams);
    return deps.redirectResponse(authorizeUrl.toString(), 302);
  }

  if (url.pathname === HOSTED_MCP_OAUTH_CONTRACT.paths.token) {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!signupConfig) {
      return deps.jsonError(
        'Supabase public signup is not configured on this worker.',
        503,
        'supabase_signup_not_configured',
      );
    }

    const tokenUrl = buildSupabaseHostedOAuthTokenUrl(signupConfig.url, url.searchParams);

    const contentType =
      request.headers.get('content-type')?.trim() || 'application/x-www-form-urlencoded';
    const accept = request.headers.get('accept')?.trim() || 'application/json';
    const body = await request.text();
    const formEncodedContentType = contentType.toLowerCase();
    const bodyGrantType = formEncodedContentType.includes('application/x-www-form-urlencoded')
      ? new URLSearchParams(body).get('grant_type')?.trim()
      : null;
    const queryGrantType = url.searchParams.get('grant_type')?.trim() || null;
    const grantType = bodyGrantType || queryGrantType;
    if (
      grantType &&
      !HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported.includes(
        grantType as (typeof HOSTED_MCP_OAUTH_CONTRACT.grantTypesSupported)[number],
      )
    ) {
      return deps.jsonError('Unsupported grant_type.', 400, 'unsupported_grant_type');
    }
    const fetchFn = deps.fetchFn ?? fetch;
    const upstreamResponse = await fetchFn(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        apikey: signupConfig.anonKey,
        Authorization: `Bearer ${signupConfig.anonKey}`,
        'content-type': contentType,
        accept,
      },
      body,
    });

    const proxyHeaders = new Headers();
    for (const headerName of ['content-type', 'cache-control', 'pragma', 'www-authenticate']) {
      const headerValue = upstreamResponse.headers.get(headerName);
      if (headerValue) {
        proxyHeaders.set(headerName, headerValue);
      }
    }
    if (!proxyHeaders.has('cache-control')) {
      proxyHeaders.set('cache-control', 'no-store');
    }

    return new Response(await upstreamResponse.text(), {
      status: upstreamResponse.status,
      headers: proxyHeaders,
    });
  }

  return null;
}
