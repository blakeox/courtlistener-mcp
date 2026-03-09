#!/usr/bin/env node

import crypto from 'node:crypto';

const DEFAULT_TABLE = 'mcp_api_keys';

function printUsage() {
  console.log(`
Usage:
  node scripts/supabase/mcp-key-manager.js create --user-id <uuid> [--label <text>] [--expires-at <ISO8601> | --expires-days <int>]
  node scripts/supabase/mcp-key-manager.js revoke (--key-id <uuid> | --token <raw_token>)
  node scripts/supabase/mcp-key-manager.js list [--user-id <uuid>] [--label <text> | --label-contains <text>] [--expires-before <ISO8601>] [--expires-after <ISO8601>] [--active-only true|false] [--limit <int>]

Environment:
  SUPABASE_URL                 Required. Example: https://<project-ref>.supabase.co
  SUPABASE_SECRET_KEY          Required. Supabase secret key
  SUPABASE_API_KEYS_TABLE      Optional. Defaults to mcp_api_keys
`);
}

function readEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    flags.set(key, value);
    i += 1;
  }

  return { positional, flags };
}

function requireFlag(flags, name) {
  const value = flags.get(name)?.trim();
  if (!value) throw new Error(`Missing required flag: --${name}`);
  return value;
}

function parseExpiresAt(flags) {
  const expiresAt = flags.get('expires-at')?.trim();
  const expiresDays = flags.get('expires-days')?.trim();

  if (expiresAt && expiresDays) {
    throw new Error('Use either --expires-at or --expires-days, not both');
  }

  if (expiresAt) {
    const parsed = Date.parse(expiresAt);
    if (Number.isNaN(parsed)) throw new Error('Invalid --expires-at (must be ISO8601)');
    return new Date(parsed).toISOString();
  }

  if (expiresDays) {
    const parsedDays = Number.parseInt(expiresDays, 10);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      throw new Error('--expires-days must be a positive integer');
    }
    return new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function parseIsoTimestamp(value, flagName) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${flagName} (must be ISO8601)`);
  }
  return new Date(parsed).toISOString();
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function buildHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function createKey(config, flags) {
  const userId = requireFlag(flags, 'user-id');
  const label = flags.get('label')?.trim() || null;
  const expiresAt = parseExpiresAt(flags);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const keyHash = sha256Hex(rawToken);

  const payload = {
    user_id: userId,
    key_hash: keyHash,
    label,
    is_active: true,
    revoked_at: null,
    expires_at: expiresAt,
  };

  const url = `${config.baseUrl}/rest/v1/${encodeURIComponent(config.table)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config.serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Create key failed (${response.status}): ${errorText}`);
  }

  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) {
    throw new Error('Create key failed: unexpected response payload');
  }

  console.log(
    JSON.stringify(
      {
        action: 'create',
        key_id: row.id,
        user_id: row.user_id,
        label: row.label ?? null,
        expires_at: row.expires_at ?? null,
        token: rawToken,
      },
      null,
      2,
    ),
  );
}

async function revokeKey(config, flags) {
  const keyId = flags.get('key-id')?.trim() || null;
  const rawToken = flags.get('token')?.trim() || null;
  if (!keyId && !rawToken) {
    throw new Error('Revoke requires --key-id <uuid> or --token <raw_token>');
  }
  if (keyId && rawToken) {
    throw new Error('Use either --key-id or --token, not both');
  }

  const filters = [
    'is_active=eq.true',
    'revoked_at=is.null',
  ];
  if (keyId) {
    filters.push(`id=eq.${encodeURIComponent(keyId)}`);
  } else {
    const keyHash = sha256Hex(rawToken);
    filters.push(`key_hash=eq.${encodeURIComponent(keyHash)}`);
  }

  const query = filters.join('&');
  const url = `${config.baseUrl}/rest/v1/${encodeURIComponent(config.table)}?${query}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(config.serviceRoleKey, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      is_active: false,
      revoked_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Revoke key failed (${response.status}): ${errorText}`);
  }

  const rows = await response.json();
  const revokedCount = Array.isArray(rows) ? rows.length : 0;
  console.log(
    JSON.stringify(
      {
        action: 'revoke',
        revoked_count: revokedCount,
      },
      null,
      2,
    ),
  );
}

function parseBooleanFlag(value, defaultValue) {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function maskHash(hash) {
  if (!hash || hash.length < 12) return '***';
  return `${hash.slice(0, 6)}...${hash.slice(-6)}`;
}

async function listKeys(config, flags) {
  const userId = flags.get('user-id')?.trim() || null;
  const label = flags.get('label')?.trim() || null;
  const labelContains = flags.get('label-contains')?.trim() || null;
  if (label && labelContains) {
    throw new Error('Use either --label or --label-contains, not both');
  }
  const expiresBefore = parseIsoTimestamp(flags.get('expires-before')?.trim(), '--expires-before');
  const expiresAfter = parseIsoTimestamp(flags.get('expires-after')?.trim(), '--expires-after');
  const activeOnly = parseBooleanFlag(flags.get('active-only'), false);
  const limitRaw = flags.get('limit')?.trim() || '50';
  const limit = Number.parseInt(limitRaw, 10);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }

  const queryParts = [
    'select=id,user_id,label,is_active,revoked_at,expires_at,created_at,key_hash',
    `order=created_at.desc`,
    `limit=${limit}`,
  ];
  if (userId) queryParts.push(`user_id=eq.${encodeURIComponent(userId)}`);
  if (label) queryParts.push(`label=eq.${encodeURIComponent(label)}`);
  if (labelContains) queryParts.push(`label=ilike.${encodeURIComponent(`*${labelContains}*`)}`);
  if (expiresBefore) queryParts.push(`expires_at=lt.${encodeURIComponent(expiresBefore)}`);
  if (expiresAfter) queryParts.push(`expires_at=gt.${encodeURIComponent(expiresAfter)}`);
  if (activeOnly) queryParts.push('is_active=eq.true');

  const url = `${config.baseUrl}/rest/v1/${encodeURIComponent(config.table)}?${queryParts.join('&')}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(config.serviceRoleKey),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`List keys failed (${response.status}): ${errorText}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('List keys failed: unexpected response payload');
  }

  const redactedRows = rows.map((row) => ({
    id: row.id ?? null,
    user_id: row.user_id ?? null,
    label: row.label ?? null,
    is_active: Boolean(row.is_active),
    revoked_at: row.revoked_at ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at ?? null,
    key_hash_preview: maskHash(String(row.key_hash ?? '')),
  }));

  console.log(
    JSON.stringify(
      {
        action: 'list',
        count: redactedRows.length,
        filters: {
          user_id: userId,
          label,
          label_contains: labelContains,
          expires_before: expiresBefore,
          expires_after: expiresAfter,
          active_only: activeOnly,
          limit,
        },
        keys: redactedRows,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return;
  }

  const { positional, flags } = parseArgs(argv);
  const command = positional[0]?.trim();
  if (!command || !['create', 'revoke', 'list'].includes(command)) {
    printUsage();
    throw new Error('First argument must be one of: create, revoke, list');
  }

  const config = {
    baseUrl: normalizeBaseUrl(readEnv('SUPABASE_URL')),
    serviceRoleKey: readEnv('SUPABASE_SECRET_KEY'),
    table: process.env.SUPABASE_API_KEYS_TABLE?.trim() || DEFAULT_TABLE,
  };

  if (command === 'create') {
    await createKey(config, flags);
    return;
  }

  if (command === 'list') {
    await listKeys(config, flags);
    return;
  }

  await revokeKey(config, flags);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
