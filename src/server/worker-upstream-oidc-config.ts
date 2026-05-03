export interface WorkerUpstreamOidcClientEnv {
  OIDC_ISSUER?: string;
  OIDC_AUDIENCE?: string;
  MCP_AUTH_OIDC_CLIENT_ID?: string;
  MCP_AUTH_OIDC_CLIENT_SECRET?: string;
  MCP_AUTH_OIDC_SCOPES?: string;
}

export interface WorkerHostedAuthEnv extends WorkerUpstreamOidcClientEnv {
  MCP_UI_SESSION_SECRET?: string;
}

export interface WorkerUpstreamOidcClientConfig {
  issuer: string;
  audience: string | null;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  credentialSource: 'worker_native';
}

export interface WorkerHostedAuthConfig {
  upstream: WorkerUpstreamOidcClientConfig;
  sessionSecret: string;
}

export interface WorkerHostedAuthConfigDiagnostics {
  relevantEnvPresent: boolean;
  ready: boolean;
  issuerConfigured: boolean;
  sessionSecretConfigured: boolean;
  workerNativeClientIdConfigured: boolean;
  workerNativeClientSecretConfigured: boolean;
  credentialSource: WorkerUpstreamOidcClientConfig['credentialSource'] | null;
  errors: string[];
}

function parseScopes(rawScopes: string | undefined): string[] {
  return (rawScopes?.trim() || 'openid profile email')
    .split(/[,\s]+/u)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function resolveWorkerUpstreamOidcClientConfig(
  env: WorkerUpstreamOidcClientEnv,
): WorkerUpstreamOidcClientConfig | null {
  const issuer = env.OIDC_ISSUER?.trim() || '';
  if (!issuer) {
    return null;
  }

  const hasWorkerNativeClientId = hasValue(env.MCP_AUTH_OIDC_CLIENT_ID);
  const hasWorkerNativeClientSecret = hasValue(env.MCP_AUTH_OIDC_CLIENT_SECRET);
  if (hasWorkerNativeClientId && hasWorkerNativeClientSecret) {
    const clientId = env.MCP_AUTH_OIDC_CLIENT_ID?.trim() || '';
    const clientSecret = env.MCP_AUTH_OIDC_CLIENT_SECRET?.trim() || '';
    return {
      issuer,
      audience: env.OIDC_AUDIENCE?.trim() || null,
      clientId,
      clientSecret,
      scopes: parseScopes(env.MCP_AUTH_OIDC_SCOPES),
      credentialSource: 'worker_native',
    };
  }
  return null;
}

export function hasWorkerUpstreamOidcClientConfig(env: WorkerUpstreamOidcClientEnv): boolean {
  return resolveWorkerUpstreamOidcClientConfig(env) !== null;
}

export function resolveWorkerHostedAuthConfig(
  env: WorkerHostedAuthEnv,
): WorkerHostedAuthConfig | null {
  const upstream = resolveWorkerUpstreamOidcClientConfig(env);
  const sessionSecret = env.MCP_UI_SESSION_SECRET?.trim() || '';
  if (!upstream || !sessionSecret) {
    return null;
  }

  return {
    upstream,
    sessionSecret,
  };
}

export function hasWorkerHostedAuthConfig(env: WorkerHostedAuthEnv): boolean {
  return resolveWorkerHostedAuthConfig(env) !== null;
}

export function evaluateWorkerHostedAuthConfig(
  env: WorkerHostedAuthEnv,
): WorkerHostedAuthConfigDiagnostics {
  const issuerConfigured = hasValue(env.OIDC_ISSUER);
  const sessionSecretConfigured = hasValue(env.MCP_UI_SESSION_SECRET);
  const workerNativeClientIdConfigured = hasValue(env.MCP_AUTH_OIDC_CLIENT_ID);
  const workerNativeClientSecretConfigured = hasValue(env.MCP_AUTH_OIDC_CLIENT_SECRET);
  const relevantEnvPresent =
    issuerConfigured ||
    sessionSecretConfigured ||
    workerNativeClientIdConfigured ||
    workerNativeClientSecretConfigured;

  const errors: string[] = [];
  const hasCompleteWorkerNativePair =
    workerNativeClientIdConfigured && workerNativeClientSecretConfigured;

  if (workerNativeClientIdConfigured !== workerNativeClientSecretConfigured) {
    errors.push(
      'Hosted auth upstream OIDC config is incomplete: set both MCP_AUTH_OIDC_CLIENT_ID and MCP_AUTH_OIDC_CLIENT_SECRET, or remove both.',
    );
  }

  const upstream = resolveWorkerUpstreamOidcClientConfig(env);

  if (!issuerConfigured && hasCompleteWorkerNativePair) {
    errors.push(
      'Hosted auth upstream OIDC client credentials are configured but OIDC_ISSUER is missing.',
    );
  }

  if (upstream && !sessionSecretConfigured) {
    errors.push(
      'Hosted auth requires MCP_UI_SESSION_SECRET so the Worker can sign UI session and auth-state cookies; OIDC client-secret fallback is disabled.',
    );
  }

  return {
    relevantEnvPresent,
    ready: resolveWorkerHostedAuthConfig(env) !== null && errors.length === 0,
    issuerConfigured,
    sessionSecretConfigured,
    workerNativeClientIdConfigured,
    workerNativeClientSecretConfigured,
    credentialSource: upstream?.credentialSource ?? null,
    errors,
  };
}
