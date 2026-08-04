#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isCloudflareAccessLoginRedirect } from './url-helpers.js';
import {
  WRANGLER_EDGE_CONFIG,
  WRANGLER_MCP_CONFIG,
  formatSecretPutCommand,
  listWranglerSecrets,
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

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    cwd: projectRoot,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
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

function validateAuthUiOrigin(rawValue) {
  if (!rawValue) {
    return { ok: false, reason: 'missing' };
  }
  try {
    const parsed = new URL(rawValue);
    const hasExtraPath = parsed.pathname && parsed.pathname !== '/';
    const hasExtraQuery = Boolean(parsed.search);
    const hasExtraHash = Boolean(parsed.hash);
    return {
      ok: true,
      normalized: parsed.origin,
      hasExtraPath,
      hasExtraQuery,
      hasExtraHash,
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
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

function parsePositiveIntVar(rawValue, name) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return { ok: true, value: null };
  }

  const parsed = Number.parseInt(String(rawValue).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, reason: `${name} must be a positive integer when set.` };
  }

  return { ok: true, value: parsed };
}

function validateSessionTopologyVars(vars, label) {
  const issues = [];
  const idle = parsePositiveIntVar(
    vars?.MCP_SESSION_IDLE_TTL_SECONDS,
    'MCP_SESSION_IDLE_TTL_SECONDS',
  );
  const absolute = parsePositiveIntVar(
    vars?.MCP_SESSION_ABSOLUTE_TTL_SECONDS,
    'MCP_SESSION_ABSOLUTE_TTL_SECONDS',
  );
  const shardCount = parsePositiveIntVar(vars?.MCP_SESSION_SHARD_COUNT, 'MCP_SESSION_SHARD_COUNT');
  const sweepLimit = parsePositiveIntVar(
    vars?.MCP_SESSION_EVICTION_SWEEP_LIMIT,
    'MCP_SESSION_EVICTION_SWEEP_LIMIT',
  );

  for (const result of [idle, absolute, shardCount, sweepLimit]) {
    if (!result.ok) {
      issues.push(`${label}: ${result.reason}`);
    }
  }

  if (
    idle.ok &&
    absolute.ok &&
    idle.value !== null &&
    absolute.value !== null &&
    absolute.value <= idle.value
  ) {
    issues.push(
      `${label}: MCP_SESSION_ABSOLUTE_TTL_SECONDS must be greater than MCP_SESSION_IDLE_TTL_SECONDS.`,
    );
  }

  return issues;
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
  if (runtime !== 'node' && runtime !== 'cloudflare-worker') {
    return { ok: false, reason: `unexpected health runtime: ${String(runtime)}` };
  }

  if (typeof payload.transport !== 'string' || payload.transport.trim().length === 0) {
    return { ok: false, reason: 'health payload missing transport' };
  }

  const diagnostics = payload.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return { ok: false, reason: 'health payload missing diagnostics object' };
  }

  for (const key of ['session_topology', 'cloudflare', 'metrics']) {
    if (!diagnostics[key] || typeof diagnostics[key] !== 'object') {
      return { ok: false, reason: `diagnostics.${key} is missing` };
    }
  }

  const sessionTopology = diagnostics.session_topology;
  for (const key of [
    'version',
    'shard_count',
    'idle_ttl_ms',
    'absolute_ttl_ms',
    'eviction_sweep_limit',
  ]) {
    if (!(key in sessionTopology)) {
      return { ok: false, reason: `diagnostics.session_topology.${key} is missing` };
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

async function checkMcpInitialize(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2024-11-05',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cloudflare-check', version: '1.0.0' },
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

  const version = run('wrangler', ['--version']);
  if (version.status !== 0) {
    fail('Wrangler CLI is not available.');
    hasCriticalError = true;
  } else {
    ok(`Wrangler detected: ${version.stdout}`);
  }

  const whoami = run('wrangler', ['whoami']);
  if (whoami.status !== 0) {
    fail('Not authenticated with Cloudflare. Run `wrangler login`.');
    hasCriticalError = true;
  } else {
    ok('Cloudflare authentication is valid.');
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
  const trustCfAccessDeprecated = parseBoolean(configuredVars.MCP_TRUST_CLOUDFLARE_ACCESS_HEADERS);
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

    const publicMcpRoutes = Array.isArray(mcpConfig?.routes) ? mcpConfig.routes : [];
    if (publicMcpRoutes.length > 0) {
      fail(
        'Public MCP zone routes are still configured on the MCP worker; public /mcp and /sse ingress must terminate at the Edge worker.',
      );
      hasCriticalError = true;
    } else {
      ok('MCP worker has no public zone routes; Edge owns /mcp and /sse ingress.');
    }

    const hasMcpDoBinding =
      Array.isArray(mcpConfig?.durable_objects?.bindings) &&
      mcpConfig.durable_objects.bindings.some(
        (b) => b?.name === 'MCP_OBJECT' && b?.class_name === 'CourtListenerMCP',
      );
    if (!hasMcpDoBinding) {
      fail('Missing Durable Object binding MCP_OBJECT -> CourtListenerMCP on MCP worker.');
      hasCriticalError = true;
    } else {
      ok('MCP worker DO binding is configured: MCP_OBJECT -> CourtListenerMCP.');
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

    const mcpConfiguredVars =
      mcpConfig?.vars && typeof mcpConfig.vars === 'object' ? mcpConfig.vars : {};
    const sessionTopologyIssues = validateSessionTopologyVars(mcpConfiguredVars, 'MCP worker');
    if (sessionTopologyIssues.length === 0) {
      ok('MCP worker session topology vars are consistent.');
    } else {
      for (const issue of sessionTopologyIssues) {
        fail(issue);
      }
      hasCriticalError = true;
    }

    const analyticsBinding =
      Array.isArray(config?.analytics_engine_datasets) &&
      config.analytics_engine_datasets.find((dataset) => dataset?.binding === 'ANALYTICS');
    if (analyticsBinding) {
      ok(`ANALYTICS dataset binding is configured (${String(analyticsBinding.dataset)}).`);
    } else {
      warn('ANALYTICS dataset binding is not configured.');
    }

    const authUiOrigin =
      typeof configuredVars.MCP_AUTH_UI_ORIGIN === 'string'
        ? configuredVars.MCP_AUTH_UI_ORIGIN.trim()
        : '';
    const allowDevFallback =
      typeof configuredVars.MCP_ALLOW_DEV_FALLBACK === 'string'
        ? configuredVars.MCP_ALLOW_DEV_FALLBACK.trim().toLowerCase()
        : '';
    if (authUiOrigin) {
      const authUiOriginCheck = validateAuthUiOrigin(authUiOrigin);
      if (!authUiOriginCheck.ok) {
        warn(`MCP_AUTH_UI_ORIGIN is set but not a valid absolute URL: ${authUiOrigin}`);
      } else {
        warn(
          `MCP_AUTH_UI_ORIGIN is configured (${authUiOriginCheck.normalized}) but deprecated and ignored; hosted auth now starts on the Worker origin.`,
        );
        if (
          authUiOriginCheck.hasExtraPath ||
          authUiOriginCheck.hasExtraQuery ||
          authUiOriginCheck.hasExtraHash
        ) {
          warn(
            'MCP_AUTH_UI_ORIGIN is deprecated; remove it instead of pointing it at an auth app or URL path.',
          );
        }
      }
    } else {
      ok(
        'MCP_AUTH_UI_ORIGIN is not configured; hosted auth will use Worker-owned same-origin routes.',
      );
    }
    if (!allowDevFallback || allowDevFallback === 'false' || allowDevFallback === '0') {
      ok('MCP_ALLOW_DEV_FALLBACK is disabled.');
    } else {
      fail('MCP_ALLOW_DEV_FALLBACK is enabled. Disable this in production.');
      hasCriticalError = true;
    }
    if (trustCfAccessDeprecated) {
      fail(
        'MCP_TRUST_CLOUDFLARE_ACCESS_HEADERS is deprecated and unsafe. Remove it and use the scoped trust flags only when an explicit trusted edge boundary exists.',
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
      'MCP_OAUTH_REGISTRATION_TOKEN_SECRET is missing. Registration management tokens will fall back to MCP_UI_SESSION_SECRET or COURTLISTENER_API_KEY, coupling rotation across unrelated trust boundaries.';
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

      const mcp = await checkMcpInitialize(baseUrl, '/mcp');
      if (mcp.ok) {
        ok('/mcp initialize handshake passed.');
      } else if (mcp.authProtected) {
        ok(`/mcp ingress is reachable and auth-protected (HTTP ${mcp.status}).`);
      } else {
        warn(`/mcp initialize failed (HTTP ${mcp.status}).`);
        const sse = await checkMcpInitialize(baseUrl, '/sse');
        if (sse.ok) {
          warn('/sse initialize works; deployment may still be on an older endpoint shape.');
        } else if (sse.authProtected) {
          ok(`/sse ingress is reachable and auth-protected (HTTP ${sse.status}).`);
        } else {
          warn(`/sse initialize also failed (HTTP ${sse.status}).`);
        }
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
  console.log('  wrangler kv:key put --binding OAUTH_KV oauth_contract_check ok');
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
  console.log('  pnpm run cloudflare:deploy');

  if (hasCriticalError) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
