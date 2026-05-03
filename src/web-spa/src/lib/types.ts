export interface AuthSessionResponse {
  authenticated: boolean;
  user: { id: string } | null;
  turnstile_site_key?: string;
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

export interface UsageSnapshotResponse {
  userId: string;
  totalRequests: number;
  dailyRequests: number;
  currentDay: string;
  lastSeenAt: string | null;
  byRoute: Record<string, number>;
}
