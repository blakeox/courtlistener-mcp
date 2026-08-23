import { redactSecretsInText } from '../infrastructure/secret-redaction.js';

const MAX_FIELD_LENGTH = 128;

const ALLOWED_FIELDS = new Set([
  'environment',
  'worker_role',
  'worker_name',
  'version_id',
  'source_sha',
  'release_id',
  'request_id',
  'cf_ray',
  'route',
  'transport',
  'protocol_version',
  'client_category',
  'outcome',
  'status',
  'duration_ms',
  'auth_mode',
  'do_dimension',
  'do_operation',
  'queue_job_id',
  'queue_state',
  'attempt',
  'tool',
  'upstream',
  'error_class',
  'binding_target',
  'dependency_outcome',
  'cpu_class',
]);

export interface WorkerOperationalTelemetryInput {
  event: string;
  [key: string]: unknown;
}

export type WorkerOperationalTelemetryEvent = {
  schema_version: 'v1';
  timestamp: string;
  event: string;
  [key: string]: string | number | boolean;
};

function sanitizeString(value: string): string {
  return redactSecretsInText(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

export function buildWorkerOperationalTelemetryEvent(
  input: WorkerOperationalTelemetryInput,
  now = new Date(),
): WorkerOperationalTelemetryEvent {
  const event: WorkerOperationalTelemetryEvent = {
    schema_version: 'v1',
    timestamp: now.toISOString(),
    event: sanitizeString(input.event) || 'unknown',
  };

  for (const [key, value] of Object.entries(input)) {
    if (key === 'event' || !ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      const sanitized = sanitizeString(value);
      if (sanitized) event[key] = sanitized;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      event[key] = value;
      continue;
    }
    if (typeof value === 'boolean') event[key] = value;
  }

  return event;
}
