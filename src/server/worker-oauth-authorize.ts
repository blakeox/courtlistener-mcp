import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { HOSTED_MCP_OAUTH_CONTRACT } from '../auth/oauth-contract.js';
import {
  emitOAuthDiagnostic,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from './oauth-diagnostics.js';

interface OAuthAuthorizeEnv {
  MCP_AUTH_UI_ORIGIN?: string;
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_OAUTH_DIAGNOSTICS?: string;
}

interface OAuthAuthorizeDeps<TEnv extends OAuthAuthorizeEnv> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  redirectResponse: (location: string, status?: number) => Response;
  resolveCloudflareOAuthUserId: (request: Request, env: TEnv) => Promise<string | null>;
}

export async function handleWorkerOAuthAuthorizeRoute<TEnv extends OAuthAuthorizeEnv>(
  request: Request,
  env: TEnv,
  deps: OAuthAuthorizeDeps<TEnv>,
): Promise<Response> {
  const requestSummary = await summarizeOAuthRequest(request);
  if (request.method !== 'GET') {
    const response = deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    emitOAuthDiagnostic(env, 'oauth.authorize.reject', {
      ...requestSummary,
      reason: 'method_not_allowed',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  const sessionUserId = await deps.resolveCloudflareOAuthUserId(request, env);
  if (!sessionUserId) {
    const authUiOrigin = env.MCP_AUTH_UI_ORIGIN?.trim();
    if (authUiOrigin) {
      try {
        const authStartUrl = new URL('/auth/start', authUiOrigin);
        authStartUrl.searchParams.set('return_to', request.url);
        const response = deps.redirectResponse(authStartUrl.toString(), 302);
        emitOAuthDiagnostic(env, 'oauth.authorize.redirect_auth_ui', {
          ...requestSummary,
          auth_ui_origin: authUiOrigin,
          clerk_handoff: true,
          ...(await summarizeOAuthResponse(response)),
        });
        return response;
      } catch {
        // Ignore invalid auth origin and fall through to JSON error.
      }
    }

    const response = deps.jsonError(
      'User identity is required for OAuth authorization. Sign in via the configured auth UI or provide a valid OIDC token, or configure MCP_OAUTH_DEV_USER_ID + MCP_ALLOW_DEV_FALLBACK=true for controlled development.',
      401,
      'identity_required',
    );
    emitOAuthDiagnostic(env, 'oauth.authorize.identity_required', {
      ...requestSummary,
      clerk_handoff: false,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  let authRequest;
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (error) {
    const response = deps.jsonError(
      error instanceof Error && error.message
        ? error.message
        : 'Invalid OAuth authorization request.',
      400,
      'invalid_authorization_request',
    );
    emitOAuthDiagnostic(env, 'oauth.authorize.reject', {
      ...requestSummary,
      reason: 'invalid_authorization_request',
      error_message: error instanceof Error ? error.message : 'unknown_error',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }
  const supportedScopes = new Set<string>(HOSTED_MCP_OAUTH_CONTRACT.scopesSupported);
  const requestedScopes = authRequest.scope.filter((scope) => supportedScopes.has(scope));
  const grantedScopes =
    requestedScopes.length > 0 ? requestedScopes : [...HOSTED_MCP_OAUTH_CONTRACT.scopesSupported];

  let completion;
  try {
    completion = await env.OAUTH_PROVIDER.completeAuthorization({
      request: authRequest,
      userId: sessionUserId,
      metadata: { source: 'cloudflare_oauth', approved_at: new Date().toISOString() },
      scope: grantedScopes,
      props: {
        userId: sessionUserId,
        authMethod: 'cloudflare_oauth',
      },
    });
  } catch (error) {
    const response = deps.jsonError(
      error instanceof Error && error.message
        ? error.message
        : 'OAuth authorization could not be completed.',
      400,
      'authorization_completion_failed',
    );
    emitOAuthDiagnostic(env, 'oauth.authorize.reject', {
      ...requestSummary,
      reason: 'authorization_completion_failed',
      error_message: error instanceof Error ? error.message : 'unknown_error',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  const response = deps.redirectResponse(completion.redirectTo, 302);
  emitOAuthDiagnostic(env, 'oauth.authorize.completed', {
    ...requestSummary,
    user_present: true,
    granted_scope_count: grantedScopes.length,
    granted_scopes: grantedScopes,
    auth_method: 'cloudflare_oauth',
    ...(await summarizeOAuthResponse(response)),
  });
  return response;
}
