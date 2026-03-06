import type { ServerConfig } from '../types.js';
import { redactSecretsInText } from './secret-redaction.js';

type WorkerAuthMethod = 'oidc';
type AuthFeature = 'oauth' | 'oidc' | 'serviceToken' | 'apiKeyAuth';

interface AuthCompatibilityRule {
  id: string;
  requiresAll: AuthFeature[];
  message: string;
}

export const AUTH_POLICY_MATRIX = {
  precedence: ['oauth', 'serviceToken', 'oidc'] as const,
  workerPrecedence: ['oidc'] as const,
  incompatibleCombinations: [
    {
      id: 'oauth-api-key-auth',
      requiresAll: ['oauth', 'apiKeyAuth'],
      message: 'OAuth and API-key auth cannot both be enabled at startup',
    },
    {
      id: 'oauth-oidc',
      requiresAll: ['oauth', 'oidc'],
      message: 'OAuth and OIDC auth cannot both be enabled at startup',
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
  };
  effectivePrimary: WorkerAuthMethod | null;
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
  return configured.oidc ? ['oidc'] : [];
}

export function evaluateAuthPolicyMatrix(
  config: ServerConfig,
  env: NodeJS.ProcessEnv = process.env,
): AuthPolicyEvaluationResult {
  const oauth = config.oauth?.enabled ?? false;
  const apiKeyAuth = config.security.authEnabled;
  const oidc = Boolean(env.OIDC_ISSUER?.trim());
  const serviceToken = Boolean(env.MCP_AUTH_TOKEN?.trim());
  const configured = {
    oauth,
    apiKeyAuth,
    serviceToken,
    oidc,
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

  if (serviceToken && apiKeyAuth) {
    warnings.push('Both gateway token auth and API-key auth are configured; verify intended precedence');
  }

  if (serviceToken) {
    warnings.push(
      'MCP_AUTH_TOKEN is configured; ensure it is used only via the explicit service-token header path, not client Authorization bearer auth',
    );
  }

  const configuredWorkerMethods = getConfiguredWorkerMethods(configured);
  if (env.MCP_AUTH_PRIMARY?.trim()) {
    warnings.push('MCP_AUTH_PRIMARY is deprecated and ignored; edge auth now requires OAuth/OIDC for client access');
  }

  if (parseBoolean(env.MCP_ALLOW_STATIC_FALLBACK)) {
    warnings.push(
      'MCP_ALLOW_STATIC_FALLBACK is deprecated and ignored; static bearer-token fallback is disabled',
    );
  }

  const effectivePrimary = configuredWorkerMethods[0] ?? null;

  return {
    errors: errors.map((message) => redactSecretsInText(message)),
    warnings: warnings.map((message) => redactSecretsInText(message)),
    diagnostics: {
      precedence: [...AUTH_POLICY_MATRIX.precedence],
      configured,
      effectivePrimary,
      incompatibleRulesTriggered,
    },
  };
}
