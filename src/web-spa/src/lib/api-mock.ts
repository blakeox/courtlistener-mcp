/**
 * Mock API layer — in-memory fakes for UI development without a backend.
 * Activate via `?mock=true` query param.
 */
import type {
  ApiKeyCreateResponse,
  ApiKeyRecord,
  ApiKeysListResponse,
  AuthSessionResponse,
  LoginResponse,
  PasswordResetResponse,
  SignupResponse,
} from './types';

let mockAuthenticated = false;
const mockUserId = 'mock-user-001';
let nextKeyNum = 1;

const mockKeys: Array<ApiKeyRecord & { token?: string }> = [];

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));
}

export async function getSession(): Promise<AuthSessionResponse> {
  await delay(100);
  return {
    authenticated: mockAuthenticated,
    user: mockAuthenticated ? { id: mockUserId } : null,
    turnstile_site_key: '',
  };
}

export async function signup(_payload: {
  email: string;
  password: string;
  fullName?: string;
  turnstileToken?: string;
}): Promise<SignupResponse> {
  await delay();
  return { message: 'Mock: Check your email for verification (simulated).' };
}

export async function login(_payload: { email: string; password: string }): Promise<LoginResponse> {
  await delay();
  mockAuthenticated = true;
  return { message: 'Mock: Logged in successfully.' };
}

export async function loginByAccessToken(_accessToken: string): Promise<LoginResponse> {
  await delay();
  mockAuthenticated = true;
  return { message: 'Mock: Token login successful.' };
}

export async function logout(): Promise<void> {
  await delay(100);
  mockAuthenticated = false;
}

export async function requestPasswordReset(
  _payload: { email: string },
): Promise<PasswordResetResponse> {
  await delay();
  return { message: 'Mock: Password reset email sent (simulated).' };
}

export async function resetPassword(_payload: {
  accessToken?: string;
  tokenHash?: string;
  password: string;
}): Promise<PasswordResetResponse> {
  await delay();
  return { message: 'Mock: Password updated successfully.' };
}

export async function listKeys(_token?: string): Promise<ApiKeysListResponse> {
  await delay();
  return {
    user_id: mockUserId,
    keys: mockKeys.map(({ token: _t, ...rest }) => rest),
  };
}

export async function createKey(
  args: { label: string; expiresDays: number },
  _token?: string,
): Promise<ApiKeyCreateResponse> {
  await delay();
  const id = `mock-key-${String(nextKeyNum++).padStart(3, '0')}`;
  const token = `clmcp_mock_${id}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + args.expiresDays * 86400000).toISOString();
  const record: ApiKeyRecord & { token?: string } = {
    id,
    label: args.label,
    is_active: true,
    revoked_at: null,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    token,
  };
  mockKeys.push(record);
  return {
    message: 'Mock: Key created.',
    api_key: {
      id,
      label: args.label,
      created_at: record.created_at,
      expires_at: expiresAt,
      token,
    },
  };
}

export async function revokeKey(keyId: string, _token?: string): Promise<void> {
  await delay();
  const key = mockKeys.find((k) => k.id === keyId);
  if (key) {
    key.is_active = false;
    key.revoked_at = new Date().toISOString();
  }
}

export async function mcpCall<T>(
  _args: {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
    id: number;
  },
  _token: string,
): Promise<{ body: T; sessionId: string | null }> {
  await delay(500);
  const mockResponse = {
    jsonrpc: '2.0',
    result: {
      content: [
        {
          type: 'text',
          text: 'Mock MCP response: This is a simulated tool call result for UI development.',
        },
      ],
    },
  };
  return {
    body: mockResponse as T,
    sessionId: `mock-session-${Date.now()}`,
  };
}

export async function aiChat(_args: {
  message: string;
  mcpToken: string;
  mcpSessionId?: string;
  toolName?: 'auto' | 'search_cases' | 'search_opinions' | 'lookup_citation';
  mode?: 'cheap' | 'balanced';
  testMode?: boolean;
}): Promise<{
  test_mode: boolean;
  fallback_used: boolean;
  mode: 'cheap' | 'balanced';
  tool: string;
  session_id: string;
  ai_response: string;
  mcp_result: unknown;
}> {
  await delay(800);
  return {
    test_mode: true,
    fallback_used: false,
    mode: 'cheap',
    tool: 'search_cases',
    session_id: `mock-session-${Date.now()}`,
    ai_response:
      'Mock AI response: This is a simulated AI chat result for UI development. The search found several relevant cases discussing the topic.',
    mcp_result: { content: [{ type: 'text', text: 'Mock MCP result data' }] },
  };
}

export function toErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  const candidate = error as { message?: string; error?: string };
  if (candidate.message) return candidate.message;
  if (candidate.error) return candidate.error;
  return 'Unknown error';
}

/** Check if mock mode is enabled */
export function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('mock');
}
