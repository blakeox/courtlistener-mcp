import type { AuditEventInput, PasswordAuthResult } from './supabase-management.js';

type AuthRouteEnv = {
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
};

interface UiSessionPayload {
  jti: string;
  exp: number;
}

interface AuthUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

interface AuthRouteContext<TEnv extends AuthRouteEnv> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
}

interface AuthRouteDependencies<
  TEnv extends AuthRouteEnv,
  TManagementConfig,
  TSignupConfig,
> {
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, headers?: HeadersInit) => Response;
  rejectDisallowedUiOrigin: (origin: string | null, allowedOrigins: string[]) => Response | null;
  getUiSessionSecret: (env: TEnv) => string | null;
  getCookieValue: (request: Request, name: string) => string | null | undefined;
  parseUiSessionToken: (token: string) => UiSessionPayload | null;
  isUiSessionRevoked: (env: TEnv, jti: string) => Promise<boolean>;
  getUiSessionUserId: (request: Request, secret: string) => Promise<string | null>;
  getOrCreateCsrfCookieHeader: (request: Request, env: TEnv) => string | null;
  requireCsrfToken: (request: Request) => Response | null;
  getSupabaseManagementConfig: (env: TEnv) => TManagementConfig | null;
  getSupabaseSignupConfig: (env: TEnv) => TSignupConfig | null;
  parseJsonBody: <T>(request: Request) => Promise<T | null>;
  applyUiRateLimit: (
    request: Request,
    env: TEnv,
    category: 'signup',
    subject?: string,
  ) => Promise<Response | null>;
  authenticateUserWithPassword: (
    managementConfig: TManagementConfig,
    email: string,
    password: string,
  ) => Promise<PasswordAuthResult>;
  authenticateUserWithAnonKey: (
    signupConfig: TSignupConfig,
    email: string,
    password: string,
  ) => Promise<PasswordAuthResult>;
  createUiSessionToken: (userId: string, secret: string, ttlSeconds: number) => Promise<string>;
  storeUiSessionSupabaseAccessToken: (
    env: TEnv,
    jti: string,
    accessToken: string,
    expiresAtMs: number | null,
  ) => Promise<void>;
  isSecureCookieRequest: (request: Request, env: TEnv) => boolean;
  buildUiSessionCookie: (token: string, secureCookies: boolean) => string;
  buildUiSessionIndicatorCookie: (secureCookies: boolean) => string;
  applySecurityHeaders: (headers: Headers) => void;
  getSupabaseUserFromAccessToken: (signupConfig: TSignupConfig, accessToken: string) => Promise<AuthUser>;
  sendPasswordResetEmail: (
    signupConfig: TSignupConfig,
    email: string,
    options?: { redirectTo?: string },
  ) => Promise<void>;
  getPasswordResetRedirectUrl: (env: TEnv, origin: string) => string;
  logWorkerWarning: (event: string, error: unknown, metadata?: Record<string, unknown>) => void;
  exchangeRecoveryTokenHash: (signupConfig: TSignupConfig, tokenHash: string) => Promise<{ accessToken: string }>;
  resetPasswordWithAccessToken: (
    signupConfig: TSignupConfig,
    accessToken: string,
    password: string,
  ) => Promise<AuthUser>;
  confirmUserEmail: (managementConfig: TManagementConfig, userId: string) => Promise<void>;
  clearUiSessionSupabaseAccessToken: (env: TEnv, jti: string) => Promise<void>;
  revokeUiSession: (env: TEnv, jti: string, exp: number) => Promise<void>;
  buildUiSessionCookieClear: (secureCookies: boolean) => string;
  buildUiSessionIndicatorCookieClear: (secureCookies: boolean) => string;
  getRequestIp: (request: Request) => string | null;
  verifyTurnstileToken: (secret: string, token: string, remoteip: string | null) => Promise<boolean>;
  signUpSupabaseUser: (
    signupConfig: TSignupConfig,
    credentials: { email: string; password: string; fullName?: string },
    options?: { emailRedirectTo?: string },
  ) => Promise<{ user?: { id?: string | null } | null }>;
  getSignupRedirectUrl: (env: TEnv, origin: string) => string;
  logAuditEvent: (managementConfig: TManagementConfig, payload: AuditEventInput) => Promise<void>;
}

export async function handleWorkerAuthRoutes<
  TEnv extends AuthRouteEnv,
  TManagementConfig,
  TSignupConfig,
