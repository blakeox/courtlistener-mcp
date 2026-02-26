#!/usr/bin/env node

// Simple wrapper to bridge a remote MCP server into a local stdio process
// so tools like Claude Desktop can "select a file" as the command to run.
//
// Usage (no args needed):
//   ./scripts/dev/mcp-remote.js
//
// Environment variables:
//   MCP_REMOTE_URL            Optional. Defaults to the deployed Worker /mcp endpoint.
//   MCP_REMOTE_BEARER_TOKEN  Optional bearer token for Authorization header.

import { spawn } from 'node:child_process';

const DEFAULT_URL = 'https://courtlistenermcp.blakeoxford.com/mcp';
const url = process.env.MCP_REMOTE_URL || DEFAULT_URL;

const bearerToken = process.env.MCP_REMOTE_BEARER_TOKEN?.trim();
const args = ['@modelcontextprotocol/inspector', 'mcp-remote', url];
if (bearerToken) {
  args.push('--header', `Authorization: Bearer ${bearerToken}`);
}

const child = spawn('npx', args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', code => {
  process.exit(code ?? 0);
});
