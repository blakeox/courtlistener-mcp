#!/usr/bin/env node

const baseUrl = process.env.LOCAL_HEALTH_URL ?? 'http://127.0.0.1:8787';
const timeoutMs = Number.parseInt(process.env.LOCAL_HEALTH_TIMEOUT_MS ?? '5000', 10);

let healthUrl;
try {
  healthUrl = new URL('/health', baseUrl);
} catch {
  console.error('LOCAL_HEALTH_URL must be a valid absolute HTTP(S) URL.');
  process.exit(2);
}

if (healthUrl.protocol !== 'http:' && healthUrl.protocol !== 'https:') {
  console.error('LOCAL_HEALTH_URL must use the HTTP or HTTPS protocol.');
  process.exit(2);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('LOCAL_HEALTH_TIMEOUT_MS must be a positive integer.');
  process.exit(2);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(healthUrl, {
    signal: controller.signal,
    headers: { accept: 'application/json' },
  });
  const body = await response.text();

  if (!response.ok) {
    console.error(`Health check failed: ${response.status} ${response.statusText}`);
    if (body) console.error(body.slice(0, 1000));
    process.exit(1);
  }

  console.log(`Health check passed: ${healthUrl} (${response.status})`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Health check could not reach ${healthUrl}: ${message}`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
