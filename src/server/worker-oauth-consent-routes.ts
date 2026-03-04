interface UiSessionPayload {
  jti: string;
}

type OAuthConsentDecision = 'approve' | 'deny';

interface OAuthConsentRouteContext<TEnv> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
}

type OAuthAuthorizationDetailsResult<TOAuthDetails> =
  | { type: 'redirect'; redirectUrl: string }
  | { type: 'details'; details: TOAuthDetails };

export interface OAuthConsentRouteDeps<TEnv, TSignupConfig, TOAuthDetails> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  rejectDisallowedUiOrigin: (origin: string | null, allowedOrigins: string[]) => Response | null;
  getSupabaseSignupConfig: (env: TEnv) => TSignupConfig | null;
  getUiSessionSecret: (env: TEnv) => string | null;
  getCookieValue: (request: Request, name: string) => string | null | undefined;
  parseUiSessionToken: (token: string) => UiSessionPayload | null;
  getUiSessionUserId: (request: Request, secret: string) => Promise<string | null>;
  isUiSessionRevoked: (env: TEnv, jti: string) => Promise<boolean>;
  redirectResponse: (location: string, status?: number, extraHeaders?: HeadersInit) => Response;
  getUiSessionSupabaseAccessToken: (env: TEnv, jti: string) => Promise<string | null>;
  getOAuthAuthorizationDetails: (
    config: TSignupConfig,
    accessToken: string,
    authorizationId: string,
  ) => Promise<OAuthAuthorizationDetailsResult<TOAuthDetails>>;
  sanitizeExternalHttpUrl: (value: string | null | undefined) => string | null;
  getCsrfTokenFromCookie: (request: Request) => string | null;
  generateRandomToken: (bytesLength?: number) => string;
  generateCspNonce: () => string;
  buildCsrfCookie: (token: string, secure: boolean) => string;
  isSecureCookieRequest: (request: Request, env: TEnv) => boolean;
  htmlResponse: (html: string, nonce: string, extraHeaders?: HeadersInit) => Response;
  renderOAuthConsentHtml: (details: TOAuthDetails, csrfToken: string, nonce: string) => string;
  clearUiSessionSupabaseAccessToken: (env: TEnv, jti: string) => Promise<void>;
  submitOAuthAuthorizationConsent: (
    config: TSignupConfig,
    accessToken: string,
    authorizationId: string,
    decision: OAuthConsentDecision,
  ) => Promise<{ redirectUrl: string }>;
  constantTimeEqual: (a: string, b: string) => boolean;
}

