#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isCloudflareAccessLoginRedirect } from './url-helpers.js';

const projectRoot = process.cwd();
const wranglerEdgeConfigPath = join(projectRoot, 'wrangler.edge.jsonc');
const wranglerMcpConfigPath = join(projectRoot, 'wrangler.mcp.jsonc');

const requiredSecrets = ['COURTLISTENER_API_KEY'];

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
      status: res.status,
      body: text,
    };
  } catch (error) {
    return {
      ok: false,
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

  const secretList = run('wrangler', ['secret', 'list']);
  let secretNames = [];
  if (secretList.status === 0) {
    try {
      const parsed = JSON.parse(secretList.stdout);
      secretNames = Array.isArray(parsed) ? parsed.map((s) => s.name).filter(Boolean) : [];
      ok(`Found ${secretNames.length} Cloudflare secrets.`);
    } catch {
      warn('Could not parse `wrangler secret list` output.');
    }
  } else {
    warn('Could not list Cloudflare secrets.');
  }

  for (const secret of requiredSecrets) {
    if (!secretNames.includes(secret)) {
      fail(`Missing required secret: ${secret} (run: wrangler secret put ${secret})`);
      hasCriticalError = true;
    } else {
      ok(`Required secret present: ${secret}`);
    }
  }

  const hasStaticAuth = secretNames.includes('MCP_AUTH_TOKEN');
  const hasOidcAuth = secretNames.includes('OIDC_ISSUER');
  const hasOidcAudience = secretNames.includes('OIDC_AUDIENCE');
  const hasUiSessionSecret = secretNames.includes('MCP_UI_SESSION_SECRET');
  const hasTurnstileSiteKey =
    secretNames.includes('TURNSTILE_SITE_KEY') ||
    hasConfiguredValue(configuredVars, 'TURNSTILE_SITE_KEY');
  const hasTurnstileSecretKey = secretNames.includes('TURNSTILE_SECRET_KEY');
  const analyticsEnabled = parseBoolean(configuredVars.MCP_CF_ANALYTICS_ENABLED);
  const turnstileEnforcedRoutes = parseConfiguredRoutes(
    configuredVars.MCP_TURNSTILE_ENFORCED_ROUTES,
  );
  const hasOidcClientId =
    secretNames.includes('MCP_AUTH_OIDC_CLIENT_ID') ||
    hasConfiguredValue(configuredVars, 'MCP_AUTH_OIDC_CLIENT_ID');
  const hasOidcClientSecret =
    secretNames.includes('MCP_AUTH_OIDC_CLIENT_SECRET') ||
    hasConfiguredValue(configuredVars, 'MCP_AUTH_OIDC_CLIENT_SECRET');
  const hasLegacyLogtoId =
    secretNames.includes('LOGTO_APP_ID') || hasConfiguredValue(configuredVars, 'LOGTO_APP_ID');
  const hasLegacyLogtoSecret =
    secretNames.includes('LOGTO_APP_SECRET') ||
    hasConfiguredValue(configuredVars, 'LOGTO_APP_SECRET');
  const hasDedicatedRegistrationTokenSecret = secretNames.includes(
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
    warn(
      'MCP_OAUTH_REGISTRATION_TOKEN_SECRET is missing. Registration management tokens will fall back to MCP_UI_SESSION_SECRET or COURTLISTENER_API_KEY, coupling rotation across unrelated trust boundaries.',
    );
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
      if (health.ok) ok(`/health reachable (HTTP ${health.status})`);
      else warn(`/health check failed (HTTP ${health.status}): ${health.body.slice(0, 200)}`);

      const root = await checkEndpoint(baseUrl, '/');
      if (root.ok) ok(`/ reachable (HTTP ${root.status})`);
      else warn(`/ check failed (HTTP ${root.status}): ${root.body.slice(0, 200)}`);

      const mcp = await checkMcpInitialize(baseUrl, '/mcp');
      if (mcp.ok) {
        ok('/mcp initialize handshake passed.');
      } else {
        warn(`/mcp initialize failed (HTTP ${mcp.status}).`);
        const sse = await checkMcpInitialize(baseUrl, '/sse');
        if (sse.ok) {
          warn('/sse initialize works; deployment may still be on an older endpoint shape.');
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
  console.log('  wrangler secret put COURTLISTENER_API_KEY');
  console.log('  wrangler secret put MCP_UI_SESSION_SECRET');
  console.log('  wrangler secret put OIDC_ISSUER');
  console.log('  wrangler secret put OIDC_AUDIENCE');
  console.log('  wrangler secret put MCP_AUTH_OIDC_CLIENT_ID');
  console.log('  wrangler secret put MCP_AUTH_OIDC_CLIENT_SECRET');
  console.log('  wrangler secret put MCP_OAUTH_REGISTRATION_TOKEN_SECRET');
  console.log('  wrangler secret put TURNSTILE_SECRET_KEY   # when Turnstile is enforced');
  console.log('  wrangler secret put MCP_AUTH_TOKEN   # optional x-mcp-service-token secret');
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
