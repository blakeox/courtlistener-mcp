export interface AuthSessionResponse {
  authenticated: boolean;
  user: { id: string } | null;
  turnstile_site_key?: string;
}

export interface SignupResponse {
  message?: string;
  error?: string;
  error_code?: string;
}

export interface LoginResponse {
  message?: string;
  user?: {
    id: string;
    email: string | null;
  };
  error?: string;
  error_code?: string;
}

export interface PasswordResetResponse {
  message?: string;
  error?: string;
  error_code?: string;
  autoLogin?: boolean;
  user?: { id: string; email: string | null };
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  is_active: boolean;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApiKeysListResponse {
  user_id: string;
  keys: ApiKeyRecord[];
}

export interface ApiKeyCreateResponse {
  message?: string;
  api_key?: {
    id: string;
    label: string;
    created_at: string;
    expires_at: string | null;
    token: string;
  };
}

export interface ApiError {
  status: number;
  error?: string;
  message?: string;
  error_code?: string;
  retry_after_seconds?: number;
}

export interface TelemetryEvent {
  name: string;
  at: string;
  meta?: Record<string, string | number | boolean | null>;
}
