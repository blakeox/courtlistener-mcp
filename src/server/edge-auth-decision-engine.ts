export type EdgePrimaryAuthMethod = 'oidc' | 'static';
export type EdgeAuthAttempt = 'serviceToken' | EdgePrimaryAuthMethod;

const PRIMARY_AUTH_PRECEDENCE: readonly EdgePrimaryAuthMethod[] = ['oidc', 'static'] as const;
const EDGE_AUTH_PRECEDENCE: readonly EdgeAuthAttempt[] = ['serviceToken', ...PRIMARY_AUTH_PRECEDENCE] as const;

function normalizePrimaryAuthMethod(value: string | null | undefined): EdgePrimaryAuthMethod | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'oidc' || normalized === 'oauth') return 'oidc';
  if (normalized === 'static' || normalized === 'static-token' || normalized === 'service-token') {
    return 'static';
  }
  return null;
}

export interface BuildEdgeAuthDecisionEngineInput {
  requestedPrimary: string | null | undefined;
  allowStaticFallback: boolean;
  serviceTokenConfigured: boolean;
  oidcConfigured: boolean;
  staticTokenConfigured: boolean;
}

export interface EdgeAuthDecisionEngine {
  precedence: readonly EdgeAuthAttempt[];
  requestedPrimary: EdgePrimaryAuthMethod | null;
  effectivePrimary: EdgePrimaryAuthMethod | null;
  attempts: readonly EdgeAuthAttempt[];
}

export function buildEdgeAuthDecisionEngine(
  input: BuildEdgeAuthDecisionEngineInput,
): EdgeAuthDecisionEngine {
  const configuredPrimary = PRIMARY_AUTH_PRECEDENCE.filter((method) =>
    method === 'oidc' ? input.oidcConfigured : input.staticTokenConfigured,
  );
  const requestedPrimary = normalizePrimaryAuthMethod(input.requestedPrimary);
  const effectivePrimary =
    requestedPrimary && configuredPrimary.includes(requestedPrimary)
      ? requestedPrimary
      : (configuredPrimary[0] ?? null);

  const attempts: EdgeAuthAttempt[] = [];
  if (input.serviceTokenConfigured) {
    attempts.push('serviceToken');
  }
  if (effectivePrimary && !attempts.includes(effectivePrimary)) {
    attempts.push(effectivePrimary);
  }
  if (input.allowStaticFallback && input.staticTokenConfigured && !attempts.includes('static')) {
    attempts.push('static');
  }

  return {
    precedence: EDGE_AUTH_PRECEDENCE,
    requestedPrimary,
    effectivePrimary,
    attempts,
  };
}
