import { AsyncLocalStorage } from 'node:async_hooks';

export interface PrincipalContext {
  authMethod: 'supabase' | 'oidc' | 'static';
  userId?: string;
}

const principalStorage = new AsyncLocalStorage<PrincipalContext | undefined>();

export function runWithPrincipalContext<T>(
  principal: PrincipalContext | undefined,
  callback: () => T,
): T {
  return principalStorage.run(principal, callback);
}

export function getPrincipalContext(): PrincipalContext | undefined {
  return principalStorage.getStore();
}
