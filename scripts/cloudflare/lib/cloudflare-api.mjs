#!/usr/bin/env node

const API_BASE = 'https://api.cloudflare.com/client/v4';

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getCloudflareCredentials() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (apiToken) {
    return { apiToken };
  }
  throw new Error('Set CLOUDFLARE_API_TOKEN with Zone.WAF Edit and Zone.Zone Read permissions.');
}

export async function cloudflareRequest(path, { method = 'GET', body } = {}) {
  const { apiToken } = getCloudflareCredentials();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors)
      ? payload.errors.map((entry) => entry.message).join('; ')
      : response.statusText;
    throw new Error(`Cloudflare API ${method} ${path} failed: ${errors}`);
  }
  return payload.result;
}

export async function resolveZoneId({ zoneName, zoneId }) {
  if (zoneId?.trim()) {
    return zoneId.trim();
  }
  const name = zoneName?.trim();
  if (!name) {
    throw new Error('Provide CLOUDFLARE_ZONE_ID or CLOUDFLARE_ZONE_NAME.');
  }
  const zones = await cloudflareRequest(`/zones?name=${encodeURIComponent(name)}&status=active`);
  const match = zones?.find?.((zone) => zone.name === name) ?? zones?.[0];
  if (!match?.id) {
    throw new Error(`No active Cloudflare zone found for name: ${name}`);
  }
  return match.id;
}
