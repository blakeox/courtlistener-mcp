interface WorkerUsageSessionRuntime<TEnv> {
  resolveCloudflareOAuthUserId(request: Request, env: TEnv): Promise<string | null>;
}

interface ResolveWorkerUsageParams<TEnv> {
  request: Request;
  env: TEnv;
  workerUiSessionRuntime: WorkerUsageSessionRuntime<TEnv>;
  getUsageSnapshot: (env: TEnv, userId: string) => Promise<unknown | null>;
}

export type WorkerUsageResolution =
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; snapshot: unknown };

export async function resolveWorkerUsage<TEnv>(
  params: ResolveWorkerUsageParams<TEnv>,
): Promise<WorkerUsageResolution> {
  const { request, env, workerUiSessionRuntime, getUsageSnapshot } = params;

  const oauthUserId = request.headers.get('x-oauth-user-id')?.trim() || null;
  const userId = oauthUserId || (await workerUiSessionRuntime.resolveCloudflareOAuthUserId(request, env));
  if (!userId) {
    return { kind: 'unauthenticated' };
  }

  const snapshot = await getUsageSnapshot(env, userId);
  if (!snapshot) {
    return { kind: 'unavailable' };
  }

  return { kind: 'ok', snapshot };
}
