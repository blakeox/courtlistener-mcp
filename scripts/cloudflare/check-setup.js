#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCloudflareAccessLoginRedirect } from './url-helpers.js';
import { cloudflareRequest } from './lib/cloudflare-api.mjs';
import {
  WRANGLER_EDGE_CONFIG,
  WRANGLER_MCP_CONFIG,
  formatSecretPutCommand,
  listWranglerSecrets,
  runWrangler,
} from './lib/wrangler-secrets.mjs';

const projectRoot = process.cwd();
const wranglerEdgeConfigPath = join(projectRoot, WRANGLER_EDGE_CONFIG);
const wranglerMcpConfigPath = join(projectRoot, WRANGLER_MCP_CONFIG);
const wranglerEdgeConfig = WRANGLER_EDGE_CONFIG;
const wranglerMcpConfig = WRANGLER_MCP_CONFIG;

const requiredMcpSecrets = ['COURTLISTENER_API_KEY'];

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function ok(msg) {
  console.log(`${color('✔', '32')} ${msg}`);
}

function warn(msg) {
  console.log(`${color('▲', '33')} ${msg}`);
}

function fail(msg) {
  console.log(`${color('✖', '31')} ${msg}`);
}

function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

function parseWranglerConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Missing wrangler config at ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf-8');
  const cleaned = stripJsonComments(raw);
  return JSON.parse(cleaned);
}

function deriveBaseUrl(config) {
  if (Array.isArray(config.routes) && config.routes.length > 0) {
    const route = config.routes.find((r) => typeof r?.pattern === 'string');
    if (route?.pattern) return `https://${route.pattern}`;
  }
  if (config.workers_dev && typeof config.name === 'string' && config.name.length > 0) {
    return `https://${config.name}.workers.dev`;
  }
  return null;
}

function parseBoolean(rawValue) {
  if (!rawValue) return false;
  const normalized = rawValue.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function hasConfiguredValue(record, key) {
  return typeof record?.[key] === 'string' && record[key].trim().length > 0;
}

function parseConfiguredRoutes(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateRuntimeHealthCorePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'health payload is not a JSON object' };
  }

  const { status, service, timestamp, version, runtime } = payload;
  if (!['ok', 'degraded', 'unhealthy'].includes(status)) {
    return { ok: false, reason: `unexpected health status: ${String(status)}` };
  }
  if (service !== 'courtlistener-mcp') {
    return { ok: false, reason: `unexpected health service: ${String(service)}` };
  }
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    return { ok: false, reason: 'health timestamp is missing or invalid' };
  }
  if (typeof version !== 'string' || version.trim().length === 0) {
    return { ok: false, reason: 'health version is missing' };
  }
  if (runtime !== 'cloudflare-worker') {
    return { ok: false, reason: `unexpected health runtime: ${String(runtime)}` };
  }

  if (typeof payload.transport !== 'string' || payload.transport.trim().length === 0) {
    return { ok: false, reason: 'health payload missing transport' };
  }

  const diagnostics = payload.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return { ok: false, reason: 'health payload missing diagnostics object' };
  }

  for (const key of ['cloudflare', 'metrics']) {
    if (!diagnostics[key] || typeof diagnostics[key] !== 'object') {
      return { ok: false, reason: `diagnostics.${key} is missing` };
    }
  }

  return { ok: true };
}

