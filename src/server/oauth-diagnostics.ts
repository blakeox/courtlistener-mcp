import { redactSecretsInText } from '../infrastructure/secret-redaction.js';
import type { WorkerHostedAuthConfigDiagnostics } from './worker-upstream-oidc-config.js';

const MAX_ERROR_BODY_LENGTH = 512;
const MAX_REDIRECT_URIS = 5;

interface DiagnosticEnv {
  MCP_OAUTH_DIAGNOSTICS?: string;
}

type OAuthRouteKind =
  | 'authorize'
  | 'token'
  | 'register'
  | 'authorization-server-metadata'
  | 'protected-resource-metadata'
  | 'other';

type HostedAuthRouteKind =
  | 'auth-start'
  | 'auth-callback'
  | 'auth-approve'
  | 'auth-logout'
  | 'other';

export type HostedAuthSignalOutcome =
  | 'redirect'
  | 'interactive'
  | 'completed'
  | 'rejected'
  | 'unavailable';

type HostedAuthSignalName =
  | 'approval_preparation_failed'
  | 'authorization_completion_failed'
  | 'callback_failed'
  | 'config_missing'
  | 'csrf_initialization_failed'
  | 'csrf_validation_failed'
  | 'interactive_continue_required'
  | 'invalid_approval_state'
  | 'invalid_return_state'
  | 'invalid_return_target'
  | 'invalid_session'
  | 'logged_out'
  | 'logout_confirmation_required'
  | 'ready_completed'
  | 'ready_interactive'
  | 'ready_redirect'
  | 'ready_rejected'
  | 'upstream_discovery_failed'
  | 'upstream_discovery_timeout'
  | 'upstream_token_failed'
  | 'upstream_token_timeout';

type HostedAuthSignalCategory =
  | 'ok'
  | 'misconfiguration'
  | 'timeout'
  | 'dependency'
  | 'request_validation'
  | 'session'
  | 'security'
  | 'authorization'
  | 'operator_action';

type DiagnosticMetadata = Record<string, unknown>;

interface HostedAuthDurationMetadata {
  totalDurationMs?: number | null;
  upstreamDiscoveryDurationMs?: number | null;
  upstreamDiscoveryCacheStatus?: 'hit' | 'miss' | null;
  tokenExchangeDurationMs?: number | null;
  tokenVerificationDurationMs?: number | null;
  jwksFetchDurationMs?: number | null;
  sessionCreationDurationMs?: number | null;
  approvalDurationMs?: number | null;
  logoutDurationMs?: number | null;
}

function parseBooleanFlag(value?: string): boolean {
  if (!value) return false;
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
}

function routeKindFromPath(pathname: string): OAuthRouteKind {
  if (pathname === '/authorize') return 'authorize';
  if (pathname === '/token') return 'token';
  if (pathname === '/register') return 'register';
  if (
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/mcp/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/oauth-authorization-server/mcp'
  ) {
    return 'authorization-server-metadata';
  }
  if (
    pathname === '/.well-known/openid-configuration' ||
    pathname === '/mcp/.well-known/openid-configuration' ||
    pathname === '/.well-known/openid-configuration/mcp'
  ) {
    return 'authorization-server-metadata';
  }
  if (
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/.well-known/oauth-protected-resource/mcp' ||
    pathname === '/mcp/.well-known/oauth-protected-resource'
  ) {
    return 'protected-resource-metadata';
  }
  return 'other';
}

function hostedAuthRouteKindFromPath(pathname: string): HostedAuthRouteKind {
  if (pathname === '/auth/start') return 'auth-start';
  if (pathname === '/auth/callback') return 'auth-callback';
  if (pathname === '/auth/approve') return 'auth-approve';
  if (pathname === '/auth/logout') return 'auth-logout';
  return 'other';
}

function classifyHostedAuthSignalCategory(reason: string): HostedAuthSignalCategory {
  switch (reason) {
    case 'config_missing':
      return 'misconfiguration';
    case 'upstream_discovery_timeout':
    case 'upstream_token_timeout':
    case 'probe_timeout':
      return 'timeout';
    case 'upstream_discovery_failed':
    case 'upstream_token_failed':
      return 'dependency';
    case 'invalid_return_state':
    case 'invalid_return_target':
    case 'invalid_approval_state':
      return 'request_validation';
    case 'invalid_session':
      return 'session';
    case 'csrf_initialization_failed':
    case 'csrf_validation_failed':
      return 'security';
    case 'callback_failed':
    case 'approval_preparation_failed':
    case 'authorization_completion_failed':
      return 'authorization';
    case 'interactive_continue_required':
    case 'logout_confirmation_required':
    case 'logged_out':
      return 'operator_action';
    default:
      return 'ok';
  }
}

