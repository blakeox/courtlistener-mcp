const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|api[-_ ]?key|private[-_ ]?key|client[-_ ]?secret|session)/i;

const SECRET_ENV_KEYS = [
  'MCP_AUTH_TOKEN',
  'MCP_UI_SESSION_SECRET',
  'OAUTH_CLIENT_SECRET',
  'COURTLISTENER_API_KEY',
  'AUTH_API_KEYS',
  'TURNSTILE_SECRET_KEY',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectConfiguredSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = new Set<string>();

  for (const key of SECRET_ENV_KEYS) {
    const rawValue = env[key];
    if (!rawValue) continue;
    if (key === 'AUTH_API_KEYS') {
      for (const token of rawValue
        .split(',')
        .map((candidate) => candidate.trim())
        .filter((candidate) => candidate.length >= 4)) {
        values.add(token);
      }
      continue;
    }

    const trimmed = rawValue.trim();
    if (trimmed.length >= 4) {
      values.add(trimmed);
    }
  }

  return [...values].sort((a, b) => b.length - a.length);
}

export function isSensitiveKeyName(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactSecretsInText(
  value: string,
  options: { additionalSecrets?: string[] } = {},
): string {
  let redacted = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  redacted = redacted.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, REDACTED);
  redacted = redacted.replace(
    /((?:token|secret|password|authorization|api[-_ ]?key|private[-_ ]?key|client[-_ ]?secret|session)[^:=\n]{0,24}[=:]\s*)(['"]?)([^\s,'";]+)/gi,
    '$1$2[REDACTED]',
  );

  const configured = collectConfiguredSecrets();
  const additional =
    options.additionalSecrets
      ?.map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length >= 4) ?? [];

  for (const secret of [...configured, ...additional]) {
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }

  return redacted;
}