export async function handleWorkerOAuthConsentRoutes<TEnv, TSignupConfig, TOAuthDetails>(
  context: OAuthConsentRouteContext<TEnv>,
  deps: OAuthConsentRouteDeps<TEnv, TSignupConfig, TOAuthDetails>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins, env } = context;

  if (url.pathname !== '/oauth/consent') {
    return null;
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
  }
  const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
  if (uiOriginRejection) return uiOriginRejection;

  const signupConfig = deps.getSupabaseSignupConfig(env);
  if (!signupConfig) {
    return deps.jsonError(
      'Supabase public signup is not configured on this worker.',
      503,
      'supabase_signup_not_configured',
    );
  }

  const sessionSecret = deps.getUiSessionSecret(env);
  if (!sessionSecret) {
    return deps.jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
  }

  const cookieToken = deps.getCookieValue(request, 'clmcp_ui');
  const parsedPayload = cookieToken ? deps.parseUiSessionToken(cookieToken) : null;
  const sessionUserId = await deps.getUiSessionUserId(request, sessionSecret);
  const nextPathWithQuery = `${url.pathname}${url.search}`;

  if (!parsedPayload || !sessionUserId || (await deps.isUiSessionRevoked(env, parsedPayload.jti))) {
    const loginUrl = new URL('/app/login', request.url);
    loginUrl.searchParams.set('next', nextPathWithQuery);
    return deps.redirectResponse(loginUrl.toString(), 302);
  }

  const supabaseAccessToken = await deps.getUiSessionSupabaseAccessToken(env, parsedPayload.jti);
  if (!supabaseAccessToken) {
    const loginUrl = new URL('/app/login', request.url);
    loginUrl.searchParams.set('next', nextPathWithQuery);
    return deps.redirectResponse(loginUrl.toString(), 302);
  }

  if (request.method === 'GET') {
    const authorizationId = url.searchParams.get('authorization_id')?.trim() || '';
    if (!authorizationId) {
      return deps.jsonError('authorization_id is required.', 400, 'missing_authorization_id');
    }

    try {
      const authorizationResult = await deps.getOAuthAuthorizationDetails(
        signupConfig,
        supabaseAccessToken,
        authorizationId,
      );
      if (authorizationResult.type === 'redirect') {
        const safeRedirectUrl = deps.sanitizeExternalHttpUrl(authorizationResult.redirectUrl);
        if (!safeRedirectUrl) {
          return deps.jsonError('Invalid OAuth redirect URL.', 400, 'invalid_oauth_redirect');
        }
        return deps.redirectResponse(safeRedirectUrl, 302);
      }

      const csrfToken = deps.getCsrfTokenFromCookie(request) ?? deps.generateRandomToken(24);
      const nonce = deps.generateCspNonce();
      const setCookieHeader = deps.getCsrfTokenFromCookie(request)
        ? undefined
        : deps.buildCsrfCookie(csrfToken, deps.isSecureCookieRequest(request, env));
      return deps.htmlResponse(
        deps.renderOAuthConsentHtml(authorizationResult.details, csrfToken, nonce),
        nonce,
        setCookieHeader ? { 'Set-Cookie': setCookieHeader } : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('access_token') || message.includes('401') || message.includes('403')) {
        await deps.clearUiSessionSupabaseAccessToken(env, parsedPayload.jti);
        const loginUrl = new URL('/app/login', request.url);
        loginUrl.searchParams.set('next', nextPathWithQuery);
        return deps.redirectResponse(loginUrl.toString(), 302);
      }
      return deps.jsonError('Failed to load authorization request.', 400, 'oauth_authorization_load_failed');
    }
  }

  const form = await request.formData();
  const authorizationId =
    (typeof form.get('authorization_id') === 'string' ? (form.get('authorization_id') as string) : '')
      .trim();
  const decision =
    (typeof form.get('decision') === 'string' ? (form.get('decision') as string) : '').trim();
  const formCsrfToken =
    (typeof form.get('csrf_token') === 'string' ? (form.get('csrf_token') as string) : '').trim();
  const cookieCsrfToken = deps.getCsrfTokenFromCookie(request) ?? '';

  if (!authorizationId) {
    return deps.jsonError('authorization_id is required.', 400, 'missing_authorization_id');
  }
  if (decision !== 'approve' && decision !== 'deny') {
    return deps.jsonError('decision must be approve or deny.', 400, 'invalid_decision');
  }
  if (!cookieCsrfToken || !formCsrfToken || !deps.constantTimeEqual(cookieCsrfToken, formCsrfToken)) {
    return deps.jsonError('CSRF token validation failed.', 403, 'csrf_validation_failed');
  }

  try {
    const consentResult = await deps.submitOAuthAuthorizationConsent(
      signupConfig,
      supabaseAccessToken,
      authorizationId,
      decision,
    );
    const safeRedirectUrl = deps.sanitizeExternalHttpUrl(consentResult.redirectUrl);
    if (!safeRedirectUrl) {
      return deps.jsonError('Invalid OAuth redirect URL.', 400, 'invalid_oauth_redirect');
    }
    return deps.redirectResponse(safeRedirectUrl, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('access_token') || message.includes('401') || message.includes('403')) {
      await deps.clearUiSessionSupabaseAccessToken(env, parsedPayload.jti);
      const loginUrl = new URL('/app/login', request.url);
      loginUrl.searchParams.set('next', nextPathWithQuery);
      return deps.redirectResponse(loginUrl.toString(), 302);
    }
    return deps.jsonError('Failed to submit authorization decision.', 400, 'oauth_authorization_submit_failed');
  }
}
