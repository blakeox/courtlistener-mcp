function pageStyles(): string {
  return `
:root {
  --bg: #f6efe5;
  --bg-accent: #ead9c5;
  --ink: #102a43;
  --ink-muted: #4e6477;
  --brand: #0b6e4f;
  --brand-strong: #084c3a;
  --card: #fffdfa;
  --line: #d7c7b2;
  --danger: #b83232;
  --ok: #1f7a4d;
  --shadow: 0 18px 40px rgba(16, 42, 67, 0.12);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(1000px 500px at 10% -20%, #f9d6a7, transparent 65%),
    radial-gradient(900px 400px at 110% 10%, #c8e2ff, transparent 60%),
    linear-gradient(180deg, var(--bg) 0%, #f8f3ea 45%, #f4ece1 100%);
  min-height: 100vh;
}
main {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 56px;
}
.hero {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: linear-gradient(145deg, #fff9ef 0%, #f2f8ff 100%);
  padding: 22px;
  box-shadow: var(--shadow);
}
.hero h1 {
  margin: 0 0 10px;
  font-size: clamp(1.6rem, 3.8vw, 2.25rem);
  letter-spacing: 0.01em;
}
.hero p {
  margin: 0;
  color: var(--ink-muted);
  line-height: 1.55;
}
.nav {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.nav a {
  text-decoration: none;
  border: 1px solid var(--line);
  padding: 8px 14px;
  border-radius: 999px;
  color: var(--ink);
  background: #fff;
  font-weight: 600;
}
.nav a.active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
.grid {
  margin-top: 20px;
  display: grid;
  gap: 14px;
}
.card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--card);
  padding: 16px;
  box-shadow: 0 8px 20px rgba(16, 42, 67, 0.08);
}
h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
}
label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}
input, select {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid #c8b6a1;
  border-radius: 10px;
  background: #fff;
  font: inherit;
}
button {
  margin-top: 10px;
  border: 0;
  border-radius: 10px;
  padding: 10px 14px;
  font: inherit;
  font-weight: 700;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}
button.secondary {
  background: #fff;
  color: var(--ink);
  border: 1px solid var(--line);
}
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.status {
  margin-top: 10px;
  min-height: 20px;
  font-weight: 600;
}
.status.error { color: var(--danger); }
.status.ok { color: var(--ok); }
.key-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
  margin-top: 8px;
  background: #fff;
}
.small { color: var(--ink-muted); font-size: 0.92rem; }
.footer-note { margin-top: 16px; color: var(--ink-muted); font-size: 0.92rem; }
@media (max-width: 640px) {
  .key-row { grid-template-columns: 1fr; }
}
`;
}

function baseShell(
  activePath: string,
  content: string,
  inlineScript = '',
  options: { includeTurnstileScript?: boolean } = {},
): string {
  const nav = [
    { path: '/', label: 'Overview' },
    { path: '/signup', label: 'Sign Up' },
    { path: '/keys', label: 'Manage Keys' },
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CourtListener MCP Control Plane</title>
    <style>${pageStyles()}</style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>CourtListener MCP Access Portal</h1>
        <p>Issue and manage Supabase-backed API keys for the MCP endpoint. Keep your bearer token private and rotate keys regularly.</p>
        <nav class="nav">
          ${nav
            .map(
              (item) =>
                `<a href="${item.path}" class="${activePath === item.path ? 'active' : ''}">${item.label}</a>`,
            )
            .join('')}
        </nav>
      </section>
      <section class="grid">
        ${content}
      </section>
      <p class="footer-note">MCP endpoint: <span class="mono">/mcp</span> | Health: <span class="mono">/health</span></p>
    </main>
    ${
      options.includeTurnstileScript
        ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
        : ''
    }
    <script>${inlineScript}</script>
  </body>
</html>`;
}

export function renderOverviewPage(): string {
  const content = `
<div class="card">
  <h2>How this works</h2>
  <p class="small">1) Create an account on the Sign Up page. 2) Save the returned API key once. 3) Use that key in your MCP client as a bearer token. 4) Use Manage Keys to rotate/revoke.</p>
  <p class="small">For production clients, point to <span class="mono">https://courtlistenermcp.blakeoxford.com/mcp</span>.</p>
