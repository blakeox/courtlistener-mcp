import type { TelemetryEvent } from './types';

const EVENT_KEY = 'clmcp_telemetry_events';
const FIRST_RUN_KEY = 'clmcp_signup_started_at';

function loadEvents(): TelemetryEvent[] {
  const raw = localStorage.getItem(EVENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: TelemetryEvent[]): void {
  localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(-200)));
}

export function trackEvent(name: string, meta?: Record<string, string | number | boolean | null>): void {
  const event: TelemetryEvent = { name, at: new Date().toISOString(), meta };
  const events = loadEvents();
  events.push(event);
  saveEvents(events);
  console.info('[ui-telemetry]', event);
}

export function markSignupStarted(): void {
  localStorage.setItem(FIRST_RUN_KEY, String(Date.now()));
}

export function markFirstMcpSuccess(): number | null {
  const startedRaw = localStorage.getItem(FIRST_RUN_KEY);
  if (!startedRaw) return null;
  const started = Number.parseInt(startedRaw, 10);
  if (!Number.isFinite(started) || started <= 0) return null;
  const durationMs = Date.now() - started;
  trackEvent('first_mcp_call_succeeded', { duration_ms: durationMs });
  return durationMs;
}
