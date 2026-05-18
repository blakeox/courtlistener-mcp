import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  buildProbeSkipRule,
  ensureProbeSkipRule,
} from '../../scripts/cloudflare/ensure-waf-probe-access.mjs';

const originalFetch = globalThis.fetch;
const originalApiToken = process.env.CLOUDFLARE_API_TOKEN;

function jsonResponse(result) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cloudflare waf probe rule', () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.CLOUDFLARE_API_TOKEN = originalApiToken;
  });

  it('builds a skip rule for the hosted OAuth monitor user-agent', () => {
    const rule = buildProbeSkipRule({ hostname: 'courtlistenermcp.example.com' });
    assert.equal(rule.ref, 'allow_oauth_probe_monitoring');
    assert.equal(rule.action, 'skip');
    assert.match(rule.expression, /courtlistenermcp\.example\.com/);
    assert.match(rule.expression, /courtlistener-mcp-oauth-probe/);
    assert.deepEqual(rule.action_parameters.phases, ['http_request_sbfm', 'http_ratelimit']);
    assert.ok(rule.action_parameters.products.includes('bic'));
  });

  it('does not update Cloudflare when the probe rule already matches', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, method: init.method ?? 'GET' });

      if (url.includes('/rulesets/phases/http_request_firewall_custom/entrypoint')) {
        return jsonResponse({
          id: 'ruleset-1',
          rules: [
            {
              id: 'rule-1',
              ref: 'allow_oauth_probe_monitoring',
              description: 'Allow hosted OAuth CI/probe traffic',
              expression:
                '(http.host eq "courtlistenermcp.example.com" and http.user_agent contains "courtlistener-mcp-oauth-probe")',
              action: 'skip',
              enabled: true,
              action_parameters: {
                products: ['securityLevel', 'uaBlock', 'bic'],
                phases: ['http_ratelimit', 'http_request_sbfm'],
              },
              logging: { enabled: true },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await ensureProbeSkipRule({
      zoneId: 'zone-1',
      hostname: 'courtlistenermcp.example.com',
    });

    assert.equal(result.changed, false);
    assert.deepEqual(calls, [
      {
        url: 'https://api.cloudflare.com/client/v4/zones/zone-1/rulesets/phases/http_request_firewall_custom/entrypoint',
        method: 'GET',
      },
    ]);
  });

  it('creates the probe rule when it does not exist', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      if (url.includes('/rulesets/phases/http_request_firewall_custom/entrypoint')) {
        return jsonResponse({ id: 'ruleset-1', rules: [] });
      }
      if (url.endsWith('/rulesets/ruleset-1/rules')) {
        return jsonResponse({
          rules: [{ id: 'rule-1', ref: 'allow_oauth_probe_monitoring' }],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await ensureProbeSkipRule({
      zoneId: 'zone-1',
      hostname: 'courtlistenermcp.example.com',
    });

    assert.equal(result.changed, true);
    assert.equal(result.ruleId, 'rule-1');
    assert.equal(calls[1].method, 'POST');
    assert.deepEqual(calls[1].body, {
      rules: [buildProbeSkipRule({ hostname: 'courtlistenermcp.example.com' })],
    });
  });

  it('patches only the probe rule when its definition changes', async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      if (url.includes('/rulesets/phases/http_request_firewall_custom/entrypoint')) {
        return jsonResponse({
          id: 'ruleset-1',
          rules: [
            {
              id: 'rule-1',
              ref: 'allow_oauth_probe_monitoring',
              description: 'Old description',
              expression:
                '(http.host eq "courtlistenermcp.example.com" and http.user_agent contains "courtlistener-mcp-oauth-probe")',
              action: 'skip',
              enabled: true,
              action_parameters: {
                phases: ['http_request_sbfm'],
                products: ['bic'],
              },
              logging: { enabled: true },
            },
            {
              id: 'rule-2',
              ref: 'leave_other_rules_alone',
            },
          ],
        });
      }
      if (url.endsWith('/rulesets/ruleset-1/rules/rule-1')) {
        return jsonResponse({
          id: 'rule-1',
          ref: 'allow_oauth_probe_monitoring',
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const result = await ensureProbeSkipRule({
      zoneId: 'zone-1',
      hostname: 'courtlistenermcp.example.com',
    });

    assert.equal(result.changed, true);
    assert.equal(result.ruleId, 'rule-1');
    assert.equal(calls[1].method, 'PATCH');
    assert.equal(
      calls[1].url,
      'https://api.cloudflare.com/client/v4/zones/zone-1/rulesets/ruleset-1/rules/rule-1',
    );
    assert.deepEqual(
      calls[1].body,
      buildProbeSkipRule({ hostname: 'courtlistenermcp.example.com' }),
    );
    assert.equal(calls.length, 2);
  });
});
