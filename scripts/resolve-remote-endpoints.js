#!/usr/bin/env node

/**
 * Normalize a remote server URL into canonical health and MCP SSE endpoints.
 *
 * Usage:
 *   node scripts/resolve-remote-endpoints.js <url>
 *
 * Output:
 *   REMOTE_BASE_URL=<base>
 *   REMOTE_HEALTH_URL=<health_url>
 *   REMOTE_MCP_URL=<mcp_streamable_http_url>
 */

import { pathToFileURL } from 'node:url';

const FALLBACK_BASE_URL = 'https://courtlistenermcp.blakeoxford.com';

export function normalizeRemoteEndpoints(input) {
  const raw = (input || '').trim();
  const withScheme = raw === '' ? FALLBACK_BASE_URL : raw;
  const candidate = /^(https?:)?\/\//i.test(withScheme) ? withScheme : `https://${withScheme}`;
  const url = new URL(candidate);

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  const pathLower = trimmedPath.toLowerCase();

  let basePath = trimmedPath;
  if (pathLower.endsWith('/health')) {
    basePath = trimmedPath.slice(0, -'/health'.length);
  }

  if (basePath.toLowerCase().endsWith('/mcp')) {
    basePath = basePath.slice(0, -'/mcp'.length);
  } else if (basePath.toLowerCase().endsWith('/sse')) {
    basePath = basePath.slice(0, -'/sse'.length);
  }

  const normalizedBasePath = basePath === '' ? '' : basePath;
  const originWithBase = `${url.origin}${normalizedBasePath}`;

  return {
    baseUrl: originWithBase,
    healthUrl: `${originWithBase}/health`,
    mcpUrl: `${originWithBase}/mcp`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const endpoints = normalizeRemoteEndpoints(process.argv[2]);
  process.stdout.write(`REMOTE_BASE_URL=${endpoints.baseUrl}\n`);
  process.stdout.write(`REMOTE_HEALTH_URL=${endpoints.healthUrl}\n`);
  process.stdout.write(`REMOTE_MCP_URL=${endpoints.mcpUrl}\n`);
}
