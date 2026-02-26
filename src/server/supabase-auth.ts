export interface SupabaseAuthConfig {
  url: string;
  serviceRoleKey: string;
  apiKeysTable: string;
}

export interface SupabaseApiKeyRecord {
  user_id?: string;
  is_active?: boolean;
  revoked_at?: string | null;
  expires_at?: string | null;
}

export interface SupabaseAuthDeps {
  fetchFn?: typeof fetch;
  nowFn?: () => number;
}

export interface SupabaseApiKeyValidationResult {
  valid: boolean;
  reason?: string;
}

const DEFAULT_API_KEYS_TABLE = 'mcp_api_keys';
const CACHE_TTL_MS = 0;
const NEGATIVE_CACHE_TTL_MS = 5_000;

interface CacheEntry {
  result: SupabaseApiKeyValidationResult;
  expiresAtMs: number;
}

const validationCache = new Map<string, CacheEntry>();
const inFlightValidations = new Map<string, Promise<SupabaseApiKeyValidationResult>>();

function ensureNoTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getSupabaseConfig(env: {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_API_KEYS_TABLE?: string;
}): SupabaseAuthConfig | null {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: ensureNoTrailingSlash(url),
    serviceRoleKey,
    apiKeysTable: env.SUPABASE_API_KEYS_TABLE?.trim() || DEFAULT_API_KEYS_TABLE,
  };
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const expiresTime = Date.parse(expiresAt);
  if (Number.isNaN(expiresTime)) return true;
  return expiresTime <= Date.now();
}

function isRevoked(revokedAt: string | null | undefined): boolean {
  return Boolean(revokedAt);
}

export async function validateSupabaseApiKey(
  bearerToken: string,
  config: SupabaseAuthConfig,
  deps: SupabaseAuthDeps = {},
): Promise<SupabaseApiKeyValidationResult> {
  if (!bearerToken.trim()) {
    return { valid: false, reason: 'missing_token' };
  }

  const nowFn = deps.nowFn ?? Date.now;
  const tokenHash = await sha256Hex(bearerToken.trim());
  const cacheKey = `${config.url}|${config.apiKeysTable}|${tokenHash}`;
  const now = nowFn();
  const cached = validationCache.get(cacheKey);
  if (cached && cached.expiresAtMs > now) {
    return cached.result;
  }

  const existingValidation = inFlightValidations.get(cacheKey);
  if (existingValidation) {
    return existingValidation;
  }

  const validationPromise = (async (): Promise<SupabaseApiKeyValidationResult> => {
    const encodedHash = encodeURIComponent(tokenHash);
    const encodedTable = encodeURIComponent(config.apiKeysTable);
    const url =
      `${config.url}/rest/v1/${encodedTable}` +
      `?select=user_id,is_active,revoked_at,expires_at&key_hash=eq.${encodedHash}&limit=1`;
    const fetchFn = deps.fetchFn ?? fetch;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json',
        Prefer: 'count=none',
      },
    });

    let result: SupabaseApiKeyValidationResult;

    if (!response.ok) {
      result = { valid: false, reason: 'supabase_unreachable' };
    } else {
      const rows = (await response.json()) as SupabaseApiKeyRecord[];
      if (!Array.isArray(rows) || rows.length === 0) {
        result = { valid: false, reason: 'invalid_api_key' };
      } else {
        const record = rows[0];
        if (!record || record.is_active === false) {
          result = { valid: false, reason: 'api_key_inactive' };
        } else if (isRevoked(record.revoked_at)) {
          result = { valid: false, reason: 'api_key_revoked' };
        } else if (isExpired(record.expires_at)) {
          result = { valid: false, reason: 'api_key_expired' };
        } else {
          result = { valid: true };
        }
      }
    }

    const ttlMs = result.valid ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (ttlMs > 0) {
      validationCache.set(cacheKey, { result, expiresAtMs: nowFn() + ttlMs });
    } else {
      validationCache.delete(cacheKey);
    }
    return result;
  })();

  inFlightValidations.set(cacheKey, validationPromise);
  try {
    return await validationPromise;
  } finally {
    inFlightValidations.delete(cacheKey);
  }
}

export function clearSupabaseAuthValidationCacheForTests(): void {
  validationCache.clear();
  inFlightValidations.clear();
}
