import type { ServerConfig } from '../types.js';
import { redactSecretsInText } from './secret-redaction.js';
import {
  evaluateWorkerHostedAuthConfig,
  type WorkerHostedAuthConfigDiagnostics,
} from '../server/worker-upstream-oidc-config.js';

type WorkerAuthMethod = 'oidc';
type AuthFeature = 'oauth' | 'oidc' | 'serviceToken' | 'apiKeyAuth';
type DevFallbackRiskLevel = 'disabled' | 'misconfigured' | 'enabled';

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
  devFallback: {
    userIdConfigured: boolean;
    allowFlagEnabled: boolean;
    enabled: boolean;
    productionLike: boolean;
    riskLevel: DevFallbackRiskLevel;
  };
  hostedAuth: WorkerHostedAuthConfigDiagnostics;
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

function isProductionLikeEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV?.trim().toLowerCase() === 'production';
}

function getConfiguredWorkerMethods(
  configured: AuthPolicyDiagnostics['configured'],
): WorkerAuthMethod[] {
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
  const devFallbackUserIdConfigured = Boolean(env.MCP_OAUTH_DEV_USER_ID?.trim());
  const devFallbackAllowFlagEnabled = parseBoolean(env.MCP_ALLOW_DEV_FALLBACK);
  const devFallbackEnabled = devFallbackUserIdConfigured && devFallbackAllowFlagEnabled;
  const productionLike = isProductionLikeEnvironment(env);
  const hostedAuth = evaluateWorkerHostedAuthConfig(
    env as Parameters<typeof evaluateWorkerHostedAuthConfig>[0],
  );
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

  errors.push(...hostedAuth.errors);

  if (serviceToken && apiKeyAuth) {
    warnings.push(
      'Both gateway token auth and API-key auth are configured; verify intended precedence',
    );
  }

  if (serviceToken) {
    warnings.push(
      'MCP_AUTH_TOKEN is configured; ensure it is used only via the explicit service-token header path, not client Authorization bearer auth',
    );
  }

  if (parseBoolean(env.MCP_TRUST_CLOUDFLARE_ACCESS_HEADERS)) {
    warnings.push(
      'MCP_TRUST_CLOUDFLARE_ACCESS_HEADERS is deprecated and ignored; explicitly enable MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION and/or MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS for the specific trust boundary you intend to expose.',
    );
  }

  if (parseBoolean(env.MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION)) {
    warnings.push(
      'MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION is enabled; only safe when every route that accepts CF-Access-Jwt-Assertion is protected by Cloudflare Access or another trusted edge boundary that strips spoofed headers.',
    );
  }

  if (parseBoolean(env.MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS)) {
    warnings.push(
      'MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS is enabled; only safe when every route that consumes cf-access-authenticated-user-* headers is protected by Cloudflare Access or another trusted edge boundary that strips spoofed headers.',
    );
  }

  const configuredWorkerMethods = getConfiguredWorkerMethods(configured);
  if (env.MCP_AUTH_PRIMARY?.trim()) {
    warnings.push(
      'MCP_AUTH_PRIMARY is deprecated and ignored; edge auth now requires OAuth/OIDC for client access',
    );
  }

  if (parseBoolean(env.MCP_ALLOW_STATIC_FALLBACK)) {
    warnings.push(
      'MCP_ALLOW_STATIC_FALLBACK is deprecated and ignored; static bearer-token fallback is disabled',
    );
  }

  if (devFallbackUserIdConfigured && !devFallbackAllowFlagEnabled) {
    warnings.push(
      'MCP_OAUTH_DEV_USER_ID is configured but inert because MCP_ALLOW_DEV_FALLBACK is not enabled; remove it outside controlled development to avoid accidental activation',
    );
  }

  if (!devFallbackUserIdConfigured && devFallbackAllowFlagEnabled) {
    warnings.push(
      'MCP_ALLOW_DEV_FALLBACK is enabled without MCP_OAUTH_DEV_USER_ID; disable the flag outside controlled development because it advertises an unsafe auth shortcut',
    );
  }

  if (devFallbackEnabled) {
    warnings.push(
      'OAuth dev fallback is enabled; /authorize can assume MCP_OAUTH_DEV_USER_ID without real user authentication. This is unsafe outside controlled development.',
    );
    if (productionLike) {
      errors.push('OAuth dev fallback cannot be enabled when NODE_ENV=production');
    }
  }

  const effectivePrimary = configuredWorkerMethods[0] ?? null;
  const devFallbackRiskLevel: DevFallbackRiskLevel = devFallbackEnabled
    ? 'enabled'
    : devFallbackUserIdConfigured || devFallbackAllowFlagEnabled
      ? 'misconfigured'
      : 'disabled';

  return {
    errors: errors.map((message) => redactSecretsInText(message)),
    warnings: warnings.map((message) => redactSecretsInText(message)),
    diagnostics: {
      precedence: [...AUTH_POLICY_MATRIX.precedence],
      configured,
      devFallback: {
        userIdConfigured: devFallbackUserIdConfigured,
        allowFlagEnabled: devFallbackAllowFlagEnabled,
        enabled: devFallbackEnabled,
        productionLike,
        riskLevel: devFallbackRiskLevel,
      },
      hostedAuth,
      effectivePrimary,
      incompatibleRulesTriggered,
    },
  };
}
