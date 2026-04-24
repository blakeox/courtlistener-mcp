import type { PrincipalContext } from '../infrastructure/principal-context.js';

type ExecutionContextWithProps = ExecutionContext & { props?: Record<string, unknown> };

export interface PrevalidatedOAuthIdentity {
  userId: string;
  authMethod: PrincipalContext['authMethod'];
}

function normalizePrevalidatedAuthMethod(value: unknown): PrincipalContext['authMethod'] {
  return value === 'service' ? 'service' : 'oidc';
}

export function getPrevalidatedOAuthIdentity(
  ctx: ExecutionContext,
): PrevalidatedOAuthIdentity | null {
  const props = (ctx as ExecutionContextWithProps).props;
  const userId = typeof props?.userId === 'string' ? props.userId.trim() : '';
  if (!userId) {
    return null;
  }

  return {
    userId,
    authMethod: normalizePrevalidatedAuthMethod(props?.authMethod),
  };
}
