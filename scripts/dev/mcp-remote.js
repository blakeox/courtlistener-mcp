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

const child = spawn(
  'npx',
  ['@modelcontextprotocol/inspector', 'mcp-remote', url],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', code => {
  process.exit(code ?? 0);
});