</div>
<div class="card">
  <h2>Security checklist</h2>
  <p class="small">Use one key per client integration, set expiration, and revoke unused keys. Avoid sharing keys across teams or environments.</p>
</div>`;
  return baseShell('/', content);
}

export function renderSignupPage(options: { turnstileSiteKey?: string } = {}): string {
  const hasTurnstile = Boolean(options.turnstileSiteKey?.trim());
  const content = `
<div class="card">
  <h2>Create account and first API key</h2>
  <label>Email
    <input id="email" type="email" autocomplete="email" required />
  </label>
  <label>Password
    <input id="password" type="password" autocomplete="new-password" minlength="8" required />
  </label>
  <label>Display name (optional)
    <input id="fullName" type="text" autocomplete="name" />
  </label>
  <label>Initial key label
    <input id="label" type="text" value="primary" />
  </label>
  <label>Expires in days
    <input id="expiresDays" type="number" min="1" max="3650" value="90" />
  </label>
  ${
    hasTurnstile
      ? `<div class="small">Complete verification before creating an account.</div>
         <div class="cf-turnstile" data-sitekey="${options.turnstileSiteKey}"></div>`
      : ''
  }
  <button id="signupBtn">Create account</button>
  <div id="signupStatus" class="status"></div>
</div>
<div class="card">
  <h2>Issued API key</h2>
  <p class="small">This raw token is shown once.</p>
  <div id="issuedToken" class="mono"></div>
</div>`;

  const script = `
const signupStatus = document.getElementById('signupStatus');
const issuedToken = document.getElementById('issuedToken');
const signupBtn = document.getElementById('signupBtn');

function setStatus(message, type) {
  signupStatus.textContent = message || '';
  signupStatus.className = 'status' + (type ? ' ' + type : '');
}

signupBtn.addEventListener('click', async () => {
  setStatus('Creating account...', '');
  issuedToken.textContent = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const fullName = document.getElementById('fullName').value.trim();
  const label = document.getElementById('label').value.trim();
  const expiresDaysRaw = document.getElementById('expiresDays').value;
  const expiresDays = Number.parseInt(expiresDaysRaw, 10);

  if (!email || !password) {
    setStatus('Email and password are required.', 'error');
    return;
  }

  const payload = {
    email,
    password,
    fullName,
    label,
    expiresDays: Number.isFinite(expiresDays) && expiresDays > 0 ? expiresDays : 90,
    turnstileToken:
      document.querySelector('input[name=\"cf-turnstile-response\"]')?.value?.trim() || '',
  };

  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    if (!response.ok) {
      setStatus(body?.error || 'Signup failed', 'error');
      return;
    }

    const token = body?.api_key?.token;
    if (typeof token === 'string' && token.length > 0) {
      localStorage.setItem('courtlistenerMcpApiToken', token);
      issuedToken.textContent = token;
      setStatus('Account created. Token saved in browser localStorage for key management.', 'ok');
      return;
    }

    setStatus('Signup succeeded but token was missing from response.', 'error');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Signup request failed', 'error');
  }
});`;

  return baseShell('/signup', content, script, { includeTurnstileScript: hasTurnstile });
}

export function renderKeysPage(): string {
  const content = `
<div class="card">
  <h2>Current bearer token</h2>
  <label>API token
    <input id="apiToken" type="password" placeholder="Paste MCP bearer token" />
  </label>
  <div class="row">
    <button id="saveTokenBtn" class="secondary">Save token locally</button>
    <button id="loadKeysBtn">Load keys</button>
  </div>
  <div id="keysStatus" class="status"></div>
</div>
<div class="card">
  <h2>Create a new key</h2>
  <label>Label
    <input id="newLabel" type="text" value="rotation" />
  </label>
  <label>Expires in days
    <input id="newExpiresDays" type="number" min="1" max="3650" value="90" />
  </label>
  <button id="createKeyBtn">Create key</button>
  <div id="newKeyStatus" class="status"></div>
  <div id="newKeyToken" class="mono"></div>
