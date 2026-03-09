#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const wranglerConfigPath = join(projectRoot, 'wrangler.jsonc');

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

function parseWranglerConfig() {
  if (!existsSync(wranglerConfigPath)) {
    throw new Error(`Missing wrangler config at ${wranglerConfigPath}`);
  }

  const raw = readFileSync(wranglerConfigPath, 'utf-8');
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

async function checkEndpoint(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`);
    const text = await res.text();
    return {
      ok: res.ok,
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

  let config;
  try {
    config = parseWranglerConfig();
    ok(`Loaded wrangler config: ${wranglerConfigPath}`);
  } catch (error) {
    fail(`Failed to parse wrangler config: ${error instanceof Error ? error.message : String(error)}`);
    hasCriticalError = true;
  }

  if (config) {
    if (config.main !== 'src/worker.ts') {
      warn(`Expected main to be src/worker.ts, found ${String(config.main)}`);
    } else {
      ok('Worker entrypoint is set to src/worker.ts.');
    }

    const hasMcpDoBinding =
      Array.isArray(config?.durable_objects?.bindings) &&
      config.durable_objects.bindings.some(
        (b) => b?.name === 'MCP_OBJECT' && b?.class_name === 'CourtListenerMCP',
      );
    if (!hasMcpDoBinding) {
      fail('Missing Durable Object binding MCP_OBJECT -> CourtListenerMCP.');
      hasCriticalError = true;
    } else {
      ok('Durable Object binding is configured: MCP_OBJECT -> CourtListenerMCP.');
    }

    const hasAuthLimiterBinding =
      Array.isArray(config?.durable_objects?.bindings) &&
      config.durable_objects.bindings.some(
        (b) => b?.name === 'AUTH_FAILURE_LIMITER' && b?.class_name === 'AuthFailureLimiterDO',
      );
    if (!hasAuthLimiterBinding) {
      fail('Missing Durable Object binding AUTH_FAILURE_LIMITER -> AuthFailureLimiterDO.');
      hasCriticalError = true;
    } else {
      ok('Durable Object binding is configured: AUTH_FAILURE_LIMITER -> AuthFailureLimiterDO.');
    }

    const configuredVars = config.vars && typeof config.vars === 'object' ? config.vars : {};
    const authUiOrigin = typeof configuredVars.MCP_AUTH_UI_ORIGIN === 'string'
      ? configuredVars.MCP_AUTH_UI_ORIGIN.trim()
      : '';
    const allowDevFallback = typeof configuredVars.MCP_ALLOW_DEV_FALLBACK === 'string'
      ? configuredVars.MCP_ALLOW_DEV_FALLBACK.trim().toLowerCase()
      : '';
    if (!authUiOrigin) {
      warn('MCP_AUTH_UI_ORIGIN is not configured in wrangler vars. /authorize cannot redirect users to external login UI.');
    } else {
      const authUiOriginCheck = validateAuthUiOrigin(authUiOrigin);
      if (!authUiOriginCheck.ok) {
        fail(`MCP_AUTH_UI_ORIGIN is not a valid absolute URL: ${authUiOrigin}`);
        hasCriticalError = true;
      } else {
        ok(`Auth UI origin configured: ${authUiOriginCheck.normalized}`);
        if (authUiOriginCheck.hasExtraPath || authUiOriginCheck.hasExtraQuery || authUiOriginCheck.hasExtraHash) {
          warn(
            'MCP_AUTH_UI_ORIGIN should be the auth app origin only (for example https://auth.example.com), not an /mcp path or URL with query/hash components.',
          );
        }
      }
    }
    if (!allowDevFallback || allowDevFallback === 'false' || allowDevFallback === '0') {
      ok('MCP_ALLOW_DEV_FALLBACK is disabled.');
    } else {
      fail('MCP_ALLOW_DEV_FALLBACK is enabled. Disable this in production.');
      hasCriticalError = true;
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
  const authUiOriginConfigured =
    Boolean(config?.vars && typeof config.vars.MCP_AUTH_UI_ORIGIN === 'string' && config.vars.MCP_AUTH_UI_ORIGIN.trim());

  if (!hasUiSessionSecret) {
    const message = 'MCP_UI_SESSION_SECRET is missing. UI session auth routes will fail or be unstable.';
    if (authUiOriginConfigured) {
      fail(message);
      hasCriticalError = true;
    } else {
      warn(message);
    }
  }

  if (authUiOriginConfigured && !hasOidcAuth) {
    warn('OIDC_ISSUER secret is missing. Direct bearer-token OIDC verification will be unavailable.');
  } else if (hasOidcAuth) {
    ok('OIDC_ISSUER is configured.');
  }

  if (authUiOriginConfigured && !hasOidcAudience) {
    warn('OIDC_AUDIENCE is not set. Strongly recommended for Clerk token-template validation.');
  } else if (hasOidcAudience) {
    ok('OIDC_AUDIENCE is configured.');
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
    }
  }

  console.log('\nSuggested commands:');
  console.log('  wrangler secret put COURTLISTENER_API_KEY');
  console.log('  wrangler secret put MCP_UI_SESSION_SECRET');
  console.log('  wrangler secret put OIDC_ISSUER');
  console.log('  wrangler secret put OIDC_AUDIENCE');
  console.log('  wrangler secret put MCP_AUTH_TOKEN   # optional x-mcp-service-token secret');
  console.log('  wrangler kv:key put --binding OAUTH_KV oauth_contract_check ok');
  console.log('  pnpm run cloudflare:deploy');

  if (hasCriticalError) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