>(
  context: AuthRouteContext<TEnv>,
  deps: AuthRouteDependencies<TEnv, TManagementConfig, TSignupConfig>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins, env } = context;

  if (url.pathname === '/api/session') {
    if (request.method !== 'GET') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const sessionSecret = deps.getUiSessionSecret(env);
    let sessionUserId: string | null = null;
    if (sessionSecret) {
      const cookieToken = deps.getCookieValue(request, 'clmcp_ui');
      const parsedPayload = cookieToken ? deps.parseUiSessionToken(cookieToken) : null;
      if (!parsedPayload || !(await deps.isUiSessionRevoked(env, parsedPayload.jti))) {
        sessionUserId = await deps.getUiSessionUserId(request, sessionSecret);
      }
    }
    const csrfCookieHeader = deps.getOrCreateCsrfCookieHeader(request, env);
    return deps.jsonResponse(
      {
        authenticated: Boolean(sessionUserId),
        user: sessionUserId ? { id: sessionUserId } : null,
        turnstile_site_key: env.TURNSTILE_SITE_KEY?.trim() || undefined,
      },
      200,
      csrfCookieHeader ? { 'Set-Cookie': csrfCookieHeader } : undefined,
    );
  }

  if (url.pathname === '/api/login') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const csrfError = deps.requireCsrfToken(request);
    if (csrfError) return csrfError;

    const managementConfig = deps.getSupabaseManagementConfig(env);
    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!managementConfig && !signupConfig) {
      return deps.jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
    }

    const body = await deps.parseJsonBody<{ email?: string; password?: string }>(request);
    const email = body?.email?.trim().toLowerCase() || '';
    const password = body?.password || '';

    const loginRateLimited = await deps.applyUiRateLimit(request, env, 'signup', email || undefined);
    if (loginRateLimited) return loginRateLimited;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return deps.jsonError('A valid email is required.', 400, 'invalid_email');
    }
    if (password.length < 8 || password.length > 256) {
      return deps.jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
    }

    try {
      const authResult = managementConfig
        ? await deps.authenticateUserWithPassword(managementConfig, email, password)
        : await deps.authenticateUserWithAnonKey(signupConfig as TSignupConfig, email, password);
      if (!authResult.user.email_confirmed_at) {
        return deps.jsonError('Email verification is required before login.', 403, 'email_not_verified');
      }
      const sessionSecret = deps.getUiSessionSecret(env);
      if (!sessionSecret) {
        return deps.jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
      }
      const sessionToken = await deps.createUiSessionToken(authResult.user.id, sessionSecret, 12 * 60 * 60);
      const parsedSession = deps.parseUiSessionToken(sessionToken);
      if (parsedSession) {
        await deps.storeUiSessionSupabaseAccessToken(
          env,
          parsedSession.jti,
          authResult.accessToken,
          authResult.accessTokenExpiresAtMs,
        );
      }
      const secureCookies = deps.isSecureCookieRequest(request, env);
      const responseHeaders = new Headers();
      responseHeaders.append('Set-Cookie', deps.buildUiSessionCookie(sessionToken, secureCookies));
      responseHeaders.append('Set-Cookie', deps.buildUiSessionIndicatorCookie(secureCookies));
      deps.applySecurityHeaders(responseHeaders);
      return Response.json(
        {
          message: 'Login successful.',
          user: {
            id: authResult.user.id,
            email: authResult.user.email ?? email,
          },
        },
        {
          status: 200,
          headers: responseHeaders,
        },
      );
    } catch {
      return deps.jsonError('Invalid email or password.', 401, 'invalid_credentials');
    }
  }

  if (url.pathname === '/api/login/token') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const csrfError = deps.requireCsrfToken(request);
    if (csrfError) return csrfError;

    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!signupConfig) {
      return deps.jsonError(
        'Supabase public signup is not configured on this worker.',
        503,
        'supabase_signup_not_configured',
      );
    }

    const body = await deps.parseJsonBody<{ accessToken?: string }>(request);
    const accessToken = body?.accessToken?.trim() || '';
    if (!accessToken) {
      return deps.jsonError('accessToken is required.', 400, 'missing_access_token');
    }

    try {
      const user = await deps.getSupabaseUserFromAccessToken(signupConfig, accessToken);
      if (!user.email_confirmed_at) {
        return deps.jsonError('Email verification is required before login.', 403, 'email_not_verified');
      }

      const sessionSecret = deps.getUiSessionSecret(env);
      if (!sessionSecret) {
        return deps.jsonError('Session signing secret is not configured.', 503, 'session_secret_missing');
      }
      const sessionToken = await deps.createUiSessionToken(user.id, sessionSecret, 12 * 60 * 60);
      const parsedSession = deps.parseUiSessionToken(sessionToken);
      if (parsedSession) {
        await deps.storeUiSessionSupabaseAccessToken(
          env,
          parsedSession.jti,
          accessToken,
          Date.now() + 30 * 60 * 1000,
        );
      }
      const secureCookies = deps.isSecureCookieRequest(request, env);
      const responseHeaders = new Headers();
      responseHeaders.append('Set-Cookie', deps.buildUiSessionCookie(sessionToken, secureCookies));
      responseHeaders.append('Set-Cookie', deps.buildUiSessionIndicatorCookie(secureCookies));
      deps.applySecurityHeaders(responseHeaders);
      return Response.json(
        {
          message: 'Login successful.',
          user: {
            id: user.id,
            email: user.email ?? null,
          },
        },
        {
          status: 200,
          headers: responseHeaders,
        },
      );
    } catch {
      return deps.jsonError('Invalid or expired signup token.', 401, 'invalid_signup_token');
    }
  }

  if (url.pathname === '/api/password/forgot') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const csrfError = deps.requireCsrfToken(request);
    if (csrfError) return csrfError;

    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!signupConfig) {
      return deps.jsonError(
        'Supabase public signup is not configured on this worker.',
        503,
        'supabase_signup_not_configured',
      );
    }

    const body = await deps.parseJsonBody<{ email?: string }>(request);
    const email = body?.email?.trim().toLowerCase() || '';

    const forgotRateLimited = await deps.applyUiRateLimit(request, env, 'signup', email || undefined);
    if (forgotRateLimited) return forgotRateLimited;

    if (!email || !email.includes('@')) {
      return deps.jsonError('A valid email is required.', 400, 'invalid_email');
    }

    try {
      await deps.sendPasswordResetEmail(signupConfig, email, {
        redirectTo: deps.getPasswordResetRedirectUrl(env, url.origin),
      });
    } catch (error) {
      deps.logWorkerWarning('password_reset_email_failed', error, { email });
    }

    return deps.jsonResponse(
      {
        message: 'If the request can be processed, check your email for password reset instructions.',
      },
      202,
    );
  }

  if (url.pathname === '/api/password/reset') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const csrfError = deps.requireCsrfToken(request);
    if (csrfError) return csrfError;

    const signupConfig = deps.getSupabaseSignupConfig(env);
    if (!signupConfig) {
      return deps.jsonError(
        'Supabase public signup is not configured on this worker.',
        503,
        'supabase_signup_not_configured',
      );
    }

    const body = await deps.parseJsonBody<{ accessToken?: string; tokenHash?: string; password?: string }>(request);
    const accessToken = body?.accessToken?.trim() || '';
    const tokenHash = body?.tokenHash?.trim() || '';
    const password = body?.password || '';

    const resetRateLimited = await deps.applyUiRateLimit(request, env, 'signup');
    if (resetRateLimited) return resetRateLimited;

    if (!accessToken && !tokenHash) {
      return deps.jsonError('Recovery credential is required.', 400, 'missing_recovery_credential');
    }
    if (password.length < 8 || password.length > 256) {
      return deps.jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
    }

    try {
      let recoveryAccessToken = accessToken;
      if (!recoveryAccessToken && tokenHash) {
        const exchanged = await deps.exchangeRecoveryTokenHash(signupConfig, tokenHash);
        recoveryAccessToken = exchanged.accessToken;
      }

      const user = await deps.resetPasswordWithAccessToken(signupConfig, recoveryAccessToken, password);

      // Recovery link proves email ownership — confirm email if not yet confirmed
      const managementConfig = deps.getSupabaseManagementConfig(env);
      if (managementConfig && user?.id && !user.email_confirmed_at) {
        try {
          await deps.confirmUserEmail(managementConfig, user.id);
        } catch (confirmErr) {
          deps.logWorkerWarning('email_confirm_after_reset_failed', confirmErr, { userId: user.id });
        }
      }

      // Auto-login: create session so user doesn't have to re-enter credentials
      const userId = user?.id;
      const sessionSecret = deps.getUiSessionSecret(env);
      if (userId && sessionSecret) {
        const sessionToken = await deps.createUiSessionToken(userId, sessionSecret, 12 * 60 * 60);
        const parsedSession = deps.parseUiSessionToken(sessionToken);
        if (parsedSession && recoveryAccessToken) {
          await deps.storeUiSessionSupabaseAccessToken(
            env,
            parsedSession.jti,
            recoveryAccessToken,
            Date.now() + 30 * 60 * 1000,
          );
        }
        const secureCookies = deps.isSecureCookieRequest(request, env);
        const responseHeaders = new Headers();
        responseHeaders.append('Set-Cookie', deps.buildUiSessionCookie(sessionToken, secureCookies));
        responseHeaders.append('Set-Cookie', deps.buildUiSessionIndicatorCookie(secureCookies));
        deps.applySecurityHeaders(responseHeaders);
        return Response.json(
          {
            message: 'Password has been reset. You are now logged in.',
            autoLogin: true,
            user: { id: userId, email: user.email ?? null },
          },
          { status: 200, headers: responseHeaders },
        );
      }

      return deps.jsonResponse({ message: 'Password has been reset. You can now log in.' }, 200);
    } catch {
      return deps.jsonError('Invalid or expired recovery token.', 401, 'invalid_recovery_token');
    }
  }

  if (url.pathname === '/api/logout') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;
    const csrfError = deps.requireCsrfToken(request);
    if (csrfError) return csrfError;

    const sessionSecret = deps.getUiSessionSecret(env);
    if (sessionSecret) {
      const cookieToken = deps.getCookieValue(request, 'clmcp_ui');
      const parsedPayload = cookieToken ? deps.parseUiSessionToken(cookieToken) : null;
      if (parsedPayload) {
        await deps.revokeUiSession(env, parsedPayload.jti, parsedPayload.exp);
        await deps.clearUiSessionSupabaseAccessToken(env, parsedPayload.jti);
      }
    }

    const secureCookies = deps.isSecureCookieRequest(request, env);
    const responseHeaders = new Headers();
    responseHeaders.append('Set-Cookie', deps.buildUiSessionCookieClear(secureCookies));
    responseHeaders.append('Set-Cookie', deps.buildUiSessionIndicatorCookieClear(secureCookies));
    deps.applySecurityHeaders(responseHeaders);
    return Response.json(
      { message: 'Logged out.' },
      {
        status: 200,
        headers: responseHeaders,
      },
    );
  }

  if (url.pathname === '/api/signup') {
    if (request.method !== 'POST') {
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
    const managementConfig = deps.getSupabaseManagementConfig(env);

    const body = await deps.parseJsonBody<{
      email?: string;
      password?: string;
      fullName?: string;
      label?: string;
      expiresDays?: number;
      turnstileToken?: string;
    }>(request);

    const email = body?.email?.trim().toLowerCase() || '';
    const password = body?.password || '';
    const fullName = (body?.fullName?.trim() || '').slice(0, 256);
    const turnstileToken = body?.turnstileToken?.trim() || '';
    const requestIp = deps.getRequestIp(request);
    const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim();

    const signupRateLimited = await deps.applyUiRateLimit(request, env, 'signup', email || undefined);
    if (signupRateLimited) {
      return signupRateLimited;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return deps.jsonError('A valid email is required.', 400, 'invalid_email');
    }
    if (password.length < 8 || password.length > 256) {
      return deps.jsonError('Password must be 8–256 characters.', 400, 'invalid_password');
    }
    if (turnstileSecret) {
      if (!turnstileToken) {
        return deps.jsonError('Turnstile verification is required.', 400, 'turnstile_token_required');
      }
      const verified = await deps.verifyTurnstileToken(turnstileSecret, turnstileToken, requestIp);
      if (!verified) {
        return deps.jsonError('Turnstile verification failed.', 400, 'turnstile_verification_failed');
      }
    }

    try {
      const signupResult = await deps.signUpSupabaseUser(
        signupConfig,
        { email, password, fullName },
        { emailRedirectTo: deps.getSignupRedirectUrl(env, url.origin) },
      );
      if (managementConfig) {
        try {
          await deps.logAuditEvent(managementConfig, {
            actorType: 'anonymous',
            targetUserId: signupResult.user?.id ?? null,
            action: 'signup.user_created',
            status: 'success',
            requestIp,
            metadata: { email },
          });
        } catch (auditError) {
          deps.logWorkerWarning('audit_log_failed', auditError, { action: 'signup.user_created' });
        }
      }
      return deps.jsonResponse(
        {
          message: 'If the request can be processed, check your email for verification and next steps.',
        },
        202,
      );
    } catch (error) {
      if (managementConfig) {
        try {
          await deps.logAuditEvent(managementConfig, {
            actorType: 'anonymous',
            action: 'signup.user_created',
            status: 'error',
            requestIp,
            metadata: {
              email,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } catch (auditError) {
          deps.logWorkerWarning('audit_log_failed', auditError, {
            action: 'signup.user_created',
            status: 'error',
          });
        }
      }
      return deps.jsonResponse(
        {
          message: 'If the request can be processed, check your email for verification and next steps.',
        },
        202,
      );
    }
  }

  return null;
}
