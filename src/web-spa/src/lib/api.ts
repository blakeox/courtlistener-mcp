import { z } from 'zod';
import type {
  ApiError,
  ApiKeyCreateResponse,
  ApiKeysListResponse,
  AuthSessionResponse,
  LoginResponse,
  PasswordResetResponse,
  SignupResponse,
} from './types';

const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string(),
    })
    .nullable(),
  turnstile_site_key: z.string().optional(),
});

const keysSchema = z.object({
  user_id: z.string(),
  keys: z.array(
    z.object({
      id: z.string(),
      label: z.string().default(''),
      is_active: z.boolean(),
      revoked_at: z.string().nullable().optional().default(null),
      expires_at: z.string().nullable().optional().default(null),
      created_at: z.string(),
    }),
  ),
});

const keyCreateSchema = z.object({
  message: z.string().optional(),
  api_key: z
    .object({
      id: z.string(),
      label: z.string(),
      created_at: z.string(),
      expires_at: z.string().nullable(),
      token: z.string(),
    })
    .optional(),
});

const aiChatSchema = z.object({
  test_mode: z.boolean(),
  fallback_used: z.boolean(),
  mode: z.enum(['cheap', 'balanced']),
  tool: z.string(),
  tool_reason: z.string().optional(),
  session_id: z.string(),
  ai_response: z.string(),
  mcp_result: z.unknown(),
});

function readCookie(name: string): string {
  const key = `${name}=`;
  const entry = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(key));
  return entry ? decodeURIComponent(entry.slice(key.length)) : '';
}

async function parseBody<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const csrf = readCookie('clmcp_csrf');
  const method = (init.method ?? 'GET').toUpperCase();
  if (csrf && method !== 'GET') {
    headers.set('x-csrf-token', csrf);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw { status: 0, error: 'timeout', message: 'Request timed out' } satisfies ApiError;
    }
    throw err;
  }
  clearTimeout(timer);

  const body = await parseBody<Record<string, unknown>>(response);
  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : undefined,
      message: typeof body?.message === 'string' ? body.message : undefined,
      error_code: typeof body?.error_code === 'string' ? body.error_code : undefined,
      retry_after_seconds:
        typeof body?.retry_after_seconds === 'number'
          ? body.retry_after_seconds
          : Number.parseInt(response.headers.get('Retry-After') || '', 10) || undefined,
    };
    throw error;
  }

  return (body ?? {}) as T;
}

function withAuth(headers: HeadersInit, token?: string): HeadersInit {
  if (!token?.trim()) return headers;
  return {
    ...headers,
    authorization: `Bearer ${token.trim()}`,
  };
}

export async function getSession(): Promise<AuthSessionResponse> {
  const payload = await request<unknown>('/api/session');
  return sessionSchema.parse(payload);
}

export async function signup(payload: {
  email: string;
  password: string;
  fullName?: string;
  turnstileToken?: string;
}): Promise<SignupResponse> {
  return request<SignupResponse>('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function login(payload: { email: string; password: string }): Promise<LoginResponse> {
  return request<LoginResponse>('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function loginByAccessToken(accessToken: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/login/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
}

export async function logout(): Promise<void> {
  await request('/api/logout', { method: 'POST' });
}

export async function requestPasswordReset(payload: { email: string }): Promise<PasswordResetResponse> {
  return request<PasswordResetResponse>('/api/password/forgot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function resetPassword(payload: {
  accessToken?: string;
  tokenHash?: string;
  password: string;
}): Promise<PasswordResetResponse> {
  return request<PasswordResetResponse>('/api/password/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listKeys(token?: string): Promise<ApiKeysListResponse> {
  const payload = await request<unknown>('/api/keys', {
    headers: withAuth({}, token),
  });
  return keysSchema.parse(payload);
}

export async function createKey(
  args: { label: string; expiresDays: number },
  token?: string,
): Promise<ApiKeyCreateResponse> {
  const payload = await request<unknown>('/api/keys', {
    method: 'POST',
    headers: withAuth({ 'content-type': 'application/json' }, token),
    body: JSON.stringify(args),
  });
  return keyCreateSchema.parse(payload);
}

export async function revokeKey(keyId: string, token?: string): Promise<void> {
  await request('/api/keys/revoke', {
    method: 'POST',
    headers: withAuth({ 'content-type': 'application/json' }, token),
    body: JSON.stringify({ keyId }),
  });
}

export async function mcpCall<T>(
  args: {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
    id: number;
  },
  token: string,
): Promise<{ body: T; sessionId: string | null }> {
  if (!token.trim()) {
    throw {
      status: 401,
      error: 'missing_token',
      message: 'Missing bearer token.',
    } satisfies ApiError;
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
  });
  if (args.sessionId) {
    headers.set('mcp-session-id', args.sessionId);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch('/mcp', {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: args.id,
        method: args.method,
        params: args.params,
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw { status: 0, error: 'timeout', message: 'Request timed out' } satisfies ApiError;
    }
    throw err;
  }
  clearTimeout(timer);

  const raw = await response.text();
  if (!response.ok) {
    throw {
      status: response.status,
      error: 'mcp_call_failed',
      message: raw.slice(0, 1000),
    } satisfies ApiError;
  }

  const trimmed = raw.trim();
  let body: unknown = {};
  if (trimmed.startsWith('{')) {
    body = JSON.parse(trimmed);
  } else {
    const dataLines = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (dataLines.length > 0) {
      body = JSON.parse(dataLines[dataLines.length - 1]);
    }
  }

  if (body && typeof body === 'object' && 'error' in body) {
    const errBody = body as { error?: { message?: string; code?: number } };
    throw {
      status: 0,
      error: 'mcp_error',
      message: typeof errBody.error?.message === 'string' ? errBody.error.message : 'MCP returned an error',
    } satisfies ApiError;
  }

  return {
    body: body as T,
    sessionId: response.headers.get('mcp-session-id'),
  };
}

export async function aiChat(args: {
  message: string;
  mcpToken?: string;
  mcpSessionId?: string;
  toolName?: string;
  mode?: 'cheap' | 'balanced';
  testMode?: boolean;
  history?: Array<{ role: string; content: string }>;
}): Promise<z.infer<typeof aiChatSchema>> {
  const payload = await request<unknown>('/api/ai-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return aiChatSchema.parse(payload);
}

const aiPlainSchema = z.object({
  ai_response: z.string(),
  mode: z.enum(['cheap', 'balanced']),
});

export async function aiPlain(args: {
  message: string;
  mode?: 'cheap' | 'balanced';
  history?: Array<{ role: string; content: string }>;
}): Promise<z.infer<typeof aiPlainSchema>> {
  const payload = await request<unknown>('/api/ai-plain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  return aiPlainSchema.parse(payload);
}

export function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  const candidate = error as ApiError;
  if (candidate.retry_after_seconds && Number.isFinite(candidate.retry_after_seconds)) {
    const seconds = Math.max(1, Math.floor(candidate.retry_after_seconds));
    const baseMessage = candidate.message || candidate.error || 'Rate limited';
    return `${baseMessage} Retry in ${seconds}s.`;
  }
  if (candidate.message) return candidate.message;
  if (candidate.error) return candidate.error;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}
