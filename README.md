# CourtListener MCP Server

Production-ready Model Context Protocol (MCP) server for CourtListener legal
data. It exposes legal research tools over MCP (`stdio` and HTTP), with
deployment-ready support for local use, self-hosted remote deployments, hosted
Cloudflare Workers OAuth, structured logging, caching, and CI testing.

## What This Repository Provides

- MCP server built on `@modelcontextprotocol/sdk`
- 49 legal research tools backed by CourtListener API v4
- Three deployment contracts: local `stdio`, self-hosted remote HTTP, and hosted
  remote OAuth
- Hosted MCP OAuth transport via Cloudflare Workers OAuth Provider
- Worker-owned browser auth handoff for hosted sign-in and approval
- Built-in health checks and metrics endpoints for operations
- Prebuilt MCP client config examples in [`configs/`](./configs)

## Repository Structure

- `src/` core server, tool handlers, API integration, worker runtime
- `configs/` ready-to-use MCP client configs for local, self-hosted, and hosted
  clients
- `docs/` deployment, testing, and operational documentation
- `test/` unit/integration/e2e test suites
- `scripts/` deployment helpers, diagnostics, inspector tooling, key management

## Quick Start

### 1. Use the hosted remote endpoint (fastest)

Best for ChatGPT, Claude, Codex, and other remote clients that should not run
the server locally:

```json
{
  "mcpServers": {
    "courtlistener": {
      "url": "https://courtlistener-mcp.<subdomain>.workers.dev/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### 2. Run locally from a checkout

Best for privacy, local development, and bring-your-own-auth setups. The npm
package is not currently published, so the local `stdio` server should be run
from this repository checkout:

- Download ZIP: https://github.com/blakeox/courtlistener-mcp/archive/refs/heads/main.zip
- Download tar.gz: https://github.com/blakeox/courtlistener-mcp/archive/refs/heads/main.tar.gz

```bash
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp
pnpm install
pnpm build
node dist/index.js --setup
```

Or run it directly:

```bash
node dist/index.js
```

If you want a local shell command after building:

```bash
npm link
courtlistener-mcp --setup
```

### 3. Self-host the HTTP runtime from source

```bash
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp
pnpm install
pnpm build
node dist/http.js
```

### 4. Self-host with Docker

```bash
cp .env.production .env
docker compose -f docker-compose.prod.yml up -d
```

## Publishing to npm

This repository is configured to publish from `.github/workflows/release.yml` when you push a
version tag such as `v1.0.3`.

You have two supported auth paths:

1. **Repository secret**: create an npm publish token and store it as the GitHub Actions secret
   `NPM_TOKEN`.
2. **Trusted publishing**: connect the npm package to this GitHub repository and let npm trust
   GitHub Actions OIDC, with no token stored in GitHub.

Once one of those is configured, publish with:

```bash
git tag v1.0.3
git push origin v1.0.3
```

## Deployment Modes

### 1. Local mode (`stdio`)

- Run the MCP server on the same machine as the client
- No hosted auth required
- Best for privacy-sensitive workflows, local development, and
  bring-your-own-hosting

### 2. Self-hosted remote mode

- Deploy the HTTP/streamable HTTP runtime on your own infrastructure
- Bring your own auth if you need it (`OIDC_*`, service token, proxy auth, etc.)
- Best for teams that want remote access without using the hosted CourtListener
  endpoint

### 3. Hosted remote mode

- Use the CourtListener Cloudflare Worker as the remote MCP endpoint
- The Worker is the MCP OAuth server and exposes `/mcp`, `/authorize`, `/token`,
  `/register`, and discovery metadata
- The Worker also owns the browser auth handoff routes on the same origin
  (`/auth/start`, `/auth/callback`, `/auth/approve`, `/auth/logout`)
- Keep Logto as the current upstream hosted identity provider if you want a
  managed OIDC tenant; the Worker-facing contract stays generic OIDC
- Best for ChatGPT, Claude, Codex, and browser-native remote clients

## MCP Client Configuration

Prebuilt configs are provided in [`configs/`](./configs):

- `local-stdio.json`
- `self-hosted-remote-http.json`
- `hosted-remote-claude.json`
- `hosted-oauth-chatgpt.json`
- `hosted-oauth-codex.json`
- `claude-desktop.json`
- `claude-desktop-remote.json`
- `cursor.json`
- `continue-dev.json`
- `vscode-copilot.json`
- `zed.json`
- `openai-chatgpt.json`
- `codex.json`

Explicit contract examples:

- [`configs/local-stdio.json`](./configs/local-stdio.json) for local `stdio`
- [`configs/self-hosted-remote-http.json`](./configs/self-hosted-remote-http.json)
  for self-hosted remote HTTP
- [`configs/hosted-remote-claude.json`](./configs/hosted-remote-claude.json) for
  hosted remote use with Claude-style clients
- [`configs/hosted-oauth-chatgpt.json`](./configs/hosted-oauth-chatgpt.json) for
  hosted remote OAuth with ChatGPT-style clients
- [`configs/hosted-oauth-codex.json`](./configs/hosted-oauth-codex.json) for
  hosted remote OAuth with Codex-style clients

Legacy filenames are still shipped for compatibility:

- [`configs/codex.json`](./configs/codex.json) for direct HTTP transport
- [`configs/openai-chatgpt.json`](./configs/openai-chatgpt.json) for hosted
  OAuth
- [`configs/claude-desktop-remote.json`](./configs/claude-desktop-remote.json)
  for hosted remote use
- [`mcp-config.json`](./mcp-config.json) for local/bridge variants used in
  development

## Tool Catalog (33)

### Search and discovery

- `search_opinions`
- `search_cases`
- `advanced_search`
- `smart_search`

### Cases and opinions

- `get_case_details`
- `get_related_cases`
- `get_opinion_text`
- `lookup_citation`
- `analyze_case_authorities`
- `analyze_legal_argument`
- `get_citation_network`
- `get_comprehensive_case_analysis`

### Courts and judges

- `list_courts`
- `get_judges`
- `get_judge`
- `get_comprehensive_judge_profile`

### Dockets and RECAP

- `get_dockets`
- `get_docket`
- `get_docket_entries`
- `get_recap_documents`
- `get_recap_document`
- `get_enhanced_recap_data`

### Financial and parties

- `get_financial_disclosures`
- `get_financial_disclosure`
- `get_financial_disclosure_details`
- `get_parties_and_attorneys`

### Analytics and monitoring

- `get_visualization_data`
- `get_bulk_data`
- `get_bankruptcy_data`
- `manage_alerts`
- `validate_citations`

### Oral arguments

- `get_oral_arguments`
- `get_oral_argument`

For authoritative tool schema/arguments, use MCP `tools/list` from your client.

## Local Development

### Prerequisites

- Node.js 18+
- `pnpm`
- CourtListener API token (recommended for higher limits)

### Install and build

```bash
pnpm install
pnpm build
```

### Run

```bash
pnpm run mcp
```

### Diagnostics

```bash
pnpm run doctor
pnpm run cloudflare:check
pnpm run ci:auth-release-gate
```

## Deployment (Cloudflare Workers)

```bash
pnpm install
wrangler secret put COURTLISTENER_API_KEY
wrangler secret put MCP_UI_SESSION_SECRET
wrangler secret put OIDC_ISSUER
wrangler secret put OIDC_AUDIENCE
wrangler secret put MCP_OAUTH_REGISTRATION_TOKEN_SECRET
# Optional shared token auth
wrangler secret put MCP_AUTH_TOKEN
# Optional: set MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS in wrangler vars (defaults to 86400)
# Optional: set MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true only if intentionally trusting Cloudflare Access assertions/identity headers
pnpm run cloudflare:check
pnpm run cloudflare:deploy
```

Endpoints after deploy:

- `GET /health`
- `POST /mcp` (primary MCP endpoint)
- `GET /sse` (legacy SSE compatibility path)
- `GET/POST /authorize`
- `POST /token`
- `POST /register`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`

