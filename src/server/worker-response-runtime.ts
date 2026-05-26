import { buildMcpCorsHeaders } from './transport-boundary-headers.js';
import { HOSTED_AUTH_INLINE_SCRIPT_HASHES } from './hosted-auth-html-security.js';

export { HOSTED_AUTH_INLINE_SCRIPT_HASHES } from './hosted-auth-html-security.js';

export interface HtmlResponseSecurityOptions {
  formActionOrigins?: string[];
  /** Hosted auth pages use same-origin POST forms; omit form-action to avoid Chrome/Cursor CSP false blocks. */
  omitFormAction?: boolean;
  allowHostedAuthInlineScriptHashes?: boolean;
}

export function cloneHeadersPreservingSetCookie(source: Headers): Headers {
  const headers = new Headers();
  appendHeaders(headers, source);
  return headers;
}

export function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = createSecureResponseHeaders({ 'Cache-Control': 'no-store' }, extraHeaders);
  return Response.json(payload, {
    status,
    headers,
  });
}

export function jsonError(
  error: string,
  status: number,
  errorCode: string,
  extra?: Record<string, unknown>,
  extraHeaders?: HeadersInit,
): Response {
  return jsonResponse(
    {
      error,
      error_code: errorCode,
      ...(extra ?? {}),
    },
    status,
    extraHeaders,
  );
}

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function htmlResponse(
  html: string,
  nonce: string,
  extraHeaders?: HeadersInit,
  securityOptions?: HtmlResponseSecurityOptions,
): Response {
  const headers = createSecureResponseHeaders(
    {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    extraHeaders,
    {
      nonce,
      ...securityOptions,
    },
  );
  return new Response(html, {
    status: 200,
    headers,
  });
}

export function redirectResponse(
  location: string,
  status = 302,
  extraHeaders?: HeadersInit,
): Response {
  const headers = createSecureResponseHeaders(
    {
      Location: location,
      'Cache-Control': 'no-store',
    },
    extraHeaders,
  );
  return new Response(null, { status, headers });
}

export function spaAssetResponse(
  content: string,
  contentType: string,
  buildId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = createSecureResponseHeaders(
    {
      'content-type': contentType,
      'Cache-Control': 'public, max-age=300',
      ETag: `"${buildId}"`,
    },
    extraHeaders,
  );
  return new Response(content, { status: 200, headers });
}

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Headers {
  return buildMcpCorsHeaders(origin, allowedOrigins);
}

export function withCors(
  response: Response,
  origin: string | null,
  allowedOrigins: string[],
): Response {
  const headers = cloneHeadersPreservingSetCookie(response.headers);
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function appendHeaders(headers: Headers, extraHeaders?: HeadersInit): void {
  if (!extraHeaders) return;
  const source = extraHeaders instanceof Headers ? extraHeaders : new Headers(extraHeaders);
  const setCookieValues = getSetCookieValues(extraHeaders, source);
  for (const [key, value] of source.entries()) {
    if (key.toLowerCase() === 'set-cookie') continue;
    headers.append(key, value);
  }
  for (const value of setCookieValues) {
    headers.append('Set-Cookie', value);
  }
}

function createSecureResponseHeaders(
  baseHeaders: HeadersInit,
  extraHeaders?: HeadersInit,
  securityOptions?: HtmlResponseSecurityOptions & { nonce?: string },
): Headers {
  const headers = new Headers(baseHeaders);
  appendHeaders(headers, extraHeaders);
  applySecurityHeaders(headers, securityOptions);
  return headers;
}

function applySecurityHeaders(
  headers: Headers,
  securityOptions?: HtmlResponseSecurityOptions & { nonce?: string },
): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  const nonce = securityOptions?.nonce;
  const hostedAuthScriptHashes =
    securityOptions?.allowHostedAuthInlineScriptHashes === true
      ? ` ${HOSTED_AUTH_INLINE_SCRIPT_HASHES.join(' ')}`
      : '';
  const scriptDirective = nonce
    ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${hostedAuthScriptHashes}`
    : "script-src 'none'";
  const styleDirective = nonce ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'none'";
  const formActionOrigins = normalizeFormActionOrigins(securityOptions?.formActionOrigins ?? []);
  const directives = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    scriptDirective,
    styleDirective,
    "connect-src 'self'",
    'frame-src https://challenges.cloudflare.com',
  ];
  if (securityOptions?.omitFormAction !== true) {
    directives.push(
      `form-action 'self'${formActionOrigins.length > 0 ? ` ${formActionOrigins.join(' ')}` : ''}`,
    );
  }
  headers.set('Content-Security-Policy', directives.join('; '));
}

export function normalizeFormActionOrigins(origins: string[]): string[] {
  const uniqueOrigins = new Set<string>();
  for (const candidate of origins) {
    const normalized = String(candidate ?? '').trim();
    if (!normalized || normalized === 'null') continue;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      const origin = parsed.origin;
      if (!origin || origin === 'null' || origin === 'file://') continue;
      uniqueOrigins.add(origin);
    } catch {
      continue;
    }
  }
  return [...uniqueOrigins];
}

type HeadersWithRawSetCookie = Headers & {
  raw?: () => Record<string, string[] | undefined>;
};

function getRawSetCookieValues(headers: Headers): string[] {
  const raw = (headers as HeadersWithRawSetCookie).raw;
  if (typeof raw !== 'function') {
    return [];
  }

  const values = raw.call(headers)['set-cookie'];
  return Array.isArray(values) ? values : [];
}

function looksLikeCombinedSetCookieHeader(value: string): boolean {
  return /,\s*[^;,\s=][^;,\s=]*=/.test(value);
}

function getSetCookieValues(source: HeadersInit, headers: Headers): string[] {
  if (Array.isArray(source)) {
    return source.filter(([key]) => key.toLowerCase() === 'set-cookie').map(([, value]) => value);
  }

  if (source instanceof Headers && typeof source.getSetCookie === 'function') {
    return source.getSetCookie();
  }

  if (source instanceof Headers) {
    const rawSetCookieValues = getRawSetCookieValues(source);
    if (rawSetCookieValues.length > 0) {
      return rawSetCookieValues;
    }
  }

  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const rawSetCookieValues = getRawSetCookieValues(headers);
  if (rawSetCookieValues.length > 0) {
    return rawSetCookieValues;
  }

  const setCookieValue = headers.get('set-cookie');
  if (setCookieValue !== null) {
    if (!looksLikeCombinedSetCookieHeader(setCookieValue)) {
      return [setCookieValue];
    }

    throw new Error(
      'Preserving multiple Set-Cookie headers from a Headers object requires a runtime with Headers.getSetCookie() or another raw Set-Cookie accessor.',
    );
  }

  return [];
}
