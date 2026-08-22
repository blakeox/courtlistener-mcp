import { getPrevalidatedOAuthIdentity } from './prevalidated-oauth-context.js';

interface WorkerUsageSessionRuntime<TEnv> {
  resolveCloudflareOAuthUserId(request: Request, env: TEnv): Promise<string | null>;
}

interface ResolveWorkerUsageParams<TEnv> {
  request: Request;
  env: TEnv;
  ctx: ExecutionContext;
  workerUiSessionRuntime: WorkerUsageSessionRuntime<TEnv>;
  getUsageSnapshot: (env: TEnv, userId: string) => Promise<unknown | null>;
}

export type WorkerUsageResolution =
  { kind: 'unauthenticated' } | { kind: 'unavailable' } | { kind: 'ok'; snapshot: unknown };

export async function resolveWorkerUsage<TEnv>(
  params: ResolveWorkerUsageParams<TEnv>,
): Promise<WorkerUsageResolution> {
  const { request, env, ctx, workerUiSessionRuntime, getUsageSnapshot } = params;

  const prevalidatedOAuthUserId = getPrevalidatedOAuthIdentity(ctx)?.userId ?? null;
  const userId =
    prevalidatedOAuthUserId ||
    (await workerUiSessionRuntime.resolveCloudflareOAuthUserId(request, env));
  if (!userId) {
    return { kind: 'unauthenticated' };
  }

  const snapshot = await getUsageSnapshot(env, userId);
  if (!snapshot) {
    return { kind: 'unavailable' };
  }

  return { kind: 'ok', snapshot };
}
