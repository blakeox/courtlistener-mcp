#!/usr/bin/env node

/**
 * Quick remote MCP handshake test.
 *
 * Environment variables:
 *   MCP_REMOTE_URL            Optional. Defaults to deployed /mcp endpoint.
 *   MCP_REMOTE_BEARER_TOKEN   Optional bearer token for Authorization header.
 */

const remoteUrl = process.env.MCP_REMOTE_URL || 'https://courtlistenermcp.blakeoxford.com/mcp';
const bearerToken = process.env.MCP_REMOTE_BEARER_TOKEN?.trim();

async function main() {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2024-11-05',
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const response = await fetch(remoteUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'courtlistener-mcp-quick-test', version: '1.0.0' },
      },
    }),
  });

  const body = await response.text();
  const ok = response.ok && body.includes('"result"') && body.includes('"jsonrpc"');

  if (!ok) {
    console.error(`Handshake failed: HTTP ${response.status}`);
    console.error(body.slice(0, 600));
    process.exit(1);
  }

  console.log(`Handshake succeeded: HTTP ${response.status}`);
  console.log(body.slice(0, 240));
}

main().catch((error) => {
  console.error('Handshake failed with exception:', error);
  process.exit(1);
});