</div>
<div class="card">
  <h2>Existing keys</h2>
  <div id="keyList" class="small">No keys loaded yet.</div>
</div>`;

  const script = `
const tokenInput = document.getElementById('apiToken');
const keysStatus = document.getElementById('keysStatus');
const keyList = document.getElementById('keyList');
const newKeyStatus = document.getElementById('newKeyStatus');
const newKeyToken = document.getElementById('newKeyToken');

function status(el, message, type) {
  el.textContent = message || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

function getToken() {
  return tokenInput.value.trim();
}

function readStoredToken() {
  const stored = localStorage.getItem('courtlistenerMcpApiToken') || '';
  if (stored) tokenInput.value = stored;
}

function saveStoredToken() {
  const token = getToken();
  if (!token) {
    status(keysStatus, 'Token is empty.', 'error');
    return;
  }
  localStorage.setItem('courtlistenerMcpApiToken', token);
  status(keysStatus, 'Token saved locally in this browser.', 'ok');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Request failed');
  }
  return body;
}

async function loadKeys() {
  const token = getToken();
  if (!token) {
    status(keysStatus, 'Provide your bearer token first.', 'error');
    return;
  }

  status(keysStatus, 'Loading keys...', '');
  try {
    const data = await fetchJson('/api/keys', {
      headers: { authorization: 'Bearer ' + token },
    });

    const keys = Array.isArray(data?.keys) ? data.keys : [];
    if (!keys.length) {
      keyList.textContent = 'No keys found for this user.';
      status(keysStatus, 'Loaded keys.', 'ok');
      return;
    }

    keyList.innerHTML = keys
      .map((k) => {
        const active = k.is_active && !k.revoked_at ? 'active' : 'inactive';
        const expires = k.expires_at ? new Date(k.expires_at).toISOString() : 'none';
        return '<div class="key-row">' +
          '<div>' +
          '<div><strong>' + escapeHtml(k.label || '(no label)') + '</strong></div>' +
          '<div class="mono">id: ' + escapeHtml(k.id) + '</div>' +
          '<div class="small">status: ' + active + ' | expires: ' + escapeHtml(expires) + '</div>' +
          '</div>' +
          '<button data-key-id="' + escapeHtml(k.id) + '" class="secondary revoke-btn">Revoke</button>' +
          '</div>';
      })
      .join('');

    document.querySelectorAll('.revoke-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const keyId = button.getAttribute('data-key-id');
        if (!keyId) return;
        button.disabled = true;
        try {
          await fetchJson('/api/keys/revoke', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: 'Bearer ' + token,
            },
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
  }
}

async function createKey() {
  const token = getToken();
  if (!token) {
    status(newKeyStatus, 'Provide your bearer token first.', 'error');
    return;
  }

  status(newKeyStatus, 'Creating key...', '');
  newKeyToken.textContent = '';

  const label = document.getElementById('newLabel').value.trim();
  const expiresDaysRaw = document.getElementById('newExpiresDays').value;
  const expiresDays = Number.parseInt(expiresDaysRaw, 10);

  try {
    const data = await fetchJson('/api/keys', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        label,
        expiresDays: Number.isFinite(expiresDays) && expiresDays > 0 ? expiresDays : 90,
      }),
    });

    if (data?.api_key?.token) {
      newKeyToken.textContent = data.api_key.token;
      status(newKeyStatus, 'New key created. Save it now.', 'ok');
      await loadKeys();
    } else {
      status(newKeyStatus, 'Key created, but token missing in response.', 'error');
    }
  } catch (error) {
    status(newKeyStatus, error instanceof Error ? error.message : 'Create key failed', 'error');
  }
}

document.getElementById('saveTokenBtn').addEventListener('click', saveStoredToken);
document.getElementById('loadKeysBtn').addEventListener('click', loadKeys);
document.getElementById('createKeyBtn').addEventListener('click', createKey);

readStoredToken();`;

  return baseShell('/keys', content, script);
}
