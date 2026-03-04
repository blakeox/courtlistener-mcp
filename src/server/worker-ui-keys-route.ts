import type { SupabaseAuthConfig } from './supabase-auth.js';

interface UiApiAuthResult {
  userId: string;
  keyId?: string;
  authType: 'api_key' | 'session';
}

interface CreatedKeyPayload {
  key: {
    id: string;
    label: string | null;
    created_at: string;
    expires_at: string | null;
  };
  token: string;
}

interface AuditEventPayload {
  actorType: 'anonymous' | 'service' | 'user';
  actorUserId?: string | null;
  targetUserId?: string | null;
  apiKeyId?: string | null;
  action: 'keys.created' | 'keys.revoked';
  status: 'success' | 'error';
  requestIp?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface HandleUiKeysRoutesDeps<TEnv> {
  rejectDisallowedUiOrigin: (origin: string | null, allowedOrigins: string[]) => Response | null;
  applyUiRateLimit: (
    request: Request,
    env: TEnv,
    bucket: 'signup' | 'keys',
    clientKey?: string,
  ) => Promise<Response | null>;
  authenticateUiApiRequest: (request: Request, env: TEnv) => Promise<UiApiAuthResult | Response>;
  getSupabaseManagementConfig: (env: TEnv) => SupabaseAuthConfig | null;
  listApiKeysForUser: (
    config: SupabaseAuthConfig,
    userId: string,
    limit: number,
  ) => Promise<unknown>;
  requireCsrfToken: (request: Request) => Response | null;
  parseJsonBody: <T>(request: Request) => Promise<T | null>;
  getApiKeyMaxTtlDays: (env: TEnv) => number;
  getCappedExpiresAtFromDays: (
    rawDays: number | undefined,
    defaultDays: number,
    maxDays: number,
  ) => string | null;
  createApiKeyForUser: (
    config: SupabaseAuthConfig,
    input: { userId: string; label?: string; expiresAt?: string | null },
  ) => Promise<CreatedKeyPayload>;
  revokeApiKeyForUser: (config: SupabaseAuthConfig, userId: string, keyId: string) => Promise<boolean>;
  logAuditEvent: (config: SupabaseAuthConfig, event: AuditEventPayload) => Promise<void>;
  logWorkerWarning: (event: string, error: unknown, metadata?: Record<string, unknown>) => void;
  getRequestIp: (request: Request) => string | null;
  jsonError: (message: string, status: number, errorCode: string) => Response;
  jsonResponse: (payload: unknown, status?: number, extraHeaders?: HeadersInit) => Response;
}

export interface HandleUiKeysRoutesParams<TEnv> {
  request: Request;
  url: URL;
  origin: string | null;
  allowedOrigins: string[];
  env: TEnv;
  deps: HandleUiKeysRoutesDeps<TEnv>;
}

export async function handleUiKeysRoutes<TEnv>(
  params: HandleUiKeysRoutesParams<TEnv>,
): Promise<Response | null> {
  const { request, url, origin, allowedOrigins, env, deps } = params;

  if (url.pathname === '/api/keys') {
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;

    const keysRateLimited = await deps.applyUiRateLimit(request, env, 'keys');
    if (keysRateLimited) {
      return keysRateLimited;
    }

    const authResult = await deps.authenticateUiApiRequest(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }
    const perUserRateLimited = await deps.applyUiRateLimit(request, env, 'keys', `user:${authResult.userId}`);
    if (perUserRateLimited) {
      return perUserRateLimited;
    }

    const config = deps.getSupabaseManagementConfig(env);
    if (!config) {
      return deps.jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
    }

    if (request.method === 'GET') {
      try {
        const keys = await deps.listApiKeysForUser(config, authResult.userId, 100);
        return deps.jsonResponse({
          user_id: authResult.userId,
          keys,
        });
      } catch {
        return deps.jsonError('Failed to list keys.', 400, 'keys_list_failed');
      }
    }

    if (request.method === 'POST') {
      if (authResult.authType === 'session') {
        const csrfError = deps.requireCsrfToken(request);
        if (csrfError) return csrfError;
      }
      const body = await deps.parseJsonBody<{ label?: string; expiresDays?: number }>(request);
      const label = (body?.label?.trim() || 'rotation').slice(0, 200);
      const maxTtlDays = deps.getApiKeyMaxTtlDays(env);
      const expiresAt = deps.getCappedExpiresAtFromDays(body?.expiresDays, 90, maxTtlDays);

      try {
        const createdKey = await deps.createApiKeyForUser(config, {
          userId: authResult.userId,
          label,
          expiresAt,
        });
        try {
          await deps.logAuditEvent(config, {
            actorType: 'user',
            actorUserId: authResult.userId,
            targetUserId: authResult.userId,
            apiKeyId: createdKey.key.id,
            action: 'keys.created',
            status: 'success',
            requestIp: deps.getRequestIp(request),
            metadata: { label: createdKey.key.label },
          });
        } catch (auditError) {
          deps.logWorkerWarning('audit_log_failed', auditError, { action: 'keys.created' });
        }
        return deps.jsonResponse(
          {
            message: 'Key created.',
            api_key: {
              id: createdKey.key.id,
              label: createdKey.key.label,
              created_at: createdKey.key.created_at,
              expires_at: createdKey.key.expires_at,
              token: createdKey.token,
            },
          },
          201,
        );
      } catch {
        return deps.jsonError('Failed to create key.', 400, 'key_create_failed');
      }
    }

    return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
  }

  if (url.pathname === '/api/keys/revoke') {
    if (request.method !== 'POST') {
      return deps.jsonError('Method not allowed', 405, 'method_not_allowed');
    }
    const uiOriginRejection = deps.rejectDisallowedUiOrigin(origin, allowedOrigins);
    if (uiOriginRejection) return uiOriginRejection;

    const keysRateLimited = await deps.applyUiRateLimit(request, env, 'keys');
    if (keysRateLimited) {
      return keysRateLimited;
    }

    const authResult = await deps.authenticateUiApiRequest(request, env);
    if (authResult instanceof Response) {
      return authResult;
    }
    const perUserRateLimited = await deps.applyUiRateLimit(request, env, 'keys', `user:${authResult.userId}`);
    if (perUserRateLimited) {
      return perUserRateLimited;
    }

    const config = deps.getSupabaseManagementConfig(env);
    if (!config) {
      return deps.jsonError('Supabase auth is not configured on this worker.', 503, 'supabase_not_configured');
    }

    const body = await deps.parseJsonBody<{ keyId?: string }>(request);
    if (authResult.authType === 'session') {
      const csrfError = deps.requireCsrfToken(request);
      if (csrfError) return csrfError;
    }
    const keyId = body?.keyId?.trim();
    if (!keyId) {
      return deps.jsonError('keyId is required.', 400, 'missing_key_id');
    }

    try {
      const revoked = await deps.revokeApiKeyForUser(config, authResult.userId, keyId);
      if (!revoked) {
        return deps.jsonError('Key not found or already revoked.', 404, 'key_not_found');
      }
      try {
        await deps.logAuditEvent(config, {
          actorType: 'user',
          actorUserId: authResult.userId,
          targetUserId: authResult.userId,
          apiKeyId: keyId,
          action: 'keys.revoked',
          status: 'success',
          requestIp: deps.getRequestIp(request),
        });
      } catch (auditError) {
        deps.logWorkerWarning('audit_log_failed', auditError, { action: 'keys.revoked' });
      }
      return deps.jsonResponse({ message: 'Key revoked.' });
    } catch {
      return deps.jsonError('Failed to revoke key.', 400, 'key_revoke_failed');
    }
  }

  return null;
}