## Web UX Wave (SPA)

- ✅ **UX15–UX19 complete**: accessibility AA hardening, design-system
  consolidation, performance UX optimizations, and dark-mode visual parity are
  now shipped.
- ✅ **Validation safety pass**: `pnpm run test:spa`, `pnpm run build`, and
  `pnpm run typecheck` are the required UX-wave release gate.
- **Control Center** (`/app/control-center`): live session/auth/key/runtime
  posture with a guided MCP checklist.
- **Protocol explorer**: initialize/tool/resource/prompt discovery surfaced
  directly in Control Center metadata panels.
- **Async operator workspace** (`/app/playground`): queue async tool calls
  (`__mcp_async`), monitor lifecycle state, deep-link job details, cancel/retry,
  and fetch results.
- **Recovery UX**: cross-page recovery status banners plus safe fallback routes
  back to login, keys, and Control Center.

## Auth Model by Deployment Mode

### Hosted remote mode: Worker OAuth

Cloudflare OAuth is the primary hosted auth path for remote MCP routes.

- The Worker is the OAuth authorization/resource server for MCP clients
- The Worker serves the minimal auth handoff routes on the same origin
- Remote MCP clients connect directly to the Worker

- OAuth endpoints:
  - `GET/POST /authorize`
  - `POST /token`
  - `POST /register`
- Discovery endpoints:
  - `GET /.well-known/oauth-authorization-server`
  - `GET /.well-known/oauth-protected-resource`
- `/authorize` resolves identity from:
  - Signed UI session (`clmcp_ui`) when present
  - Cloudflare Access identity headers (`cf-access-authenticated-user-id` or
    `cf-access-authenticated-user-email`) only when
    `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true`
  - `MCP_OAUTH_DEV_USER_ID` only when `MCP_ALLOW_DEV_FALLBACK=true` (development
    fallback only; unsafe outside controlled dev and blocked by startup
    invariants when `NODE_ENV=production`)
- If unresolved, `/authorize` redirects to same-origin
  `/auth/start?return_to=<authorize_url>` when Worker-native hosted auth config
  is present
- `POST /api/session/bootstrap` remains the Worker-native bearer-to-session
  bootstrap endpoint for trusted same-origin/session handoff cases
