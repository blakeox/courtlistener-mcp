export interface OAuthFrontdoorRateLimitDeps<TEnv> {
  getClientIdentifier: (request: Request) => string;
  getAuthRouteRateLimitedResponse: (
    bucketId: string,
    env: TEnv,
    nowMs: number,
  ) => Promise<Response | null>;
  now: () => number;
}

export async function getOAuthFrontdoorRateLimitedResponse<TEnv>(
  request: Request,
  env: TEnv,
  routeKey: string,
  deps?: Partial<OAuthFrontdoorRateLimitDeps<TEnv>>,
): Promise<Response | null> {
  if (!deps?.getClientIdentifier || !deps.getAuthRouteRateLimitedResponse || !deps.now) {
    return null;
  }

  const clientId = deps.getClientIdentifier(request);
  const bucketId = `${routeKey}:${request.method.toUpperCase()}:${clientId}`;
  return deps.getAuthRouteRateLimitedResponse(bucketId, env, deps.now());
}
