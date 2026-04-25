import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

import { buildHostedOAuthCompletionDetails } from '../auth/oauth-authorization-completion.js';
import { resolveGrantedScopes } from '../auth/oauth-scope-resolver.js';
import {
  emitOAuthDiagnostic,
  summarizeOAuthRequest,
  summarizeOAuthResponse,
} from './oauth-diagnostics.js';
import {
  evaluateWorkerHostedAuthConfig,
  type WorkerHostedAuthEnv,
} from './worker-upstream-oidc-config.js';

interface OAuthAuthorizeEnv extends WorkerHostedAuthEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_OAUTH_DIAGNOSTICS?: string;
}

interface OAuthAuthorizeDeps<TEnv extends OAuthAuthorizeEnv> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  redirectResponse: (location: string, status?: number) => Response;
  resolveCloudflareOAuthIdentity: (
    request: Request,
    env: TEnv,
  ) => Promise<
    | {
        kind: 'authenticated';
        userId: string;
        authSource: 'oidc_bearer' | 'ui_session' | 'cloudflare_access' | 'dev_fallback';
      }
    | { kind: 'missing' }
    | { kind: 'session_revocation_unavailable' }
  >;
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

  const identity = await deps.resolveCloudflareOAuthIdentity(request, env);
  if (identity.kind === 'session_revocation_unavailable') {
    const response = deps.jsonError(
      'Unable to validate session revocation.',
      503,
      'session_revocation_unavailable',
    );
    emitOAuthDiagnostic(env, 'oauth.authorize.reject', {
      ...requestSummary,
      reason: 'session_revocation_unavailable',
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (identity.kind !== 'authenticated') {
    const hostedAuthDiagnostics = evaluateWorkerHostedAuthConfig(env);
    if (hostedAuthDiagnostics.relevantEnvPresent) {
      try {
        const authStartUrl = new URL('/auth/start', request.url);
        authStartUrl.searchParams.set('return_to', request.url);
        const response = deps.redirectResponse(authStartUrl.toString(), 302);
        emitOAuthDiagnostic(env, 'oauth.authorize.redirect_auth_ui', {
          ...requestSummary,
          auth_ui_origin: new URL(request.url).origin,
          auth_ui_handoff: true,
          ...(await summarizeOAuthResponse(response)),
        });
        return response;
      } catch {
        // Ignore invalid URL construction and fall through to JSON error.
      }
    }

    const response = deps.jsonError(
      'User identity is required for OAuth authorization. Sign in via the worker-hosted auth flow or provide a valid OIDC token, or configure MCP_OAUTH_DEV_USER_ID + MCP_ALLOW_DEV_FALLBACK=true only for controlled development. This fallback is unsafe for production use.',
      401,
      'identity_required',
    );
    emitOAuthDiagnostic(env, 'oauth.authorize.identity_required', {
      ...requestSummary,
      auth_ui_handoff: false,
      ...(await summarizeOAuthResponse(response)),
    });
    return response;
  }

  if (identity.authSource !== 'oidc_bearer') {
    const approvalUrl = new URL('/auth/approve', request.url);
    approvalUrl.searchParams.set('return_to', request.url);
    const response = deps.redirectResponse(approvalUrl.toString(), 302);
    emitOAuthDiagnostic(env, 'oauth.authorize.redirect_auth_ui', {
      ...requestSummary,
      auth_ui_origin: new URL(request.url).origin,
      auth_ui_handoff: true,
      approval_required: true,
      auth_source: identity.authSource,
      dev_fallback_unsafe: identity.authSource === 'dev_fallback',
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
  const grantedScopes = resolveGrantedScopes(authRequest);

  let completion;
  try {
    const completionDetails = buildHostedOAuthCompletionDetails(
      'cloudflare_oauth',
      identity.userId,
    );
    completion = await env.OAUTH_PROVIDER.completeAuthorization({
      request: authRequest,
      userId: identity.userId,
      metadata: completionDetails.metadata,
      scope: grantedScopes,
      props: completionDetails.props,
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
