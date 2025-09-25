#!/usr/bin/env node

// Simple wrapper to bridge a remote SSE MCP server into a local stdio process
// so tools like Claude Desktop can "select a file" as the command to run.
//
// Usage (no args needed):
//   ./scripts/dev/mcp-remote.js
//
// Environment variables:
//   MCP_REMOTE_URL  Optional. Defaults to your deployed Worker SSE endpoint.

import { spawn } from 'node:child_process';

const DEFAULT_URL = 'https://courtlistener-mcp.blakeoxford.workers.dev/sse';
const url = process.env.MCP_REMOTE_URL || DEFAULT_URL;

// If a token is provided, append it to the URL as access_token to avoid requiring custom headers
const token = process.env.MCP_SSE_TOKEN;
const urlWithToken = token ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : url;

const child = spawn('npx', ['@modelcontextprotocol/inspector', 'mcp-remote', urlWithToken], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', code => {
  process.exit(code ?? 0);
});
