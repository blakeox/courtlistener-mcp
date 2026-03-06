import { buildMcpCorsHeaders } from './transport-boundary-headers.js';

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

export function htmlResponse(html: string, nonce: string, extraHeaders?: HeadersInit): Response {
  const headers = createSecureResponseHeaders(
    {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    extraHeaders,
    nonce,
  );
  return new Response(html, {
    status: 200,
    headers,
  });
}

export function redirectResponse(location: string, status = 302, extraHeaders?: HeadersInit): Response {
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

export function withCors(response: Response, origin: string | null, allowedOrigins: string[]): Response {
  const headers = new Headers(response.headers);
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
  const source = new Headers(extraHeaders);
  for (const [key, value] of source.entries()) {
    headers.append(key, value);
  }
}

function createSecureResponseHeaders(baseHeaders: HeadersInit, extraHeaders?: HeadersInit, nonce?: string): Headers {
  const headers = new Headers(baseHeaders);
  appendHeaders(headers, extraHeaders);
  applySecurityHeaders(headers, nonce);
  return headers;
}

function applySecurityHeaders(headers: Headers, nonce?: string): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  const scriptDirective = nonce
    ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`
    : "script-src 'none'";
  const styleDirective = nonce ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'none'";
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      scriptDirective,
      styleDirective,
      "connect-src 'self'",
      "frame-src https://challenges.cloudflare.com",
      "form-action 'self'",
    ].join('; '),
  );
}