function resolveHostedAuthSignalName(params: {
  status: string;
  outcome: HostedAuthSignalOutcome;
  authError?: string | null;
}): HostedAuthSignalName {
  const reason = params.authError?.trim();
  switch (reason) {
    case 'approval_preparation_failed':
    case 'authorization_completion_failed':
    case 'callback_failed':
    case 'config_missing':
    case 'csrf_initialization_failed':
    case 'csrf_validation_failed':
    case 'invalid_approval_state':
    case 'invalid_return_state':
    case 'invalid_return_target':
    case 'invalid_session':
    case 'upstream_discovery_failed':
    case 'upstream_discovery_timeout':
    case 'upstream_token_failed':
    case 'upstream_token_timeout':
      return reason;
    default:
      break;
  }

  switch (params.status.trim()) {
    case 'interactive_continue_required':
    case 'logout_confirmation_required':
    case 'logged_out':
      return params.status.trim() as HostedAuthSignalName;
    default:
      break;
  }

  switch (params.outcome) {
    case 'redirect':
      return 'ready_redirect';
    case 'interactive':
      return 'ready_interactive';
    case 'completed':
      return 'ready_completed';
    case 'rejected':
      return 'ready_rejected';
    case 'unavailable':
      return 'config_missing';
  }
}

function isHostedAuthFailure(outcome: HostedAuthSignalOutcome): boolean {
  return outcome === 'rejected' || outcome === 'unavailable';
}

function isHostedAuthTerminal(outcome: HostedAuthSignalOutcome): boolean {
  return outcome === 'completed' || outcome === 'rejected' || outcome === 'unavailable';
}

function summarizeRedirectUri(rawValue: string | null): string | null {
  const value = rawValue?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid]';
  }
}

function summarizeHeaderValue(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? redactSecretsInText(normalized) : null;
}

function summarizeAuthorizationHeader(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const [scheme] = normalized.split(/\s+/, 1);
  return scheme ? scheme.toLowerCase() : '[present]';
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const chunk of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = chunk.trim().split('=');
    if (!rawName || rawValue.length === 0) continue;
    cookies[rawName] = rawValue.join('=');
  }
  return cookies;
}

function parseScopeList(rawValue: string | null): string[] {
  const value = rawValue?.trim();
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}

function addIfPresent(target: DiagnosticMetadata, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string' && value.length === 0) return;
  if (Array.isArray(value) && value.length === 0) return;
  target[key] = value;
}

function normalizeDurationMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function normalizeDiscoveryCacheStatus(value: unknown): 'hit' | 'miss' | null {
  return value === 'hit' || value === 'miss' ? value : null;
}

function summarizeAuthorizeRequest(url: URL): DiagnosticMetadata {
  const scope = parseScopeList(url.searchParams.get('scope'));
  return {
    client_id: url.searchParams.get('client_id')?.trim() || null,
    redirect_uri: summarizeRedirectUri(url.searchParams.get('redirect_uri')),
    response_type: url.searchParams.get('response_type')?.trim() || null,
    scope_count: scope.length,
    scopes: scope,
    resource: summarizeRedirectUri(url.searchParams.get('resource')),
    state_present: Boolean(url.searchParams.get('state')),
    code_challenge_method: url.searchParams.get('code_challenge_method')?.trim() || null,
    code_challenge_present: Boolean(url.searchParams.get('code_challenge')),
  };
}

async function summarizeRegisterRequest(request: Request): Promise<DiagnosticMetadata> {
  if (request.method !== 'POST') {
    return {};
  }

  try {
    const body = (await request.clone().json()) as Record<string, unknown>;
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : [];

    return {
      client_name: typeof body.client_name === 'string' ? body.client_name : null,
      redirect_uri_count: redirectUris.length,
      redirect_uris: redirectUris
        .slice(0, MAX_REDIRECT_URIS)
        .map((value) => summarizeRedirectUri(value)),
      grant_types: Array.isArray(body.grant_types)
        ? body.grant_types.filter((value): value is string => typeof value === 'string')
        : [],
      response_types: Array.isArray(body.response_types)
        ? body.response_types.filter((value): value is string => typeof value === 'string')
        : [],
      token_endpoint_auth_method:
        typeof body.token_endpoint_auth_method === 'string'
          ? body.token_endpoint_auth_method
          : null,
    };
  } catch {
    return { invalid_json: true };
  }
}