async function checkEndpoint(baseUrl, path, init = {}) {
  try {
    const res = await fetch(`${baseUrl}${path}`, init);
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      body: text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      headers: new Headers(),
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkMcpDiscover(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });

    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const hasResultJson = parsed && typeof parsed === 'object' && parsed.result;
    const hasResultSse = text.includes('"result"') && text.includes('"jsonrpc"');
    return {
      ok: res.ok && (Boolean(hasResultJson) || hasResultSse),
      authProtected: [401, 403, 429].includes(res.status),
      status: res.status,
      body: text,
    };
  } catch (error) {
    return {
      ok: false,
      authProtected: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log('\nCloudflare Setup Check\n');

  let hasCriticalError = false;

  const version = runWrangler(projectRoot, ['--version']);
  if (version.status !== 0) {
    fail('Wrangler CLI is not available.');
    hasCriticalError = true;
  } else {
    ok(`Wrangler detected: ${version.stdout}`);
  }

  const configuredAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const configuredApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (configuredAccountId && configuredApiToken) {
    try {
      await cloudflareRequest(`/accounts/${configuredAccountId}/tokens/verify`);
      ok(`Cloudflare account authentication is valid for ${configuredAccountId}.`);
    } catch {
      fail('Cloudflare account authentication failed for the configured account.');
      hasCriticalError = true;
    }
  } else {
    const whoami = runWrangler(projectRoot, ['whoami']);
    if (whoami.status !== 0) {
      fail('Not authenticated with Cloudflare. Run `pnpm exec wrangler login`.');
      hasCriticalError = true;
    } else {
      ok('Cloudflare authentication is valid.');
    }
  }

  let edgeConfig;
  let mcpConfig;
  try {
    edgeConfig = parseWranglerConfig(wranglerEdgeConfigPath);
    mcpConfig = parseWranglerConfig(wranglerMcpConfigPath);
    ok(`Loaded edge wrangler config: ${wranglerEdgeConfigPath}`);
    ok(`Loaded MCP wrangler config: ${wranglerMcpConfigPath}`);
  } catch (error) {
    fail(
      `Failed to parse wrangler config: ${error instanceof Error ? error.message : String(error)}`,
    );
    hasCriticalError = true;
  }
  const config = edgeConfig;
  const configuredVars = config?.vars && typeof config.vars === 'object' ? config.vars : {};
  const trustCfAccessJwt = parseBoolean(configuredVars.MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION);
  const trustCfAccessHeaders = parseBoolean(
    configuredVars.MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS,
  );
  const trustCfAccessAcknowledged = parseBoolean(
    configuredVars.MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED,
  );

  if (edgeConfig && mcpConfig) {
    if (edgeConfig.main !== 'src/worker-edge.ts') {
      warn(`Expected edge main src/worker-edge.ts, found ${String(edgeConfig.main)}`);
    } else {
      ok('Edge worker entrypoint is src/worker-edge.ts.');
    }
    if (mcpConfig.main !== 'src/worker-mcp.ts') {
      warn(`Expected MCP main src/worker-mcp.ts, found ${String(mcpConfig.main)}`);
    } else {
      ok('MCP worker entrypoint is src/worker-mcp.ts.');
    }

    for (const [role, config] of [
      ['edge', edgeConfig],
      ['mcp', mcpConfig],
    ]) {
      if (parseBoolean(config?.vars?.CODEMODE_ENABLED)) {
        fail(`Code Mode must remain disabled in the production ${role} Worker preflight.`);
        hasCriticalError = true;
      } else {
        ok(`Code Mode is disabled in the production ${role} Worker config.`);
      }
      if (Array.isArray(config?.worker_loaders) && config.worker_loaders.length > 0) {
        fail(
          `Code Mode Worker Loader bindings must not be present in the disabled production ${role} Worker config.`,
        );
        hasCriticalError = true;
      } else {
        ok(`No Code Mode Worker Loader binding is present on the production ${role} Worker.`);
      }
    }

    const hasMcpService =
      Array.isArray(edgeConfig?.services) &&
      edgeConfig.services.some(
        (s) => s?.binding === 'MCP_SERVICE' && s?.service === 'courtlistener-mcp-mcp',
      );
    if (!hasMcpService) {
      fail('Missing service binding MCP_SERVICE -> courtlistener-mcp-mcp on edge worker.');
      hasCriticalError = true;
    } else {
      ok('Service binding is configured: MCP_SERVICE -> courtlistener-mcp-mcp.');
    }

    const hasEdgeService =
      Array.isArray(mcpConfig?.services) &&
      mcpConfig.services.some(
        (s) => s?.binding === 'EDGE_SERVICE' && s?.service === 'courtlistener-mcp',
      );
    if (hasEdgeService) {
      fail(
        'Reverse service binding EDGE_SERVICE -> courtlistener-mcp is still configured on the MCP worker; direct MCP secret ownership is required.',
      );
      hasCriticalError = true;
    } else {
      ok('No reverse EDGE_SERVICE secret binding is configured on the MCP worker.');
    }

    const mcpOAuthKvBinding = Array.isArray(mcpConfig?.kv_namespaces)
      ? mcpConfig.kv_namespaces.find((ns) => ns?.binding === 'OAUTH_KV')
      : null;
    if (mcpOAuthKvBinding) {
      fail('OAUTH_KV is edge-owned and must not be bound to the MCP worker.');
      hasCriticalError = true;
    } else {
      ok('OAuth KV remains edge-owned; MCP has no OAUTH_KV binding.');
    }

    const publicMcpRoutes = Array.isArray(mcpConfig?.routes) ? mcpConfig.routes : [];
    if (publicMcpRoutes.length > 0) {
      fail(
        'Public MCP zone routes are still configured on the MCP worker; public /mcp ingress must terminate at the Edge worker.',
      );
      hasCriticalError = true;
    } else {
      ok('MCP worker has no public zone routes; Edge owns canonical /mcp ingress.');
    }

    const authLimiterBinding = Array.isArray(edgeConfig?.durable_objects?.bindings)
      ? config.durable_objects.bindings.find((b) => b?.name === 'AUTH_FAILURE_LIMITER')
      : null;
    if (
      !authLimiterBinding ||
      authLimiterBinding.class_name !== 'AuthFailureLimiterDO' ||
      !authLimiterBinding.script_name
    ) {
      fail(
        'Missing Durable Object binding AUTH_FAILURE_LIMITER -> AuthFailureLimiterDO (script_name required).',
      );
      hasCriticalError = true;
    } else {
      ok(
        `Durable Object binding is configured: AUTH_FAILURE_LIMITER -> AuthFailureLimiterDO@${authLimiterBinding.script_name}.`,
      );
    }

    const hasSpaAssets = config?.assets?.directory && config?.assets?.binding === 'SPA_ASSETS';
    if (!hasSpaAssets) {
      fail('Missing Workers Assets binding SPA_ASSETS (.spa-dist).');
      hasCriticalError = true;
    } else {
      ok(`Workers Assets binding is configured: SPA_ASSETS -> ${config.assets.directory}.`);
    }

    const asyncJobsKvBinding = Array.isArray(mcpConfig?.kv_namespaces)
      ? mcpConfig.kv_namespaces.find((ns) => ns?.binding === 'ASYNC_JOBS_KV')
      : null;
    if (asyncJobsKvBinding) {
      if (!asyncJobsKvBinding.id || /^0+$/.test(String(asyncJobsKvBinding.id))) {
        fail('ASYNC_JOBS_KV is configured with a placeholder or missing namespace id.');
        hasCriticalError = true;
      } else {
        ok('ASYNC_JOBS_KV namespace binding is configured.');
      }
    } else {
      warn('ASYNC_JOBS_KV namespace binding is not configured.');
    }

    const asyncQueueProducer =
      Array.isArray(mcpConfig?.queues?.producers) &&
      mcpConfig.queues.producers.find((producer) => producer?.binding === 'ASYNC_TOOL_QUEUE');
    if (asyncQueueProducer) {
      ok(`ASYNC_TOOL_QUEUE producer binding is configured (${String(asyncQueueProducer.queue)}).`);
    } else {
      warn('ASYNC_TOOL_QUEUE producer binding is not configured.');
    }

    const asyncQueueConsumers = Array.isArray(mcpConfig?.queues?.consumers)
      ? mcpConfig.queues.consumers.filter(
          (consumer) => consumer?.queue === 'courtlistener-mcp-async-tool-jobs',
        )
      : [];
    if (asyncQueueConsumers.length !== 1) {
      fail(`Expected exactly one MCP async Queue consumer, found ${asyncQueueConsumers.length}.`);
      hasCriticalError = true;
    } else {
      const asyncQueueConsumer = asyncQueueConsumers[0];
      if (!Number.isInteger(asyncQueueConsumer.max_retries) || asyncQueueConsumer.max_retries < 1) {
        fail('MCP async Queue consumer must declare a positive max_retries value.');
        hasCriticalError = true;
      }
      if (
        typeof asyncQueueConsumer.dead_letter_queue !== 'string' ||
        asyncQueueConsumer.dead_letter_queue.trim().length === 0
      ) {
        fail('MCP async Queue consumer must declare a dead_letter_queue.');
        hasCriticalError = true;
      } else {
        ok(
          `MCP async Queue consumer retry/DLQ policy is configured (${asyncQueueConsumer.max_retries} retries -> ${asyncQueueConsumer.dead_letter_queue}).`,
        );
      }
    }

    const analyticsBinding =
      Array.isArray(config?.analytics_engine_datasets) &&
      config.analytics_engine_datasets.find((dataset) => dataset?.binding === 'ANALYTICS');
    if (analyticsBinding) {
      if (parseBoolean(config?.vars?.MCP_CF_ANALYTICS_ENABLED)) {
        ok(
          `ANALYTICS dataset binding is configured and enabled (${String(analyticsBinding.dataset)}).`,
        );
      } else {
        fail('ANALYTICS dataset binding exists but MCP_CF_ANALYTICS_ENABLED is not true.');
        hasCriticalError = true;
      }
    } else {
      warn('ANALYTICS dataset binding is not configured.');
    }

    const mcpAnalyticsBinding =
      Array.isArray(mcpConfig?.analytics_engine_datasets) &&
      mcpConfig.analytics_engine_datasets.find((dataset) => dataset?.binding === 'ANALYTICS');
    if (mcpAnalyticsBinding) {
      if (parseBoolean(mcpConfig?.vars?.MCP_CF_ANALYTICS_ENABLED)) {
        ok(
          `MCP ANALYTICS dataset binding is configured and enabled (${String(mcpAnalyticsBinding.dataset)}).`,
        );
      } else {
        fail('MCP ANALYTICS dataset binding exists but MCP_CF_ANALYTICS_ENABLED is not true.');
        hasCriticalError = true;
      }
    } else {
      warn('MCP ANALYTICS dataset binding is not configured.');
    }

    const asyncQueueFlag = mcpConfig?.vars?.MCP_ASYNC_QUEUE_ENABLED;
    if (asyncQueueFlag === 'false') {
      ok('MCP_ASYNC_QUEUE_ENABLED is explicitly false in the production MCP config.');
    } else {
      fail(
        `MCP_ASYNC_QUEUE_ENABLED must be explicitly false in the production MCP config (found ${String(asyncQueueFlag)}).`,
      );
      hasCriticalError = true;
    }

    if ((trustCfAccessJwt || trustCfAccessHeaders) && !trustCfAccessAcknowledged) {
      fail(
        'Cloudflare Access trust flags are enabled without MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true. This deploy gate requires an explicit acknowledgement before trusting Access JWT assertions or identity headers.',
      );
      hasCriticalError = true;
    } else if (trustCfAccessJwt || trustCfAccessHeaders) {
      ok('Cloudflare Access trust flags are explicitly acknowledged for deployment.');
    }

    const turnstileEnforcedRoutes = parseConfiguredRoutes(
      configuredVars.MCP_TURNSTILE_ENFORCED_ROUTES,
    );
    if (turnstileEnforcedRoutes.length > 0) {
      ok(`Turnstile is enforced for route ids: ${turnstileEnforcedRoutes.join(', ')}.`);
    }
  }

  const edgeSecretList = listWranglerSecrets(projectRoot, wranglerEdgeConfig);
  const mcpSecretList = listWranglerSecrets(projectRoot, wranglerMcpConfig);
  const edgeSecretNames = edgeSecretList.names;
  const mcpSecretNames = mcpSecretList.names;
  const allSecretNames = [...new Set([...edgeSecretNames, ...mcpSecretNames])];

  if (edgeSecretList.ok) {
    ok(`Found ${edgeSecretNames.length} secrets on edge worker (${wranglerEdgeConfig}).`);
  } else {
    warn(`Could not list edge worker secrets (${wranglerEdgeConfig}): ${edgeSecretList.error}`);
  }

  if (mcpSecretList.ok) {
    ok(`Found ${mcpSecretNames.length} secrets on MCP worker (${wranglerMcpConfig}).`);
  } else {
    warn(`Could not list MCP worker secrets (${wranglerMcpConfig}): ${mcpSecretList.error}`);
  }

  for (const secret of requiredMcpSecrets) {
    if (mcpSecretNames.includes(secret)) {
      ok(`Required MCP worker secret present: ${secret}`);
      continue;
    }

    if (edgeSecretNames.includes(secret)) {
      fail(
        `${secret} is configured on the edge worker but missing on the MCP worker. Direct MCP ownership is required; run: ${formatSecretPutCommand(secret, wranglerMcpConfig)}`,
      );
      hasCriticalError = true;
      continue;
    }

    fail(
      `Missing required MCP worker secret: ${secret} (run: ${formatSecretPutCommand(secret, wranglerMcpConfig)})`,
    );
    hasCriticalError = true;
  }

  const hasStaticAuth = mcpSecretNames.includes('MCP_AUTH_TOKEN');
  const hasOidcAuth = edgeSecretNames.includes('OIDC_ISSUER');
  const hasOidcAudience = edgeSecretNames.includes('OIDC_AUDIENCE');
  const hasUiSessionSecret = edgeSecretNames.includes('MCP_UI_SESSION_SECRET');
  const hasTurnstileSiteKey =
    edgeSecretNames.includes('TURNSTILE_SITE_KEY') ||
    hasConfiguredValue(configuredVars, 'TURNSTILE_SITE_KEY');
  const hasTurnstileSecretKey = edgeSecretNames.includes('TURNSTILE_SECRET_KEY');
  const analyticsEnabled = parseBoolean(configuredVars.MCP_CF_ANALYTICS_ENABLED);
  const turnstileEnforcedRoutes = parseConfiguredRoutes(
    configuredVars.MCP_TURNSTILE_ENFORCED_ROUTES,
  );
  const hasOidcClientId =
    edgeSecretNames.includes('MCP_AUTH_OIDC_CLIENT_ID') ||
    hasConfiguredValue(configuredVars, 'MCP_AUTH_OIDC_CLIENT_ID');
  const hasOidcClientSecret =
    edgeSecretNames.includes('MCP_AUTH_OIDC_CLIENT_SECRET') ||
    hasConfiguredValue(configuredVars, 'MCP_AUTH_OIDC_CLIENT_SECRET');
  const hasLegacyLogtoId =
    allSecretNames.includes('LOGTO_APP_ID') || hasConfiguredValue(configuredVars, 'LOGTO_APP_ID');
  const hasLegacyLogtoSecret =
    allSecretNames.includes('LOGTO_APP_SECRET') ||
    hasConfiguredValue(configuredVars, 'LOGTO_APP_SECRET');
  const hasDedicatedRegistrationTokenSecret = edgeSecretNames.includes(
    'MCP_OAUTH_REGISTRATION_TOKEN_SECRET',
  );
  if (!hasUiSessionSecret) {
    const message =
      'MCP_UI_SESSION_SECRET is missing. UI session auth routes will fail or be unstable.';
    warn(message);
  }

  if (turnstileEnforcedRoutes.length > 0) {
    if (!hasTurnstileSiteKey || !hasTurnstileSecretKey) {
      fail('Turnstile is enforced but TURNSTILE_SITE_KEY and/or TURNSTILE_SECRET_KEY are missing.');
      hasCriticalError = true;
    } else {
      ok('Turnstile secrets are configured for enforced routes.');
    }
  }

  if (analyticsEnabled) {
    ok('MCP_CF_ANALYTICS_ENABLED is set.');
  }

  if (hasDedicatedRegistrationTokenSecret) {
    ok(
      'MCP_OAUTH_REGISTRATION_TOKEN_SECRET is configured for dedicated DCR management-token signing.',
    );
  } else {
    const dedicatedRegistrationSecretRequired =
      process.env.CLOUDFLARE_REQUIRE_DEDICATED_DCR_SECRET === 'true' ||
      process.env.CLOUDFLARE_RELEASE_ENVIRONMENT === 'production';
    const message =
      'MCP_OAUTH_REGISTRATION_TOKEN_SECRET is missing. Registration management tokens are disabled until a dedicated signing secret is configured.';
    if (dedicatedRegistrationSecretRequired) {
      fail(message);
      hasCriticalError = true;
    } else {
      warn(message);
    }
  }

  if (hasOidcAuth) {
    ok('OIDC_ISSUER is configured.');
  } else {
    warn(
      'OIDC_ISSUER secret is missing. Direct bearer-token OIDC verification and hosted upstream auth will be unavailable.',
    );
  }

  if (hasLegacyLogtoId || hasLegacyLogtoSecret) {
    fail(
      'Legacy LOGTO_APP_ID / LOGTO_APP_SECRET config is no longer supported. Remove both and use MCP_AUTH_OIDC_CLIENT_ID plus MCP_AUTH_OIDC_CLIENT_SECRET.',
    );
    hasCriticalError = true;
  }

  const accessHostedAuthReadyByConfig =
    hasUiSessionSecret && trustCfAccessHeaders && trustCfAccessAcknowledged;
  const upstreamHostedAuthReadyByConfig =
    hasOidcAuth && hasUiSessionSecret && hasOidcClientId && hasOidcClientSecret;
  const hostedAuthSignals =
    hasUiSessionSecret ||
    hasOidcClientId ||
    hasOidcClientSecret ||
    trustCfAccessHeaders ||
    trustCfAccessJwt;
  if (hostedAuthSignals && !hasUiSessionSecret) {
    fail('Hosted auth configuration is incomplete: MCP_UI_SESSION_SECRET is required.');
    hasCriticalError = true;
  }
  if ((hasOidcClientId && !hasOidcClientSecret) || (!hasOidcClientId && hasOidcClientSecret)) {
    fail(
      'Hosted auth upstream OIDC config is incomplete: set both MCP_AUTH_OIDC_CLIENT_ID and MCP_AUTH_OIDC_CLIENT_SECRET.',
    );
    hasCriticalError = true;
  } else if (!accessHostedAuthReadyByConfig && hostedAuthSignals && !hasOidcClientId) {
    fail('Hosted auth requires MCP_AUTH_OIDC_CLIENT_ID and MCP_AUTH_OIDC_CLIENT_SECRET.');
    hasCriticalError = true;
  }
  if (!accessHostedAuthReadyByConfig && hostedAuthSignals && !hasOidcAuth) {
    fail('Hosted auth requires OIDC_ISSUER.');
    hasCriticalError = true;
  }

  if (hasOidcAudience) {
    ok('OIDC_AUDIENCE is configured.');
  } else {
    warn(
      'OIDC_AUDIENCE is missing. Resource-bound upstream bearer validation and hosted auth may be incomplete.',
    );
  }

  if (!hasStaticAuth && !hasOidcAuth) {
    warn(
      'No auth secret found (`MCP_AUTH_TOKEN` or `OIDC_ISSUER`). Endpoint will be open unless protected elsewhere.',
    );
  } else {
    ok('At least one auth mechanism is configured.');
  }

  if (hasStaticAuth) {
    ok('MCP_AUTH_TOKEN is configured for the explicit x-mcp-service-token path.');
  }

  if (config) {
    const registrationTokenTtlRaw =
      typeof configuredVars.MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS === 'string'
        ? configuredVars.MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS.trim()
        : '';
    if (!registrationTokenTtlRaw) {
      warn(
        'MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS is not set. Registration management tokens will default to 86400 seconds (24h). Set it explicitly so rollout intent is visible in config.',
      );
    } else {
      const ttlSeconds = Number.parseInt(registrationTokenTtlRaw, 10);
      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        fail('MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS must be a positive integer when set.');
        hasCriticalError = true;
      } else {
        ok(`MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS is set to ${ttlSeconds} seconds.`);
        if (ttlSeconds > 7 * 24 * 60 * 60) {
          warn(
            'MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS exceeds 7 days. Long-lived DCR management tokens increase credential leak blast radius.',
          );
        }
      }
    }

    const baseUrl = deriveBaseUrl(config);
    if (!baseUrl) {
      warn('Could not derive deployment URL from wrangler config.');
    } else {
      console.log(`\nEndpoint checks against ${baseUrl}`);

      const health = await checkEndpoint(baseUrl, '/health');
      if (health.ok) {
        ok(`/health reachable (HTTP ${health.status})`);
        try {
          const payload = JSON.parse(health.body);
          const coreCheck = validateRuntimeHealthCorePayload(payload);
          if (coreCheck.ok) {
            ok('/health payload matches unified runtime health contract.');
          } else {
            warn(`/health payload contract drift: ${coreCheck.reason}`);
          }
        } catch {
          warn('/health payload is not valid JSON.');
        }
      } else warn(`/health check failed (HTTP ${health.status}): ${health.body.slice(0, 200)}`);

      const root = await checkEndpoint(baseUrl, '/');
      if (root.ok) ok(`/ reachable (HTTP ${root.status})`);
      else warn(`/ check failed (HTTP ${root.status}): ${root.body.slice(0, 200)}`);

      const mcp = await checkMcpDiscover(baseUrl, '/mcp');
      if (mcp.ok) {
        ok('/mcp server/discover handshake passed.');
      } else if (mcp.authProtected) {
        ok(`/mcp ingress is reachable and auth-protected (HTTP ${mcp.status}).`);
      } else {
        warn(`/mcp server/discover failed (HTTP ${mcp.status}).`);
        ok('Legacy /sse ingress is not required; MCP v2 uses canonical /mcp.');
      }

      const hostedAuth = await checkEndpoint(baseUrl, '/auth/start?continue=1', {
        redirect: 'manual',
      });
      const hostedAuthReadyHeader = hostedAuth.headers.get('x-hosted-auth-ready');
      const hostedAuthStatus = hostedAuth.headers.get('x-hosted-auth-status');
      const hostedAuthLocation = hostedAuth.headers.get('location');
      const hostedAuthRedirectReady =
        hostedAuth.status >= 300 &&
        hostedAuth.status < 400 &&
        hostedAuthReadyHeader === 'true' &&
        Boolean(hostedAuthLocation);

      if (upstreamHostedAuthReadyByConfig) {
        if (hostedAuthRedirectReady) {
          ok('/auth/start readiness probe is redirect-ready.');
        } else {
          fail(
            `/auth/start readiness probe is not redirect-ready (HTTP ${hostedAuth.status}, status=${String(hostedAuthStatus)}).`,
          );
          hasCriticalError = true;
        }
      } else if (accessHostedAuthReadyByConfig) {
        const authorizeAccessProbe = await checkEndpoint(
          baseUrl,
          '/oauth/authorize?client_id=cloudflare-check&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback&response_type=code&state=cloudflare-check&scope=legal%3Aread&code_challenge=challenge&code_challenge_method=S256',
          {
            redirect: 'manual',
          },
        );
        const authorizeLocation = authorizeAccessProbe.headers.get('location') || '';
        const accessRedirectReady =
          authorizeAccessProbe.status >= 300 &&
          authorizeAccessProbe.status < 400 &&
          isCloudflareAccessLoginRedirect(authorizeLocation);
        if (accessRedirectReady) {
          ok('/oauth/authorize is protected by Cloudflare Access for browser auth.');
        } else {
          fail(
            `/oauth/authorize is not protected by Cloudflare Access as expected (HTTP ${authorizeAccessProbe.status}, location=${authorizeLocation || 'none'}).`,
          );
          hasCriticalError = true;
        }
      } else if (hostedAuth.status > 0) {
        warn(
          `/auth/start readiness probe is fail-closed as expected for incomplete config (HTTP ${hostedAuth.status}, status=${String(hostedAuthStatus)}).`,
        );
      }
    }
  }

  console.log('\nSuggested commands:');
  console.log(`  ${formatSecretPutCommand('COURTLISTENER_API_KEY', wranglerMcpConfig)}`);
  console.log(`  ${formatSecretPutCommand('MCP_UI_SESSION_SECRET', wranglerEdgeConfig)}`);
  console.log(`  ${formatSecretPutCommand('OIDC_ISSUER', wranglerEdgeConfig)}`);
  console.log(`  ${formatSecretPutCommand('OIDC_AUDIENCE', wranglerEdgeConfig)}`);
  console.log(`  ${formatSecretPutCommand('MCP_AUTH_OIDC_CLIENT_ID', wranglerEdgeConfig)}`);
  console.log(`  ${formatSecretPutCommand('MCP_AUTH_OIDC_CLIENT_SECRET', wranglerEdgeConfig)}`);
  console.log(
    `  ${formatSecretPutCommand('MCP_OAUTH_REGISTRATION_TOKEN_SECRET', wranglerEdgeConfig)}`,
  );
  console.log(
    `  ${formatSecretPutCommand('TURNSTILE_SECRET_KEY', wranglerEdgeConfig)}   # when Turnstile is enforced`,
  );
  console.log(
    `  ${formatSecretPutCommand('MCP_AUTH_TOKEN', wranglerMcpConfig)}   # optional x-mcp-service-token secret`,
  );
  console.log(
    '  # set MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS in wrangler vars (for example 86400)',
  );
  console.log(
    '  # set MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true to trust Cloudflare Access browser identity headers',
  );
  console.log(
    '  # set MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true only when intentionally trusting Access headers/assertions',
  );
  console.log(
    '  pnpm exec wrangler kv:key put --binding OAUTH_KV oauth_contract_check ok -c wrangler.edge.jsonc',
  );
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    warn(
      'CLOUDFLARE_API_TOKEN is not set. Run `pnpm run cloudflare:waf:ensure` after creating a Zone.WAF Edit token to allow OAuth monitoring probes through Bot Fight / BIC.',
    );
  } else {
    ok(
      'CLOUDFLARE_API_TOKEN is present. Run `pnpm run cloudflare:waf:ensure` explicitly to install or update the OAuth probe WAF rule.',
    );
  }
  console.log('  pnpm run cloudflare:secrets:sync-mcp   # copy local/env secrets to MCP worker');
  console.log('  pnpm run cloudflare:waf:ensure   # idempotent WAF rule for OAuth probes');
  console.log(
    '  Use the GitHub Actions Cloudflare Release Controller for upload, canary, promotion, or rollback.',
  );

  if (hasCriticalError) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
