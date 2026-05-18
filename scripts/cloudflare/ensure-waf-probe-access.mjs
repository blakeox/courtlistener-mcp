#!/usr/bin/env node

/**
 * Idempotently allow the hosted OAuth monitoring probes through Cloudflare edge
 * security without weakening protections for normal browser traffic.
 *
 * Requires CLOUDFLARE_API_TOKEN with Zone.Zone Read + Zone.WAF Edit.
 */

import { pathToFileURL } from 'node:url';
import { cloudflareRequest, resolveZoneId } from './lib/cloudflare-api.mjs';

const DEFAULT_ZONE_NAME = 'blakeoxford.com';
const DEFAULT_HOSTNAME = 'courtlistenermcp.blakeoxford.com';
const PROBE_RULE_REF = 'allow_oauth_probe_monitoring';
const CUSTOM_FIREWALL_PHASE = 'http_request_firewall_custom';

export function buildProbeSkipRule({
  hostname = DEFAULT_HOSTNAME,
  description = 'Allow hosted OAuth CI/probe traffic',
} = {}) {
  return {
    ref: PROBE_RULE_REF,
    description,
    expression: `(http.host eq "${hostname}" and http.user_agent contains "courtlistener-mcp-oauth-probe")`,
    action: 'skip',
    enabled: true,
    action_parameters: {
      phases: ['http_request_sbfm', 'http_ratelimit'],
      products: ['bic', 'uaBlock', 'securityLevel'],
    },
    logging: {
      enabled: true,
    },
  };
}

export async function fetchCustomFirewallEntrypoint(zoneId) {
  return cloudflareRequest(`/zones/${zoneId}/rulesets/phases/${CUSTOM_FIREWALL_PHASE}/entrypoint`);
}

export async function ensureProbeSkipRule(options = {}) {
  const zoneId = await resolveZoneId({
    zoneName: options.zoneName ?? process.env.CLOUDFLARE_ZONE_NAME ?? DEFAULT_ZONE_NAME,
    zoneId: options.zoneId ?? process.env.CLOUDFLARE_ZONE_ID,
  });

  const hostname = options.hostname ?? process.env.CLOUDFLARE_MCP_HOSTNAME ?? DEFAULT_HOSTNAME;
  const entrypoint = await fetchCustomFirewallEntrypoint(zoneId);
  if (!entrypoint?.id) {
    throw new Error(`Missing ${CUSTOM_FIREWALL_PHASE} entrypoint ruleset for zone ${zoneId}.`);
  }

  const desiredRule = buildProbeSkipRule({ hostname });
  const rules = Array.isArray(entrypoint.rules) ? [...entrypoint.rules] : [];
  const existing = rules.find((rule) => rule.ref === PROBE_RULE_REF) ?? null;

  if (existing && rulesEquivalent(existing, desiredRule)) {
    return {
      changed: false,
      zoneId,
      rulesetId: entrypoint.id,
      hostname,
      ruleRef: PROBE_RULE_REF,
    };
  }

  const updatedRule = existing?.id
    ? await updateProbeRule(zoneId, entrypoint.id, existing.id, desiredRule)
    : await createProbeRule(zoneId, entrypoint.id, desiredRule);

  return {
    changed: true,
    zoneId,
    rulesetId: entrypoint.id,
    hostname,
    ruleRef: updatedRule.ref ?? PROBE_RULE_REF,
    ruleId: updatedRule.id ?? existing?.id ?? null,
  };
}

function rulesEquivalent(existing, desired) {
  return JSON.stringify(canonicalizeRule(existing)) === JSON.stringify(canonicalizeRule(desired));
}

function canonicalizeRule(rule) {
  return {
    ref: rule?.ref ?? null,
    description: rule?.description ?? '',
    expression: rule?.expression ?? '',
    action: rule?.action ?? '',
    enabled: rule?.enabled !== false,
    loggingEnabled: rule?.logging?.enabled !== false,
    phases: canonicalizeList(rule?.action_parameters?.phases),
    products: canonicalizeList(rule?.action_parameters?.products),
  };
}

function canonicalizeList(values) {
  return Array.isArray(values) ? [...values].map(String).sort() : [];
}

async function createProbeRule(zoneId, rulesetId, rule) {
  const result = await cloudflareRequest(`/zones/${zoneId}/rulesets/${rulesetId}/rules`, {
    method: 'POST',
    body: { rules: [rule] },
  });
  return unwrapRuleResult(result, PROBE_RULE_REF);
}

async function updateProbeRule(zoneId, rulesetId, ruleId, rule) {
  const result = await cloudflareRequest(`/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, {
    method: 'PATCH',
    body: rule,
  });
  return unwrapRuleResult(result, PROBE_RULE_REF);
}

function unwrapRuleResult(result, fallbackRef) {
  if (Array.isArray(result)) {
    return result[0] ?? { ref: fallbackRef };
  }
  if (result && Array.isArray(result.rules)) {
    return (
      result.rules.find((rule) => rule.ref === fallbackRef) ??
      result.rules[0] ?? { ref: fallbackRef }
    );
  }
  return result ?? { ref: fallbackRef };
}

async function main() {
  const result = await ensureProbeSkipRule();
  console.log(
    JSON.stringify(
      {
        ok: true,
        changed: result.changed,
        zoneId: result.zoneId,
        rulesetId: result.rulesetId,
        hostname: result.hostname,
        ruleRef: result.ruleRef,
        message: result.changed
          ? 'Installed or updated OAuth probe skip rule.'
          : 'OAuth probe skip rule already present.',
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