async function summarizeTokenRequest(request: Request): Promise<DiagnosticMetadata> {
  if (request.method !== 'POST') {
    return {};
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return { unsupported_content_type: contentType || null };
    }

    const params = new URLSearchParams(await request.clone().text());
    return {
      grant_type: params.get('grant_type')?.trim() || null,
      client_id: params.get('client_id')?.trim() || null,
      redirect_uri: summarizeRedirectUri(params.get('redirect_uri')),
      code_present: Boolean(params.get('code')),
      code_verifier_present: Boolean(params.get('code_verifier')),
      refresh_token_present: Boolean(params.get('refresh_token')),
    };
  } catch {
    return { invalid_form_body: true };
  }
}

export async function summarizeOAuthRequest(request: Request): Promise<DiagnosticMetadata> {
  const url = new URL(request.url);
  const route = routeKindFromPath(url.pathname);
  const metadata: DiagnosticMetadata = {
    route,
    method: request.method,
    pathname: url.pathname,
  };

  addIfPresent(metadata, 'origin', summarizeHeaderValue(request.headers.get('origin')));
  addIfPresent(metadata, 'referer', summarizeHeaderValue(request.headers.get('referer')));
  addIfPresent(metadata, 'user_agent', summarizeHeaderValue(request.headers.get('user-agent')));
  addIfPresent(metadata, 'cf_ray', summarizeHeaderValue(request.headers.get('cf-ray')));
  addIfPresent(
    metadata,
    'authorization_scheme',
    summarizeAuthorizationHeader(request.headers.get('authorization')),
  );
  addIfPresent(metadata, 'content_type', summarizeHeaderValue(request.headers.get('content-type')));

  switch (route) {
    case 'authorize':
      Object.assign(metadata, summarizeAuthorizeRequest(url));
      break;
    case 'register':
      Object.assign(metadata, await summarizeRegisterRequest(request));
      break;
    case 'token':
      Object.assign(metadata, await summarizeTokenRequest(request));
      break;
    default:
      break;
  }

  return metadata;
}

export async function summarizeOAuthResponse(response: Response): Promise<DiagnosticMetadata> {
  const metadata: DiagnosticMetadata = {
    status: response.status,
  };

  addIfPresent(
    metadata,
    'content_type',
    summarizeHeaderValue(response.headers.get('content-type')),
  );

  const location = response.headers.get('location');
  if (location) {
    metadata.location = summarizeRedirectUri(location);
  }

  if (response.status >= 400) {
    try {
      const bodyText = await response.clone().text();
      const compact = redactSecretsInText(bodyText.trim()).slice(0, MAX_ERROR_BODY_LENGTH);
      addIfPresent(metadata, 'error_body', compact);
    } catch {
      metadata.error_body_unavailable = true;
    }
  }

  return metadata;
}

export function summarizeHostedAuthRequest(request: Request): DiagnosticMetadata {
  const url = new URL(request.url);
  const route = hostedAuthRouteKindFromPath(url.pathname);
  const cookies = parseCookies(request.headers.get('cookie'));
  const metadata: DiagnosticMetadata = {
    route,
    method: request.method,
    pathname: url.pathname,
  };

  addIfPresent(metadata, 'origin', summarizeHeaderValue(request.headers.get('origin')));
  addIfPresent(metadata, 'referer', summarizeHeaderValue(request.headers.get('referer')));
  addIfPresent(metadata, 'user_agent', summarizeHeaderValue(request.headers.get('user-agent')));
  addIfPresent(metadata, 'cf_ray', summarizeHeaderValue(request.headers.get('cf-ray')));
  addIfPresent(metadata, 'return_to', summarizeRedirectUri(url.searchParams.get('return_to')));
  addIfPresent(metadata, 'auth_error', url.searchParams.get('auth_error')?.trim() || null);
  addIfPresent(
    metadata,
    'continue_requested',
    url.searchParams.get('continue') === '1' ? true : null,
  );
  addIfPresent(metadata, 'session_cookie_present', cookies.clmcp_ui ? true : null);
  addIfPresent(metadata, 'state_cookie_present', cookies.clauth_state ? true : null);
  addIfPresent(metadata, 'approval_cookie_present', cookies.clauth_approve ? true : null);
  addIfPresent(metadata, 'flow_cookie_present', cookies.clauth_flow ? true : null);
  addIfPresent(metadata, 'csrf_cookie_present', cookies.clmcp_csrf ? true : null);

  return metadata;
}

