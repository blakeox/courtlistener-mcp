import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { authorizeMcpGatewayRequest } from '../../src/server/mcp-gateway-auth.js';
import {
  runAuthFailureContract,
  runProtocolHeaderNegotiationContract,
} from '../utils/mcp-contract-harness.js';

const SUPPORTED = new Set(['2025-03-26']);

describe('authorizeMcpGatewayRequest', () => {
  it('returns auth error without running protocol validation', async () => {
    await runAuthFailureContract(
      [
        { name: 'invalid token', expectedStatus: 401, expectedError: 'invalid_token' },
        { name: 'insufficient scope', expectedStatus: 403, expectedError: 'insufficient_scope' },
      ],
      async (fixture) => {
        let validateCalled = false;
        const result = await authorizeMcpGatewayRequest({
          request: new Request('https://example.com/mcp', { method: 'POST' }),
          env: {},
          supportedProtocolVersions: SUPPORTED,
          deps: {
            authorizeMcpRequestWithPrincipalFn: async () => ({
              authError: Response.json(
                { error: fixture.expectedError, message: `${fixture.name} auth failure` },
                { status: fixture.expectedStatus },
              ),
            }),
            validateProtocolVersionHeaderFn: () => {
              validateCalled = true;
              return null;
            },
          },
        });
        assert.equal(validateCalled, false);
        return result.authError;
      },
    );
  });

  it('applies protocol negotiation contract for POST requests', async () => {
    await runProtocolHeaderNegotiationContract(
      { supportedVersion: '2025-03-26' },
      async (fixture) => {
        const headers = new Headers();
        if (fixture.headerValue) {
          headers.set('MCP-Protocol-Version', fixture.headerValue);
        }

        const result = await authorizeMcpGatewayRequest({
          request: new Request('https://example.com/mcp', { method: 'POST', headers }),
          env: { MCP_REQUIRE_PROTOCOL_VERSION: fixture.required ? 'true' : 'false' },
          supportedProtocolVersions: SUPPORTED,
          deps: {
            authorizeMcpRequestWithPrincipalFn: async () => ({
              authError: null,
              principal: { authMethod: 'static' },
            }),
          },
        });

        return result.authError;
      },
    );
  });

  it('skips protocol validation for GET requests', async () => {
    const result = await authorizeMcpGatewayRequest({
      request: new Request('https://example.com/mcp', { method: 'GET' }),
      env: { MCP_REQUIRE_PROTOCOL_VERSION: 'true' },
      supportedProtocolVersions: SUPPORTED,
      deps: {
        authorizeMcpRequestWithPrincipalFn: async () => ({
          authError: null,
          principal: { authMethod: 'static' },
        }),
      },
    });

    assert.equal(result.authError, null);
    assert.deepEqual(result.principal, { authMethod: 'static' });
  });
});
