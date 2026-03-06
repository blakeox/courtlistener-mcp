export type EdgePrimaryAuthMethod = 'oidc';
export type EdgeAuthAttempt = 'serviceToken' | EdgePrimaryAuthMethod;

const PRIMARY_AUTH_PRECEDENCE: readonly EdgePrimaryAuthMethod[] = ['oidc'] as const;
const EDGE_AUTH_PRECEDENCE: readonly EdgeAuthAttempt[] = ['serviceToken', ...PRIMARY_AUTH_PRECEDENCE] as const;

function normalizePrimaryAuthMethod(value: string | null | undefined): EdgePrimaryAuthMethod | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'oidc' || normalized === 'oauth') return 'oidc';
  return null;
}

export interface BuildEdgeAuthDecisionEngineInput {
  requestedPrimary: string | null | undefined;
  serviceTokenConfigured: boolean;
  oidcConfigured: boolean;
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
  const configuredPrimary = PRIMARY_AUTH_PRECEDENCE.filter(() => input.oidcConfigured);
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

  return {
    precedence: EDGE_AUTH_PRECEDENCE,
    requestedPrimary,
    effectivePrimary,
    attempts,
  };
}
