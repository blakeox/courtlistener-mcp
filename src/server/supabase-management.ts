import { getSupabaseConfig, sha256Hex, type SupabaseAuthConfig } from './supabase-auth.js';

export interface SignupInput {
  email: string;
  password: string;
  fullName?: string;
}

export interface SupabaseSignupConfig {
  url: string;
  anonKey: string;
}

export interface CreateKeyInput {
  userId: string;
  label?: string;
  expiresAt?: string | null;
}

export interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

export interface PasswordAuthResult {
  user: SupabaseUser;
  accessToken: string;
}

export interface SupabaseApiKey {
  id: string;
  user_id: string;
  label: string | null;
  is_active: boolean;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface CreatedApiKey {
  key: SupabaseApiKey;
  token: string;
}

export interface ApiKeyPrincipal {
  keyId: string;
  userId: string;
}

export type AuditActorType = 'anonymous' | 'service' | 'user';
export type AuditAction =
  | 'signup.user_created'
  | 'signup.initial_key_created'
  | 'keys.created'
  | 'keys.revoked';

export interface AuditEventInput {
  actorType: AuditActorType;
  actorUserId?: string | null;
  targetUserId?: string | null;
  apiKeyId?: string | null;
  action: AuditAction;
  status: 'success' | 'error';
  requestIp?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface SupabaseErrorPayload {
  error?: string;
  message?: string;
  msg?: string;
}

function normalizeLabel(label: string | undefined): string | null {
  const trimmed = label?.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

function toJsonHeaders(serviceRoleKey: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

function toPublicJsonHeaders(anonKey: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

function cleanUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function generateRawApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function readSupabaseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as SupabaseErrorPayload;
    return payload.message || payload.msg || payload.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function toIsoOrNull(expiresAt: string | undefined | null): string | null {
  if (!expiresAt) return null;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function isKeyExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return true;
  return parsed <= Date.now();
}

export function getSupabaseManagementConfig(env: {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_API_KEYS_TABLE?: string;
}): SupabaseAuthConfig | null {
  return getSupabaseConfig(env);
}

export function getSupabaseSignupConfig(env: {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}): SupabaseSignupConfig | null {
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }

  return {
    url: cleanUrl(url),
    anonKey,
  };
}

export async function getSupabaseUserFromAccessToken(
  config: SupabaseSignupConfig,
  accessToken: string,
): Promise<SupabaseUser> {
  const token = accessToken.trim();
  if (!token) {
    throw new Error('access_token_required');
  }

  const url = `${cleanUrl(config.url)}/auth/v1/user`;
  const response = await fetch(url, {
    method: 'GET',
    headers: toPublicJsonHeaders(config.anonKey, {
      Authorization: `Bearer ${token}`,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`access_token_invalid:${message}`);
  }

  const user = (await response.json()) as SupabaseUser;
  if (!user?.id) {
    throw new Error('access_token_invalid:Supabase returned an invalid user payload');
  }

  return user;
}

export async function signUpSupabaseUser(
  config: SupabaseSignupConfig,
  input: SignupInput,
  options: { emailRedirectTo?: string } = {},
): Promise<{ user: SupabaseUser | null }> {
  const url = `${cleanUrl(config.url)}/auth/v1/signup`;
  const response = await fetch(url, {
    method: 'POST',
    headers: toPublicJsonHeaders(config.anonKey),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        full_name: input.fullName?.trim() || null,
      },
      email_redirect_to: options.emailRedirectTo || undefined,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`signup_failed:${message}`);
  }

  const payload = (await response.json()) as { user?: SupabaseUser | null };

  return {
    user: payload?.user ?? null,
  };
}

export async function sendPasswordResetEmail(
  config: SupabaseSignupConfig,
  email: string,
  options: { redirectTo?: string } = {},
): Promise<void> {
  const url = `${cleanUrl(config.url)}/auth/v1/recover`;
  const response = await fetch(url, {
    method: 'POST',
    headers: toPublicJsonHeaders(config.anonKey),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      redirect_to: options.redirectTo || undefined,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`password_reset_email_failed:${message}`);
  }
}

export async function resetPasswordWithAccessToken(
  config: SupabaseSignupConfig,
  accessToken: string,
  newPassword: string,
): Promise<SupabaseUser> {
  const token = accessToken.trim();
  if (!token) {
    throw new Error('access_token_required');
  }

  const url = `${cleanUrl(config.url)}/auth/v1/user`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: toPublicJsonHeaders(config.anonKey, {
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify({
      password: newPassword,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`password_reset_failed:${message}`);
  }

  const user = (await response.json()) as SupabaseUser;
  return user;
}

/** Confirm a user's email via the Supabase Admin API (requires service role key). */
export async function confirmUserEmail(
  config: SupabaseAuthConfig,
  userId: string,
): Promise<void> {
  const url = `${cleanUrl(config.url)}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: toJsonHeaders(config.serviceRoleKey),
    body: JSON.stringify({ email_confirm: true }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`email_confirm_failed:${message}`);
  }
}

export async function authenticateUserWithPassword(
  config: SupabaseAuthConfig,
  email: string,
  password: string,
): Promise<PasswordAuthResult> {
  const tokenUrl = `${cleanUrl(config.url)}/auth/v1/token?grant_type=password`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: toJsonHeaders(config.serviceRoleKey),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`password_auth_failed:${message}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    user?: SupabaseUser;
  };

  if (!payload.user?.id || !payload.access_token) {
    throw new Error('password_auth_failed:Supabase returned an invalid auth payload');
  }

  return {
    user: payload.user,
    accessToken: payload.access_token,
  };
}

/** Authenticate with email/password using the public anon key (no service role key required). */
export async function authenticateUserWithAnonKey(
  config: SupabaseSignupConfig,
  email: string,
  password: string,
): Promise<PasswordAuthResult> {
  const tokenUrl = `${cleanUrl(config.url)}/auth/v1/token?grant_type=password`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: toPublicJsonHeaders(config.anonKey),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`password_auth_failed:${message}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    user?: SupabaseUser;
  };

  if (!payload.user?.id || !payload.access_token) {
    throw new Error('password_auth_failed:Supabase returned an invalid auth payload');
  }

  return {
    user: payload.user,
    accessToken: payload.access_token,
  };
}

export async function createApiKeyForUser(
  config: SupabaseAuthConfig,
  input: CreateKeyInput,
): Promise<CreatedApiKey> {
  const rawToken = generateRawApiToken();
  const keyHash = await sha256Hex(rawToken);
  const table = encodeURIComponent(config.apiKeysTable);
  const url = `${cleanUrl(config.url)}/rest/v1/${table}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: toJsonHeaders(config.serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      user_id: input.userId,
      key_hash: keyHash,
      label: normalizeLabel(input.label),
      is_active: true,
      revoked_at: null,
      expires_at: toIsoOrNull(input.expiresAt),
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`create_api_key_failed:${message}`);
  }

  const rows = (await response.json()) as SupabaseApiKey[];
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id || !row.user_id) {
    throw new Error('create_api_key_failed:Supabase returned an invalid key payload');
  }

  return {
    key: {
      id: row.id,
      user_id: row.user_id,
      label: row.label ?? null,
      is_active: row.is_active !== false,
      revoked_at: row.revoked_at ?? null,
      expires_at: row.expires_at ?? null,
      created_at: row.created_at,
    },
    token: rawToken,
  };
}

export async function resolvePrincipalFromApiToken(
  config: SupabaseAuthConfig,
  rawToken: string,
): Promise<ApiKeyPrincipal | null> {
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  const keyHash = await sha256Hex(trimmed);
  const table = encodeURIComponent(config.apiKeysTable);
  const url =
    `${cleanUrl(config.url)}/rest/v1/${table}` +
    `?select=id,user_id,is_active,revoked_at,expires_at&key_hash=eq.${encodeURIComponent(keyHash)}&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: toJsonHeaders(config.serviceRoleKey, {
      Accept: 'application/json',
      Prefer: 'count=none',
    }),
  });

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as SupabaseApiKey[];
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id || !row?.user_id) return null;
  if (row.is_active === false) return null;
  if (row.revoked_at) return null;
  if (isKeyExpired(row.expires_at ?? null)) return null;

  return {
    keyId: row.id,
    userId: row.user_id,
  };
}

export async function listApiKeysForUser(
  config: SupabaseAuthConfig,
  userId: string,
  limit = 50,
): Promise<SupabaseApiKey[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const table = encodeURIComponent(config.apiKeysTable);
  const url =
    `${cleanUrl(config.url)}/rest/v1/${table}` +
    `?select=id,user_id,label,is_active,revoked_at,expires_at,created_at&user_id=eq.${encodeURIComponent(userId)}` +
    `&order=created_at.desc&limit=${safeLimit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: toJsonHeaders(config.serviceRoleKey, {
      Accept: 'application/json',
      Prefer: 'count=none',
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`list_api_keys_failed:${message}`);
  }

  const rows = (await response.json()) as SupabaseApiKey[];
  return Array.isArray(rows) ? rows : [];
}

export async function revokeApiKeyForUser(
  config: SupabaseAuthConfig,
  userId: string,
  keyId: string,
): Promise<boolean> {
  const table = encodeURIComponent(config.apiKeysTable);
  const url =
    `${cleanUrl(config.url)}/rest/v1/${table}` +
    `?id=eq.${encodeURIComponent(keyId)}&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&revoked_at=is.null`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: toJsonHeaders(config.serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      is_active: false,
      revoked_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`revoke_api_key_failed:${message}`);
  }

  const rows = (await response.json()) as SupabaseApiKey[];
  return Array.isArray(rows) && rows.length > 0;
}

export async function logAuditEvent(
  config: SupabaseAuthConfig,
  event: AuditEventInput,
): Promise<void> {
  const url = `${cleanUrl(config.url)}/rest/v1/mcp_audit_logs`;
  const response = await fetch(url, {
    method: 'POST',
    headers: toJsonHeaders(config.serviceRoleKey),
    body: JSON.stringify({
      actor_type: event.actorType,
      actor_user_id: event.actorUserId ?? null,
      target_user_id: event.targetUserId ?? null,
      api_key_id: event.apiKeyId ?? null,
      action: event.action,
      status: event.status,
      request_ip: event.requestIp ?? null,
      metadata: event.metadata ?? null,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseError(response);
    throw new Error(`audit_log_failed:${message}`);
  }
}