- Same-origin Worker auth handoff:
  - `GET /auth/start`
  - `GET /auth/callback`
  - `GET/POST /auth/approve`
  - `GET/POST /auth/logout` (`GET` renders a confirmation form; `POST` performs
    the logout)
  - Worker-native hosted auth expects `OIDC_ISSUER`, `MCP_UI_SESSION_SECRET`,
    and a complete upstream OIDC client pair
  - Preferred Worker-native pair: `MCP_AUTH_OIDC_CLIENT_ID` +
    `MCP_AUTH_OIDC_CLIENT_SECRET`
  - Migration fallback pair: `LOGTO_APP_ID` + `LOGTO_APP_SECRET` when the
    Worker-native pair is entirely absent
  - Partial `MCP_AUTH_OIDC_CLIENT_*` config fails closed and does not fall back
    to `LOGTO_APP_*`
  - Dynamic client-registration management tokens should use a dedicated
    `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`; otherwise they fall back to
    `MCP_UI_SESSION_SECRET` or `COURTLISTENER_API_KEY`
  - `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS` defaults to 86400 and should be
    set explicitly for hosted deployments
  - Browser-session authorization now stops at an explicit same-site approval
    screen before the Worker completes `/authorize`
  - Hosted-auth probe responses emit `X-Hosted-Auth-*` readiness headers with a
    concrete reason, coarse failure category, stable low-cardinality
    signal/failure flags, stable flow correlation ID, flow outcome, credential
    source, and config-error count
  - Route-level rate limit controls:
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`
- Usage dashboard endpoint:
  - `GET /api/usage` returns per-user counters (`totalRequests`,
    `dailyRequests`, `byRoute`, `lastSeenAt`)

### Self-hosted remote mode: bring your own auth

- Optional OIDC bearer validation:
  - `OIDC_ISSUER`
  - `OIDC_AUDIENCE`
  - `OIDC_JWKS_URL`
  - `OIDC_REQUIRED_SCOPE`
- Optional trusted Cloudflare Access header acceptance:
  - `MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION=true` only when the Worker is
    deployed behind Cloudflare Access or another edge that strips/spoof-proofs
    `CF-Access-Jwt-Assertion`
  - `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true` only when `/authorize`
    is deployed behind Cloudflare Access or another edge that
    strips/spoof-proofs `cf-access-authenticated-user-*`
  - `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` is required by deploy checks
    before either scoped trust flag is allowed
  - Without those explicit per-surface flags, the Worker ignores
    `CF-Access-Jwt-Assertion` and `cf-access-authenticated-user-*`
  - `MCP_TRUST_CLOUDFLARE_ACCESS_HEADERS` is deprecated and ignored
- Optional service-token path:
  - `MCP_AUTH_TOKEN`
  - `MCP_SERVICE_TOKEN_HEADER`

Use this mode when you want the CourtListener MCP runtime but need to keep
identity, secrets, and deployment policy inside your own infrastructure.

### Local mode: no hosted auth required

- Local `stdio` clients do not need the hosted OAuth surface
- Users typically provide their own `COURTLISTENER_API_KEY`
- This is the simplest path for desktop-local MCP clients and development

### Removed Legacy UI/Auth Endpoints

The following legacy UI endpoints are disabled in the hard cutover and return
`410`:

- `/api/login*`
- `/api/logout*`
- `/api/signup*`
- `/api/password*`
- `/api/keys*`
- `/oauth/consent`

Canonical hosted OAuth contract values (paths, grants, response types, scopes,
PKCE methods, priority clients) live in `src/auth/oauth-contract.ts`.

### Hosted auth rollout checks

Before promoting a hosted Worker deploy, verify:

- `pnpm run cloudflare:check` is clean except for intentional deprecation
  warnings
- `https://<worker>/auth/start?continue=1` returns `302`
- a real `/authorize` browser journey reaches `/auth/approve` before OAuth
  completion
- DCR management token rotation is independent of UI session rotation by setting
  `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`
- any Cloudflare Access trust flags are paired with
  `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true`

## Runtime and Observability

When metrics are enabled, local server endpoints include:

- `GET http://localhost:3001/health`
- `GET http://localhost:3001/metrics`
- `GET http://localhost:3001/cache`

Useful runtime variables:

- `CACHE_ENABLED`
- `CACHE_TTL`
- `LOG_LEVEL`
- `LOG_FORMAT`
- `METRICS_ENABLED`
- `METRICS_PORT`
- `NODE_ENV`

## Testing

### Core tests

```bash
pnpm run test:unit
pnpm run test:integration
# install Chromium once before running the default browser-inclusive suite
pnpm exec playwright install chromium
# default repository gate: unit + integration + targeted SPA auth Vitest + auth Playwright
pnpm test
pnpm run coverage
pnpm run coverage:check
```

### MCP protocol and inspector

```bash
pnpm run test:mcp
pnpm run ci:test-inspector:enhanced
pnpm run ci:test-inspector:enhanced:extended
pnpm run ci:test-inspector:performance
```

### Release hardening performance gates

```bash
pnpm run ci:load-profile-suite -- --light --base-url http://127.0.0.1:3002
pnpm run ci:perf-gate -- baseline.json current.json
pnpm run ci:hardening:soak-leak-checks -- --light --base-url http://127.0.0.1:3002
pnpm run ci:release-readiness-gate -- --light --base-url http://127.0.0.1:3002
```

CI runs these gates in warn mode for pull requests/non-protected branches, and
strict fail mode for `main`/`master`/`release/*` and `v*` tags.

### Optional local GitHub Actions simulation

```bash
act -W .github/workflows/ci.yml
```

## Security and Contribution

- Security policy: [`SECURITY.md`](./SECURITY.md)
- Contribution guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Architecture details: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## License

MIT. See [`LICENSE`](./LICENSE).
