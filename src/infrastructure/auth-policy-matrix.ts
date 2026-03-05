import type { ServerConfig } from '../types.js';
import { redactSecretsInText } from './secret-redaction.js';

type WorkerAuthMethod = 'supabase' | 'oidc' | 'staticToken';
type AuthFeature = 'oauth' | 'oidc' | 'supabase' | 'serviceToken' | 'staticToken' | 'apiKeyAuth';

interface AuthCompatibilityRule {
  id: string;
  requiresAll: AuthFeature[];
  message: string;
}

export const AUTH_POLICY_MATRIX = {
  precedence: ['oauth', 'serviceToken', 'supabase', 'oidc', 'staticToken'] as const,
  workerPrecedence: ['supabase', 'oidc', 'staticToken'] as const,
  incompatibleCombinations: [
    {
      id: 'oauth-api-key-auth',
      requiresAll: ['oauth', 'apiKeyAuth'],
      message: 'OAuth and API-key auth cannot both be enabled at startup',
    },
    {
      id: 'oauth-static-token',
      requiresAll: ['oauth', 'staticToken'],
      message: 'OAuth and static bearer token auth cannot both be enabled at startup',
    },
    {
      id: 'oauth-oidc',
      requiresAll: ['oauth', 'oidc'],
      message: 'OAuth and OIDC auth cannot both be enabled at startup',
    },
    {
      id: 'oauth-supabase',
      requiresAll: ['oauth', 'supabase'],
      message: 'OAuth and Supabase auth cannot both be enabled at startup',
    },
  ] as const satisfies readonly AuthCompatibilityRule[],
} as const;

export interface AuthPolicyDiagnostics {
  precedence: readonly (typeof AUTH_POLICY_MATRIX.precedence)[number][];
  configured: {
    oauth: boolean;
    apiKeyAuth: boolean;
    serviceToken: boolean;
    oidc: boolean;
    supabase: boolean;
    staticToken: boolean;
  };
  requestedPrimary: string | null;
  effectivePrimary: WorkerAuthMethod | null;
  staticFallbackEnabled: boolean;
  incompatibleRulesTriggered: string[];
}

export interface AuthPolicyEvaluationResult {
  errors: string[];
  warnings: string[];
  diagnostics: AuthPolicyDiagnostics;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getConfiguredWorkerMethods(configured: AuthPolicyDiagnostics['configured']): WorkerAuthMethod[] {
  return AUTH_POLICY_MATRIX.workerPrecedence.filter(
    (method): method is WorkerAuthMethod =>
      method === 'supabase' ? configured.supabase : method === 'oidc' ? configured.oidc : configured.staticToken,
  );
}

export function evaluateAuthPolicyMatrix(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): AuthPolicyEvaluationResult {
  const oauth = config.oauth?.enabled ?? false;
  const apiKeyAuth = config.security.authEnabled;
  const oidc = Boolean(env.OIDC_ISSUER?.trim());
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseSecret = env.SUPABASE_SECRET_KEY?.trim();
  const supabase = Boolean(supabaseUrl && supabaseSecret);
  const staticToken = Boolean(env.MCP_AUTH_TOKEN?.trim());
  const requestedPrimary = env.MCP_AUTH_PRIMARY?.trim().toLowerCase() || null;
  const staticFallbackEnabled = parseBoolean(env.MCP_ALLOW_STATIC_FALLBACK);
  const configured = {
    oauth,
    apiKeyAuth,
    serviceToken: staticToken,
    oidc,
    supabase,
    staticToken,
  };

  const errors: string[] = [];
  const warnings: string[] = [];
  const incompatibleRulesTriggered = AUTH_POLICY_MATRIX.incompatibleCombinations
    .filter((rule) => rule.requiresAll.every((feature) => configured[feature]))
    .map((rule) => rule.id);

  for (const ruleId of incompatibleRulesTriggered) {
    const rule = AUTH_POLICY_MATRIX.incompatibleCombinations.find((entry) => entry.id === ruleId);
    if (rule) errors.push(rule.message);
  }

  if ((supabaseUrl && !supabaseSecret) || (!supabaseUrl && supabaseSecret)) {
    errors.push('Supabase auth requires both SUPABASE_URL and SUPABASE_SECRET_KEY');
  }

  if (staticToken && apiKeyAuth) {
    warnings.push('Both gateway token auth and API-key auth are configured; verify intended precedence');
  }

  const configuredWorkerMethods = getConfiguredWorkerMethods(configured);
  const allowedPrimaryValues = new Set<WorkerAuthMethod>(AUTH_POLICY_MATRIX.workerPrecedence);
  const requestedPrimaryMethod = requestedPrimary === 'static' ? 'staticToken' : requestedPrimary;

  if (requestedPrimary && !allowedPrimaryValues.has(requestedPrimaryMethod as WorkerAuthMethod)) {
    errors.push('MCP_AUTH_PRIMARY must be one of: supabase, oidc, static');
  }

  if (
    requestedPrimaryMethod &&
    allowedPrimaryValues.has(requestedPrimaryMethod as WorkerAuthMethod) &&
    !configuredWorkerMethods.includes(requestedPrimaryMethod as WorkerAuthMethod)
  ) {
    errors.push('MCP_AUTH_PRIMARY was set for an auth mode that is not configured');
  }

  if (staticFallbackEnabled && !staticToken) {
    errors.push('MCP_ALLOW_STATIC_FALLBACK requires MCP_AUTH_TOKEN to be configured');
  }

  if (staticFallbackEnabled && !configured.oidc && !configured.supabase) {
    warnings.push('MCP_ALLOW_STATIC_FALLBACK is enabled but no OIDC/Supabase primary auth is configured');
  }

  const effectivePrimary =
    requestedPrimaryMethod &&
    allowedPrimaryValues.has(requestedPrimaryMethod as WorkerAuthMethod) &&
    configuredWorkerMethods.includes(requestedPrimaryMethod as WorkerAuthMethod)
      ? (requestedPrimaryMethod as WorkerAuthMethod)
      : (configuredWorkerMethods[0] ?? null);

  return {
    errors: errors.map((message) => redactSecretsInText(message)),
    warnings: warnings.map((message) => redactSecretsInText(message)),
    diagnostics: {
      precedence: [...AUTH_POLICY_MATRIX.precedence],
      configured,
      requestedPrimary,
      effectivePrimary,
      staticFallbackEnabled,
      incompatibleRulesTriggered,
    },
  };
}
