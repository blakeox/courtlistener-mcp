#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MCP_CORS_ALLOWED_HEADERS,
  MCP_CORS_ALLOWED_METHODS,
  MCP_CORS_EXPOSE_HEADERS,
  buildMcpCorsHeaders,
} from '../../src/server/transport-boundary-headers.js';

describe('transport boundary CORS headers', () => {
  it('returns standard MCP CORS headers', () => {
    const headers = buildMcpCorsHeaders(null, []);

    assert.equal(headers.get('Access-Control-Allow-Methods'), MCP_CORS_ALLOWED_METHODS);
    assert.equal(headers.get('Access-Control-Allow-Headers'), MCP_CORS_ALLOWED_HEADERS);
    assert.equal(headers.get('Access-Control-Expose-Headers'), MCP_CORS_EXPOSE_HEADERS);
    assert.equal(headers.get('Vary'), 'Origin');
  });

  it('sets allow-origin when origin is allow-listed', () => {
    const headers = buildMcpCorsHeaders('https://app.example', ['https://app.example']);

    assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://app.example');
  });

  it('does not set allow-origin when origin is not allow-listed', () => {
    const headers = buildMcpCorsHeaders('https://blocked.example', ['https://app.example']);

    assert.equal(headers.get('Access-Control-Allow-Origin'), null);
  });

  it('allows origin when wildcard allow-list is configured', () => {
    const headers = buildMcpCorsHeaders('https://any.example', ['*']);

    assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://any.example');
  });
});
