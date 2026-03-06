import { redactSecretsInText } from '../infrastructure/secret-redaction.js';

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

type DiagnosticMetadata = Record<string, unknown>;

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
  if (pathname === '/.well-known/oauth-authorization-server') {
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
      ? body.redirect_uris.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    return {
      client_name: typeof body.client_name === 'string' ? body.client_name : null,
      redirect_uri_count: redirectUris.length,
      redirect_uris: redirectUris.slice(0, MAX_REDIRECT_URIS).map((value) => summarizeRedirectUri(value)),
      grant_types: Array.isArray(body.grant_types)
        ? body.grant_types.filter((value): value is string => typeof value === 'string')
        : [],
      response_types: Array.isArray(body.response_types)
        ? body.response_types.filter((value): value is string => typeof value === 'string')
        : [],
      token_endpoint_auth_method:
        typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : null,
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
  addIfPresent(metadata, 'authorization_scheme', summarizeAuthorizationHeader(request.headers.get('authorization')));
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

  addIfPresent(metadata, 'content_type', summarizeHeaderValue(response.headers.get('content-type')));

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
