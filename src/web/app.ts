import { WEB_TAILWIND_CSS } from './tailwind-styles.js';

function pageStyles(): string {
  return WEB_TAILWIND_CSS;
}

interface ShellOptions {
  includeTurnstileScript?: boolean;
  nonce: string;
}

function pageHeader(activePath: string): { title: string; subtitle: string } {
  if (activePath === '/signup') {
    return {
      title: 'Create your account',
      subtitle: 'Register once, verify your email, and then issue your first API key.',
    };
  }

  if (activePath === '/login') {
    return {
      title: 'Login to your account',
      subtitle: 'Authenticate with your verified account, then create keys from Your Account.',
    };
  }

  if (activePath === '/keys') {
    return {
      title: 'Key management',
      subtitle: 'View active keys, create rotations, and revoke compromised credentials.',
    };
  }

  if (activePath === '/chat') {
    return {
      title: 'MCP test console',
      subtitle: 'Run a real streamable MCP session against this worker before client rollout.',
    };
  }

  return {
    title: 'CourtListener MCP Control Plane',
    subtitle: 'Supabase-backed auth, key lifecycle control, and direct MCP endpoint validation.',
  };
}

function baseShell(activePath: string, content: string, inlineScript = '', options: ShellOptions): string {
  const header = pageHeader(activePath);
  const shellScript = `
const __activePath = ${JSON.stringify(activePath)};
function __readCookie(name) {
  const key = name + '=';
  const entry = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(key));
  return entry ? decodeURIComponent(entry.slice(key.length)) : '';
}
const __localToken = localStorage.getItem('courtlistenerMcpApiToken') || '';
const __sessionToken = sessionStorage.getItem('courtlistenerMcpApiTokenSession') || '';
const __hasUiSession = __readCookie('clmcp_ui_present') === '1';
const __hasToken = Boolean(__localToken || __sessionToken);
const __isAuthenticated = __hasToken || __hasUiSession;
const __guestSignupBtn = document.getElementById('guestSignupBtn');
const __guestLoginBtn = document.getElementById('guestLoginBtn');
const __accountBtn = document.getElementById('accountBtn');
const __logoutBtn = document.getElementById('logoutBtn');
const __guestHome = document.getElementById('overviewGuest');
const __memberHome = document.getElementById('overviewMember');
if (__guestSignupBtn) {
  __guestSignupBtn.style.display = __isAuthenticated ? 'none' : 'inline-flex';
}
if (__guestLoginBtn) {
  __guestLoginBtn.style.display = __isAuthenticated ? 'none' : 'inline-flex';
}
if (__accountBtn) {
  __accountBtn.style.display = __isAuthenticated ? 'inline-flex' : 'none';
}
if (__logoutBtn) {
  __logoutBtn.style.display = __isAuthenticated ? 'inline-flex' : 'none';
  __logoutBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const csrf = __readCookie('clmcp_csrf');
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
    } catch {}
    localStorage.removeItem('courtlistenerMcpApiToken');
    sessionStorage.removeItem('courtlistenerMcpApiTokenSession');
    window.location.href = '/login';
  });
}
if (__guestHome) {
  __guestHome.style.display = __isAuthenticated ? 'none' : 'grid';
}
if (__memberHome) {
  __memberHome.style.display = __isAuthenticated ? 'grid' : 'none';
}

// Contextual header actions for cleaner UX.
if (!__isAuthenticated) {
  if (__activePath === '/signup' && __guestSignupBtn) {
    __guestSignupBtn.style.display = 'none';
  }
  if (__activePath === '/login' && __guestLoginBtn) {
    __guestLoginBtn.style.display = 'none';
  }
}

if (__isAuthenticated) {
  if (__activePath === '/keys' && __accountBtn) {
    __accountBtn.textContent = 'Account';
  }
}

// Sync authenticated UI state against server session cookie.
fetch('/api/session', { method: 'GET', credentials: 'same-origin' })
  .then((response) => response.json().catch(() => ({})))
  .then((body) => {
    const isServerAuthenticated = Boolean(body?.authenticated);
    if (!isServerAuthenticated && !__hasToken) return;
    if (__guestSignupBtn) __guestSignupBtn.style.display = isServerAuthenticated ? 'none' : 'inline-flex';
    if (__guestLoginBtn) __guestLoginBtn.style.display = isServerAuthenticated ? 'none' : 'inline-flex';
    if (__accountBtn) __accountBtn.style.display = isServerAuthenticated ? 'inline-flex' : 'none';
    if (__logoutBtn) __logoutBtn.style.display = isServerAuthenticated ? 'inline-flex' : 'none';
    if (__guestHome) __guestHome.style.display = isServerAuthenticated ? 'none' : 'grid';
    if (__memberHome) __memberHome.style.display = isServerAuthenticated ? 'grid' : 'none';
  })
  .catch(() => {});
${inlineScript}
`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CourtListener MCP Portal</title>
    <style nonce="${options.nonce}">${pageStyles()}</style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <a href="/" class="brand">CourtListener MCP<small>Auth + Access Portal</small></a>
        <div class="top-actions">
          <a id="guestSignupBtn" href="/signup" class="pill">Create Account</a>
          <a id="guestLoginBtn" href="/login" class="pill primary">Login</a>
          <a id="accountBtn" href="/keys" class="pill primary" style="display:none;">Your Account</a>
          <a id="logoutBtn" href="#" class="pill" style="display:none;" aria-label="Log out of this browser session">Log out</a>
        </div>
      </header>

      <section class="hero">
        <h1>${header.title}</h1>
        <p>${header.subtitle}</p>
      </section>

      <section class="grid">${content}</section>
      <p class="footer-note">MCP endpoint: <span class="mono">/mcp</span> | Health: <span class="mono">/health</span></p>
    </main>
    ${options.includeTurnstileScript ? `<script nonce="${options.nonce}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}
    <script nonce="${options.nonce}">${shellScript}</script>
  </body>
</html>`;
}

export function renderOverviewPage(nonce: string): string {
  const content = `
<div id="overviewGuest" class="grid">
  <div class="card">
    <h2>About This MCP Server</h2>
    <p class="kicker">CourtListener MCP gives AI clients secure tool access to CourtListener legal data through a hosted Cloudflare endpoint.</p>
    <ul class="list">
      <li>Primary endpoint: <span class="mono">/mcp</span></li>
      <li>Auth model: Supabase-backed API keys</li>
      <li>Transport: streamable HTTP with MCP protocol</li>
    </ul>
  </div>
  <div class="card">
    <h2>Project Link</h2>
    <p class="small">Read implementation details, deployment notes, and MCP client setup in the GitHub repo.</p>
    <p><a class="btn secondary" href="https://github.com/blakeox/courtlistener-mcp" target="_blank" rel="noopener noreferrer">Open GitHub Repository</a></p>
  </div>
</div>

<div id="overviewMember" class="grid" style="display:none;">
  <div class="columns">
    <div class="card">
      <h2>Endpoint Readiness</h2>
      <p class="small">Use <span class="mono">/chat</span> to confirm authenticated MCP calls before wiring external clients.</p>
      <div id="endpointSnippet" class="token-box mono">POST /mcp with Authorization: Bearer &lt;api_key&gt;</div>
      <div class="row tight">
        <button id="copyEndpointBtn" class="secondary">Copy endpoint snippet</button>
        <a class="btn secondary" href="/chat">Open MCP chat test</a>
      </div>
      <div id="overviewStatus" class="status" role="status" aria-live="polite"></div>
    </div>
    <div class="card">
      <h2>Account Shortcuts</h2>
      <p class="small">Manage keys, rotate credentials, and test tools in one flow.</p>
      <div class="row">
        <a class="btn secondary" href="/keys">Open Key Management</a>
        <a class="btn secondary" href="/chat">Open MCP Chat</a>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Security Defaults</h2>
    <p class="small">Nonce-based CSP, Turnstile-backed signup, Supabase key validation, and revocation-aware auth checks are active.</p>
  </div>
</div>`;

  const script = `
const copyEndpointBtn = document.getElementById('copyEndpointBtn');
const endpointStatus = document.getElementById('overviewStatus');
copyEndpointBtn?.addEventListener('click', async () => {
  const text = 'POST /mcp\\\\nAuthorization: Bearer <api_key>\\\\nContent-Type: application/json\\\\nAccept: application/json, text/event-stream';
  try {
    await navigator.clipboard.writeText(text);
    endpointStatus.textContent = 'Endpoint snippet copied.';
    endpointStatus.className = 'status ok';
  } catch {
    endpointStatus.textContent = 'Copy failed. Copy from the snippet manually.';
    endpointStatus.className = 'status error';
  }
});`;

  return baseShell('/', content, script, { nonce });
}

export function renderSignupPage(nonce: string, options: { turnstileSiteKey?: string } = {}): string {
  const hasTurnstile = Boolean(options.turnstileSiteKey?.trim());
  const content = `
<div class="columns">
  <div class="card">
    <h2>Create Account</h2>
    <p class="kicker">This creates your identity. Key issuance is handled on Login.</p>
    <label>Email
      <input id="email" type="email" autocomplete="email" required />
    </label>
    <label>Password
      <input id="password" type="password" autocomplete="new-password" minlength="8" required />
    </label>
    <label>Display name (optional)
      <input id="fullName" type="text" autocomplete="name" />
    </label>
    ${hasTurnstile ? `<div class="small">Complete anti-bot verification.</div><div class="cf-turnstile" data-sitekey="${options.turnstileSiteKey}"></div>` : ''}
    <button id="signupBtn">Create account</button>
    <div id="signupStatus" class="status" role="status" aria-live="polite"></div>
  </div>
  <div class="card">
    <h2>What Happens Next</h2>
    <ul class="list">
      <li>Confirm your email from Supabase.</li>
      <li>Go to <a href="/login">Login</a> to issue your first key.</li>
      <li>Use <a href="/keys">Keys</a> for future rotation.</li>
    </ul>
  </div>
</div>`;

  const script = `
const signupStatus = document.getElementById('signupStatus');
const signupBtn = document.getElementById('signupBtn');
function setStatus(message, type) {
  signupStatus.textContent = message || '';
  signupStatus.className = 'status' + (type ? ' ' + type : '');
}
function setBusy(isBusy) {
  signupBtn.disabled = isBusy;
  signupBtn.textContent = isBusy ? 'Creating...' : 'Create account';
}
async function submitSignup() {
  setStatus('Creating account...', '');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const fullName = document.getElementById('fullName').value.trim();
  if (!email || !password) {
    setStatus('Email and password are required.', 'error');
    return;
  }
  setBusy(true);
  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        fullName,
        turnstileToken: document.querySelector('input[name="cf-turnstile-response"]')?.value?.trim() || '',
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body?.error || body?.message || 'Signup failed', 'error');
      return;
    }
    setStatus(body?.message || 'If the request can be processed, check your email.', 'ok');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Signup request failed', 'error');
  } finally {
    setBusy(false);
  }
}
signupBtn.addEventListener('click', submitSignup);
['email', 'password', 'fullName'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitSignup();
  });
});`;

  return baseShell('/signup', content, script, { nonce, includeTurnstileScript: hasTurnstile });
}

export function renderLoginPage(nonce: string): string {
  const content = `
<div class="columns">
  <div class="card">
    <h2>Login</h2>
    <p class="kicker">Authenticate with your verified account. Key creation happens on the account page.</p>
    <label>Email
      <input id="email" type="email" autocomplete="email" required />
    </label>
    <label>Password
      <input id="password" type="password" autocomplete="current-password" required />
    </label>
    <button id="loginBtn">Login</button>
    <div id="loginStatus" class="status" role="status" aria-live="polite"></div>
  </div>

  <div class="card">
    <h2>Next Step After Login</h2>
    <p class="small">Go to <span class="mono">Your Account</span> to create or rotate API keys, then use those keys in MCP clients.</p>
    <div class="row">
      <a href="/keys" class="btn secondary">Go to Your Account</a>
    </div>
  </div>
</div>`;

const script = `
const statusEl = document.getElementById('loginStatus');
const loginBtn = document.getElementById('loginBtn');
function readCookie(name) {
  const key = name + '=';
  const entry = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(key));
  return entry ? decodeURIComponent(entry.slice(key.length)) : '';
}

function setStatus(message, type) {
  statusEl.textContent = message || '';
  statusEl.className = 'status' + (type ? ' ' + type : '');
}
function setBusy(isBusy) {
  loginBtn.disabled = isBusy;
  loginBtn.textContent = isBusy ? 'Logging in...' : 'Login';
}
function parseHashParams() {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}
function clearAuthHash() {
  if (!window.location.hash) return;
  const clean = window.location.pathname + window.location.search;
  window.history.replaceState({}, document.title, clean);
}
async function loginWithSupabaseHashToken() {
  const params = parseHashParams();
  const accessToken = (params.get('access_token') || '').trim();
  const tokenType = (params.get('token_type') || '').toLowerCase();
  if (!accessToken || (tokenType && tokenType !== 'bearer')) return;
  setBusy(true);
  setStatus('Finalizing email confirmation...', '');
  try {
    const csrf = readCookie('clmcp_csrf');
    const response = await fetch('/api/login/token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({ accessToken }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body?.error || 'Automatic login failed', 'error');
      return;
    }
    clearAuthHash();
    setStatus('Email confirmed. Redirecting to account...', 'ok');
    setTimeout(() => { window.location.href = '/keys'; }, 250);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Automatic login failed', 'error');
  } finally {
    setBusy(false);
  }
}
async function login() {
  setStatus('Logging in...', '');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    setStatus('Email and password are required.', 'error');
    return;
  }
  setBusy(true);
  try {
    const csrf = readCookie('clmcp_csrf');
    const response = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({
        email,
        password
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body?.error || 'Login failed', 'error');
      return;
    }
    setStatus('Logged in. Redirecting to account...', 'ok');
    setTimeout(() => { window.location.href = '/keys'; }, 250);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Login failed', 'error');
  } finally {
    setBusy(false);
  }
}
loginBtn.addEventListener('click', login);
['email', 'password'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
});
loginWithSupabaseHashToken();`;

  return baseShell('/login', content, script, { nonce });
}

export function renderKeysPage(nonce: string): string {
  const content = `
<div class="columns">
  <div class="card">
    <h2>Session and Bearer Token</h2>
    <label>API token
      <input id="apiToken" type="password" placeholder="Optional: paste MCP bearer token for token-based mode" />
    </label>
    <label class="check">
      <input id="persistToken" type="checkbox" />
      Remember token on this device (localStorage)
    </label>
    <div class="row">
      <button id="saveTokenBtn" class="secondary">Save token</button>
      <button id="loadKeysBtn">Load keys</button>
    </div>
    <div id="keysStatus" class="status" role="status" aria-live="polite"></div>
  </div>

  <div class="card">
    <h2>Create Rotation Key</h2>
    <label>Label
      <input id="newLabel" type="text" value="rotation" />
    </label>
    <label>Expires in days
      <input id="newExpiresDays" type="number" min="1" max="3650" value="30" />
    </label>
    <button id="createKeyBtn">Create key</button>
    <div id="newKeyStatus" class="status" role="status" aria-live="polite"></div>
    <div id="newKeyToken" class="token-box mono" aria-label="Newly created API token"></div>
    <button id="copyNewKeyBtn" class="secondary">Copy new key</button>
  </div>
</div>

<div class="card">
  <h2>Existing Keys</h2>
  <p class="small">Load from Supabase and revoke as needed. Works while logged in even without a pasted token.</p>
  <div id="keyList" class="small">No keys loaded yet.</div>
</div>`;

  const script = `
const tokenInput = document.getElementById('apiToken');
const keysStatus = document.getElementById('keysStatus');
const keyList = document.getElementById('keyList');
const newKeyStatus = document.getElementById('newKeyStatus');
const newKeyToken = document.getElementById('newKeyToken');
const copyNewKeyBtn = document.getElementById('copyNewKeyBtn');
const persistTokenCheckbox = document.getElementById('persistToken');
const loadKeysBtn = document.getElementById('loadKeysBtn');
const createKeyBtn = document.getElementById('createKeyBtn');
const TOKEN_LOCAL_KEY = 'courtlistenerMcpApiToken';
const TOKEN_SESSION_KEY = 'courtlistenerMcpApiTokenSession';
let lastNewKeyToken = '';

function status(el, message, type) {
  el.textContent = message || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

function getToken() { return tokenInput.value.trim(); }

function readStoredToken() {
  const localStored = localStorage.getItem(TOKEN_LOCAL_KEY) || '';
  const sessionStored = sessionStorage.getItem(TOKEN_SESSION_KEY) || '';
  const stored = sessionStored || localStored;
  persistTokenCheckbox.checked = Boolean(localStored);
  if (stored) tokenInput.value = stored;
}

function saveStoredToken() {
  const token = getToken();
  if (!token) {
    status(keysStatus, 'Token is empty.', 'error');
    return;
  }
  if (persistTokenCheckbox.checked) {
    localStorage.setItem(TOKEN_LOCAL_KEY, token);
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    status(keysStatus, 'Token saved to localStorage.', 'ok');
    return;
  }
  sessionStorage.setItem(TOKEN_SESSION_KEY, token);
  localStorage.removeItem(TOKEN_LOCAL_KEY);
  status(keysStatus, 'Token saved for this browser session only.', 'ok');
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function getCookie(name) {
  const key = name + '=';
  const entry = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(key));
  return entry ? decodeURIComponent(entry.slice(key.length)) : '';
}

async function fetchJson(url, options) {
  const csrf = getCookie('clmcp_csrf');
  const headers = { ...((options && options.headers) || {}) };
  if (csrf) headers['x-csrf-token'] = csrf;
  const response = await fetch(url, { credentials: 'same-origin', ...(options || {}), headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Request failed');
  return body;
}

function authHeaders(extraHeaders = {}) {
  const token = getToken();
  if (!token) return { ...extraHeaders };
  return { ...extraHeaders, authorization: 'Bearer ' + token };
}

async function loadKeys() {
  loadKeysBtn.disabled = true;
  status(keysStatus, 'Loading keys...', '');
  try {
    const data = await fetchJson('/api/keys', { headers: authHeaders() });
    const keys = Array.isArray(data?.keys) ? data.keys : [];
    if (!keys.length) {
      keyList.textContent = 'No keys found for this user.';
      status(keysStatus, 'Loaded keys.', 'ok');
      return;
    }

    keyList.innerHTML = keys.map((k) => {
      const active = k.is_active && !k.revoked_at ? 'active' : 'inactive';
      const expires = k.expires_at ? new Date(k.expires_at).toISOString() : 'none';
      return '<div class="key-row">' +
        '<div><div><strong>' + escapeHtml(k.label || '(no label)') + '</strong></div>' +
        '<div class="mono">id: ' + escapeHtml(k.id) + '</div>' +
        '<div class="small">status: ' + active + ' | expires: ' + escapeHtml(expires) + '</div></div>' +
        '<button data-key-id="' + escapeHtml(k.id) + '" class="secondary revoke-btn">Revoke</button></div>';
    }).join('');

    document.querySelectorAll('.revoke-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const keyId = button.getAttribute('data-key-id');
        if (!keyId) return;
        button.disabled = true;
        try {
          await fetchJson('/api/keys/revoke', {
            method: 'POST',
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({ keyId }),
          });
          await loadKeys();
          status(keysStatus, 'Key revoked.', 'ok');
        } catch (error) {
          status(keysStatus, error instanceof Error ? error.message : 'Revoke failed', 'error');
        } finally {
          button.disabled = false;
        }
      });
    });

    status(keysStatus, 'Loaded keys.', 'ok');
  } catch (error) {
    status(keysStatus, error instanceof Error ? error.message : 'Failed to load keys', 'error');
  } finally {
    loadKeysBtn.disabled = false;
  }
}

async function createKey() {
  createKeyBtn.disabled = true;
  createKeyBtn.textContent = 'Creating...';
  status(newKeyStatus, 'Creating key...', '');
  newKeyToken.textContent = '';
  lastNewKeyToken = '';
  const label = document.getElementById('newLabel').value.trim();
  const expiresDays = Number.parseInt(document.getElementById('newExpiresDays').value, 10);
  try {
    const data = await fetchJson('/api/keys', {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ label, expiresDays: Number.isFinite(expiresDays) && expiresDays > 0 ? expiresDays : 30 }),
    });
    if (data?.api_key?.token) {
      lastNewKeyToken = data.api_key.token;
      newKeyToken.textContent = lastNewKeyToken;
      status(newKeyStatus, 'New key created. Save it now.', 'ok');
      await loadKeys();
      return;
    }
    status(newKeyStatus, 'Key created, but token missing in response.', 'error');
  } catch (error) {
    status(newKeyStatus, error instanceof Error ? error.message : 'Create key failed', 'error');
  } finally {
    createKeyBtn.disabled = false;
    createKeyBtn.textContent = 'Create key';
  }
}

document.getElementById('saveTokenBtn').addEventListener('click', saveStoredToken);
loadKeysBtn.addEventListener('click', loadKeys);
createKeyBtn.addEventListener('click', createKey);
copyNewKeyBtn.addEventListener('click', async () => {
  if (!lastNewKeyToken) {
    status(newKeyStatus, 'Create a key first to copy it.', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(lastNewKeyToken);
    status(newKeyStatus, 'New key copied.', 'ok');
  } catch {
    status(newKeyStatus, 'Copy failed. Copy key manually.', 'error');
  }
});
readStoredToken();`;

  return baseShell('/keys', content, script, { nonce });
}

export function renderChatPage(nonce: string): string {
  const content = `
<div class="columns">
  <div class="card">
    <h2>Connect MCP Session</h2>
    <p class="kicker">This sends authenticated calls directly to <span class="mono">/mcp</span>.</p>
    <label>Bearer token
      <input id="chatToken" type="password" placeholder="Paste MCP bearer token" />
    </label>
    <label class="check">
      <input id="chatPersistToken" type="checkbox" />
      Remember token on this device (localStorage)
    </label>
    <div class="row">
      <button id="connectBtn">Connect MCP Session</button>
      <button id="saveChatTokenBtn" class="secondary">Save token</button>
      <button id="clearTranscriptBtn" class="secondary">Clear transcript</button>
    </div>
    <div id="connectStatus" class="status" role="status" aria-live="polite"></div>
  </div>

  <div class="card">
    <h2>Tool Call</h2>
    <label>Tool
      <select id="toolName">
        <option value="search_opinions">search_opinions</option>
        <option value="search_cases">search_cases</option>
        <option value="lookup_citation">lookup_citation</option>
      </select>
    </label>
    <label>Prompt
      <input id="chatPrompt" type="text" placeholder="Example: Roe v Wade abortion rights case" />
    </label>
    <button id="sendBtn">Send</button>
    <div id="chatStatus" class="status" role="status" aria-live="polite"></div>
  </div>
</div>
<div class="card">
  <h2>Transcript</h2>
  <div id="transcript" class="mono small">No messages yet.</div>
</div>`;

  const script = `
const chatTokenInput = document.getElementById('chatToken');
const connectStatus = document.getElementById('connectStatus');
const chatStatus = document.getElementById('chatStatus');
const transcript = document.getElementById('transcript');
const toolNameInput = document.getElementById('toolName');
const chatPromptInput = document.getElementById('chatPrompt');
const chatPersistTokenCheckbox = document.getElementById('chatPersistToken');
const connectBtn = document.getElementById('connectBtn');
const sendBtn = document.getElementById('sendBtn');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const TOKEN_LOCAL_KEY = 'courtlistenerMcpApiToken';
const TOKEN_SESSION_KEY = 'courtlistenerMcpApiTokenSession';

let mcpSessionId = '';
let rpcId = 1;

function setStatus(el, message, type) {
  el.textContent = message || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

function appendTranscript(role, text) {
  const raw = String(text);
  const clipped = raw.length > 12000 ? raw.slice(0, 12000) + '\\n... [truncated]' : raw;
  const line = document.createElement('div');
  line.style.marginBottom = '10px';
  line.innerHTML = '<strong>' + role + ':</strong> ' + clipped.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (transcript.textContent === 'No messages yet.') transcript.textContent = '';
  transcript.appendChild(line);
}

function getToken() { return chatTokenInput.value.trim(); }

function loadSavedToken() {
  const localStored = localStorage.getItem(TOKEN_LOCAL_KEY) || '';
  const sessionStored = sessionStorage.getItem(TOKEN_SESSION_KEY) || '';
  const saved = sessionStored || localStored;
  chatPersistTokenCheckbox.checked = Boolean(localStored);
  if (saved) chatTokenInput.value = saved;
}

function saveToken() {
  const token = getToken();
  if (!token) {
    setStatus(connectStatus, 'Token is empty.', 'error');
    return;
  }
  if (chatPersistTokenCheckbox.checked) {
    localStorage.setItem(TOKEN_LOCAL_KEY, token);
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    setStatus(connectStatus, 'Token saved to localStorage.', 'ok');
    return;
  }
  sessionStorage.setItem(TOKEN_SESSION_KEY, token);
  localStorage.removeItem(TOKEN_LOCAL_KEY);
  setStatus(connectStatus, 'Token saved for this browser session only.', 'ok');
}

async function readMcpJson(response) {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const dataLines = trimmed.split('\\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
  if (!dataLines.length) return {};
  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function mcpCall(method, params) {
  const token = getToken();
  if (!token) throw new Error('Missing bearer token');

  const headers = {
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
  };
  if (mcpSessionId) headers['mcp-session-id'] = mcpSessionId;

  const response = await fetch('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('MCP call failed (' + response.status + '): ' + body);
  }

  const nextSession = response.headers.get('mcp-session-id');
  if (nextSession) mcpSessionId = nextSession;
  return readMcpJson(response);
}

async function connectMcp() {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  setStatus(connectStatus, 'Connecting...', '');
  try {
    const result = await mcpCall('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'courtlistener-web-chat', version: '1.0.0' },
    });
    setStatus(connectStatus, 'Connected. Session: ' + (mcpSessionId || 'none'), 'ok');
    appendTranscript('system', 'MCP initialized');
    appendTranscript('system', JSON.stringify(result?.result || result));
  } catch (error) {
    setStatus(connectStatus, error instanceof Error ? error.message : 'Connect failed', 'error');
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect MCP Session';
  }
}

function getToolArguments(toolName, prompt) {
  if (toolName === 'lookup_citation') return { citation: prompt };
  return { query: prompt, page_size: 5, order_by: 'score desc' };
}

async function sendMessage() {
  const prompt = chatPromptInput.value.trim();
  const toolName = toolNameInput.value;
  if (!prompt) {
    setStatus(chatStatus, 'Enter a message.', 'error');
    return;
  }
  if (!mcpSessionId) {
    setStatus(chatStatus, 'Connect MCP session first.', 'error');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  setStatus(chatStatus, 'Calling tool...', '');
  appendTranscript('user', prompt);
  try {
    const result = await mcpCall('tools/call', { name: toolName, arguments: getToolArguments(toolName, prompt) });
    appendTranscript('assistant', JSON.stringify(result?.result || result));
    setStatus(chatStatus, 'Response received.', 'ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool call failed';
    appendTranscript('assistant', message);
    setStatus(chatStatus, message, 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

connectBtn.addEventListener('click', connectMcp);
sendBtn.addEventListener('click', sendMessage);
document.getElementById('saveChatTokenBtn').addEventListener('click', saveToken);
clearTranscriptBtn.addEventListener('click', () => {
  transcript.textContent = 'No messages yet.';
});
chatPromptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') sendMessage();
});
loadSavedToken();`;

  return baseShell('/chat', content, script, { nonce });
}
