#!/usr/bin/env node

/**
 * End-to-end auth and MCP flow verification.
 *
 * Flow:
 * 1) Create account via /api/signup (with CSRF + cookie jar)
 * 2) Confirm created user via Supabase Admin API (email_confirm=true)
 * 3) Login via /api/login and assert /api/session authenticated=true
 * 4) Logout and assert /api/session authenticated=false
 * 5) Login again
 * 6) Create API key via /api/keys
 * 7) Call MCP initialize + tools/call using created key
 *
 * Required env:
 *   E2E_BASE_URL
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY (legacy alias: SUPABASE_SERVICE_ROLE_KEY)
 *
 * Optional env:
 *   E2E_EMAIL
 *   E2E_PASSWORD
 *   E2E_FULL_NAME
 *   E2E_TURNSTILE_TOKEN
 *   E2E_MCP_TOOL              (default: search_cases)
 *   E2E_MCP_PROMPT            (default: Roe v Wade abortion rights)
 */

const cfg = {
  baseUrl: requiredEnv('E2E_BASE_URL').replace(/\/+$/, ''),
  supabaseUrl: requiredEnv('SUPABASE_URL').replace(/\/+$/, ''),
  supabaseServiceRoleKey:
    process.env.SUPABASE_SECRET_KEY?.trim() || requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  email:
    process.env.E2E_EMAIL?.trim().toLowerCase() ||
    `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
  password: process.env.E2E_PASSWORD?.trim() || `E2E!${Date.now()}aA1`,
  fullName: process.env.E2E_FULL_NAME?.trim() || 'E2E Test User',
  turnstileToken: process.env.E2E_TURNSTILE_TOKEN?.trim() || '',
  mcpTool: process.env.E2E_MCP_TOOL?.trim() || 'search_cases',
  mcpPrompt: process.env.E2E_MCP_PROMPT?.trim() || 'Roe v Wade abortion rights',
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromResponse(response) {
    const raw = getSetCookieHeaders(response);
    for (const setCookie of raw) {
      const [pair] = setCookie.split(';');
      const eqIdx = pair.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (!name) continue;
      this.cookies.set(name, value);
    }
  }

  get(name) {
    return this.cookies.get(name) || '';
  }

  header() {
    if (!this.cookies.size) return '';
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

async function main() {
  const jar = new CookieJar();

  console.log('Starting e2e auth/chat flow');
  console.log(`Base URL: ${cfg.baseUrl}`);
  console.log(`Test email: ${cfg.email}`);

  await step('Load /signup for CSRF cookie', async () => {
    const response = await fetch(`${cfg.baseUrl}/signup`, {
      method: 'GET',
      headers: { accept: 'text/html' },
    });
    assert(response.ok, `GET /signup failed (${response.status})`);
    jar.setFromResponse(response);
    assert(jar.get('clmcp_csrf'), 'Missing clmcp_csrf cookie after GET /signup');
  });

  await step('Create account via /api/signup', async () => {
    const csrf = jar.get('clmcp_csrf');
    const response = await fetch(`${cfg.baseUrl}/api/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        cookie: jar.header(),
      },
      body: JSON.stringify({
        email: cfg.email,
        password: cfg.password,
        fullName: cfg.fullName,
        ...(cfg.turnstileToken ? { turnstileToken: cfg.turnstileToken } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    assert(
      response.status === 202,
      `POST /api/signup failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  });

  const userId = await step('Confirm user via Supabase Admin API', async () => {
    const user = await waitForSupabaseUserByEmail(cfg.email, {
      maxAttempts: 12,
      delayMs: 1500,
    });
    assert(
      user?.id,
      `Supabase user not found for ${cfg.email}. ` +
        'Signup likely failed upstream (common cause: Worker SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY point to a different project than your local SUPABASE_URL/SUPABASE_SECRET_KEY).',
    );

    const response = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      headers: supabaseAdminHeaders(),
      body: JSON.stringify({
        email_confirm: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.ok, `User confirm failed (${response.status}): ${JSON.stringify(payload)}`);
    return user.id;
  });

  await step('Load /login for CSRF cookie', async () => {
    const response = await fetch(`${cfg.baseUrl}/login`, {
      method: 'GET',
      headers: {
        accept: 'text/html',
        cookie: jar.header(),
      },
    });
    assert(response.ok, `GET /login failed (${response.status})`);
    jar.setFromResponse(response);
    assert(jar.get('clmcp_csrf'), 'Missing clmcp_csrf cookie after GET /login');
  });

  await step('Login with email/password', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': jar.get('clmcp_csrf'),
        cookie: jar.header(),
      },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
    });
    const payload = await response.json().catch(() => ({}));
    jar.setFromResponse(response);
    assert(response.ok, `POST /api/login failed (${response.status}): ${JSON.stringify(payload)}`);
    assert(jar.get('clmcp_ui'), 'Missing clmcp_ui session cookie after login');
  });

  await step('Validate /api/session authenticated=true', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/session`, {
      method: 'GET',
      headers: { cookie: jar.header() },
    });
    const payload = await response.json().catch(() => ({}));
    jar.setFromResponse(response);
    assert(response.ok, `GET /api/session failed (${response.status})`);
    assert(payload?.authenticated === true, `Expected authenticated=true, got: ${JSON.stringify(payload)}`);
    assert(payload?.user?.id === userId, `Expected user id ${userId}, got: ${JSON.stringify(payload?.user)}`);
  });

  await step('Logout', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/logout`, {
      method: 'POST',
      headers: {
        'x-csrf-token': jar.get('clmcp_csrf'),
        cookie: jar.header(),
      },
    });
    const payload = await response.json().catch(() => ({}));
    jar.setFromResponse(response);
    assert(response.ok, `POST /api/logout failed (${response.status}): ${JSON.stringify(payload)}`);
  });

  await step('Validate /api/session authenticated=false', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/session`, {
      method: 'GET',
      headers: { cookie: jar.header() },
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.ok, `GET /api/session failed (${response.status})`);
    assert(payload?.authenticated === false, `Expected authenticated=false, got: ${JSON.stringify(payload)}`);
  });

  await step('Login again', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': jar.get('clmcp_csrf'),
        cookie: jar.header(),
      },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
    });
    const payload = await response.json().catch(() => ({}));
    jar.setFromResponse(response);
    assert(response.ok, `POST /api/login (second) failed (${response.status}): ${JSON.stringify(payload)}`);
    assert(jar.get('clmcp_ui'), 'Missing clmcp_ui session cookie after second login');
  });

  const apiToken = await step('Create API key via /api/keys', async () => {
    const response = await fetch(`${cfg.baseUrl}/api/keys`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': jar.get('clmcp_csrf'),
        cookie: jar.header(),
      },
      body: JSON.stringify({ label: 'e2e-flow', expiresDays: 30 }),
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.status === 201, `POST /api/keys failed (${response.status}): ${JSON.stringify(payload)}`);
    const token = payload?.api_key?.token || '';
    assert(token, 'No api_key.token returned from /api/keys');
    return token;
  });

  const mcpSessionId = await step('Initialize MCP session with created API token', async () => {
    const response = await fetch(`${cfg.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'courtlistener-e2e-flow', version: '1.0.0' },
        },
      }),
    });
    const payload = await readMcpJson(response);
    assert(response.ok, `MCP initialize failed (${response.status}): ${JSON.stringify(payload)}`);
    assert(payload?.result || payload?.jsonrpc, `Unexpected MCP initialize payload: ${JSON.stringify(payload)}`);
    const sessionId = response.headers.get('mcp-session-id') || '';
    assert(sessionId, 'Missing mcp-session-id response header after initialize');
    return sessionId;
  });

  await step('Call MCP tool (equivalent to chat send)', async () => {
    const response = await fetch(`${cfg.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
        'mcp-session-id': mcpSessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: cfg.mcpTool,
          arguments: buildToolArguments(cfg.mcpTool, cfg.mcpPrompt),
        },
      }),
    });
    const payload = await readMcpJson(response);
    assert(response.ok, `MCP tools/call failed (${response.status}): ${JSON.stringify(payload)}`);
    assert(
      payload?.result || payload?.jsonrpc,
      `Unexpected MCP tools/call payload: ${JSON.stringify(payload)}`,
    );
    console.log(`MCP response snippet: ${JSON.stringify(payload).slice(0, 300)}`);
  });

  console.log('E2E auth/chat flow passed');
}