export function summarizeHostedAuthReadiness(
  diagnostics: WorkerHostedAuthConfigDiagnostics,
): DiagnosticMetadata {
  return {
    hosted_auth_ready: diagnostics.ready,
    hosted_auth_relevant_env_present: diagnostics.relevantEnvPresent,
    issuer_configured: diagnostics.issuerConfigured,
    session_secret_configured: diagnostics.sessionSecretConfigured,
    worker_native_client_id_configured: diagnostics.workerNativeClientIdConfigured,
    worker_native_client_secret_configured: diagnostics.workerNativeClientSecretConfigured,
    legacy_client_id_configured: diagnostics.legacyClientIdConfigured,
    legacy_client_secret_configured: diagnostics.legacyClientSecretConfigured,
    credential_source: diagnostics.credentialSource,
    config_error_count: diagnostics.errors.length,
    config_errors: diagnostics.errors,
  };
}

export function summarizeHostedAuthSignal(
  params: {
    pathname: string;
    ready: boolean;
    status: string;
    outcome: HostedAuthSignalOutcome;
    correlationId?: string | null;
    authError?: string | null;
    credentialSource?: WorkerHostedAuthConfigDiagnostics['credentialSource'] | null;
    configErrorCount?: number | null;
  } & HostedAuthDurationMetadata,
): DiagnosticMetadata {
  const reason = params.authError?.trim() || params.status.trim();
  const metadata: DiagnosticMetadata = {
    hosted_auth_route: hostedAuthRouteKindFromPath(params.pathname),
    hosted_auth_ready: params.ready,
    hosted_auth_status: params.status,
    hosted_auth_outcome: params.outcome,
    hosted_auth_category: classifyHostedAuthSignalCategory(reason),
    hosted_auth_signal: resolveHostedAuthSignalName(params),
    hosted_auth_failure: isHostedAuthFailure(params.outcome),
    hosted_auth_terminal: isHostedAuthTerminal(params.outcome),
  };

  addIfPresent(metadata, 'hosted_auth_correlation_id', params.correlationId?.trim() || null);
  addIfPresent(metadata, 'hosted_auth_error', params.authError?.trim() || null);
  addIfPresent(metadata, 'hosted_auth_credential_source', params.credentialSource ?? null);
  if (typeof params.configErrorCount === 'number' && Number.isFinite(params.configErrorCount)) {
    metadata.hosted_auth_config_error_count = Math.max(0, Math.trunc(params.configErrorCount));
  }
  addIfPresent(metadata, 'hosted_auth_duration_ms', normalizeDurationMs(params.totalDurationMs));
  addIfPresent(
    metadata,
    'hosted_auth_upstream_discovery_duration_ms',
    normalizeDurationMs(params.upstreamDiscoveryDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_upstream_discovery_cache_status',
    normalizeDiscoveryCacheStatus(params.upstreamDiscoveryCacheStatus),
  );
  addIfPresent(
    metadata,
    'hosted_auth_token_exchange_duration_ms',
    normalizeDurationMs(params.tokenExchangeDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_token_verification_duration_ms',
    normalizeDurationMs(params.tokenVerificationDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_jwks_fetch_duration_ms',
    normalizeDurationMs(params.jwksFetchDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_session_creation_duration_ms',
    normalizeDurationMs(params.sessionCreationDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_approval_duration_ms',
    normalizeDurationMs(params.approvalDurationMs),
  );
  addIfPresent(
    metadata,
    'hosted_auth_logout_duration_ms',
    normalizeDurationMs(params.logoutDurationMs),
  );

  return metadata;
}

export function emitOAuthDiagnostic(
  env: DiagnosticEnv,
  event: string,
  metadata: DiagnosticMetadata,
): void {
  if (!parseBooleanFlag(env.MCP_OAUTH_DIAGNOSTICS)) {
    return;
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      metadata,
    }),
  );
}