function buildToolArguments(toolName, prompt) {
  if (toolName === 'lookup_citation') return { citation: prompt };
  return { query: prompt, page_size: 5, order_by: 'score desc' };
}

async function readMcpJson(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    return safeJsonParse(trimmed);
  }
  const dataLines = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!dataLines.length) return { raw: trimmed };
  return safeJsonParse(dataLines[dataLines.length - 1]);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function getSetCookieHeaders(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  if (!single) return [];
  return single
    .split(/,(?=[^;]+=[^;]+)/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function supabaseAdminHeaders() {
  return {
    apikey: cfg.supabaseServiceRoleKey,
    Authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
    'content-type': 'application/json',
  };
}

async function findSupabaseUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `${cfg.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        method: 'GET',
        headers: supabaseAdminHeaders(),
      },
    );
    const payload = await response.json().catch(() => ({}));
    assert(response.ok, `Supabase admin users list failed (${response.status}): ${JSON.stringify(payload)}`);
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const match = users.find((user) => String(user?.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

async function waitForSupabaseUserByEmail(
  email,
  opts = { maxAttempts: 10, delayMs: 1000 },
) {
  const maxAttempts = Math.max(1, Number(opts?.maxAttempts || 10));
  const delayMs = Math.max(100, Number(opts?.delayMs || 1000));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const user = await findSupabaseUserByEmail(email);
    if (user) return user;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

async function step(name, fn) {
  process.stdout.write(`- ${name} ... `);
  const startedAt = Date.now();
  const result = await fn();
  const elapsedMs = Date.now() - startedAt;
  console.log(`ok (${elapsedMs}ms)`);
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error('E2E auth/chat flow failed');
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
