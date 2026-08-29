# CourtListener MCP Server

Production-ready Model Context Protocol (MCP) server for CourtListener legal
data. It exposes legal research tools over MCP (`stdio` and Cloudflare Worker
Streamable HTTP), with deployment-ready hosted OAuth, structured logging,
caching, and CI testing.

## What This Repository Provides

- MCP v2 server built on `@modelcontextprotocol/server`
- 52 governed tools, including three asynchronous job-control tools backed by
  CourtListener API v4
- Two deployment contracts: local `stdio` and hosted Cloudflare Worker remote
  OAuth
- Hosted MCP OAuth transport via Cloudflare Workers OAuth Provider
- Worker-owned browser auth handoff for hosted sign-in and approval
- Optional queue-backed async MCP jobs for durable hosted execution
- Optional Cloudflare Analytics Engine telemetry for route, DO, Turnstile, and
  async job signals
- Optional Turnstile enforcement on session bootstrap and AI chat routes
- Built-in health checks and metrics endpoints for operations
- Prebuilt MCP client config examples in [`configs/`](./configs)

## Repository Structure

- `src/` core server, tool handlers, API integration, worker runtime
- `src/web-spa/` browser portal (React SPA, **Tailwind CSS v4**); see
  [`src/web-spa/DESIGN.md`](src/web-spa/DESIGN.md)
- `configs/` ready-to-use MCP client configs for local, self-hosted, and hosted
  clients
- `docs/` deployment, testing, and operational documentation
- `test/` unit/integration/e2e test suites
- `scripts/` deployment helpers, diagnostics, key management

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

- Download ZIP:
  https://github.com/blakeox/courtlistener-mcp/archive/refs/heads/main.zip
- Download tar.gz:
  https://github.com/blakeox/courtlistener-mcp/archive/refs/heads/main.tar.gz

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

### 3. Develop or self-host the Cloudflare Workers topology

```bash
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp
pnpm install
pnpm build
pnpm run dev:workers
```

`dev:workers` starts the local Edge and MCP Workers with their service binding.
For a deployed self-hosted topology, authenticate Wrangler and use the
Cloudflare release workflow after configuring the required Worker secrets; the
production source of truth is the `wrangler.*.jsonc` configuration.

### Optional NUC validation runner

Non-browser validation, MCP, remote, and performance jobs can use a dedicated
trusted Linux NUC by setting the repository variable `CI_LINUX_RUNNER` to this
JSON array:

```text
["self-hosted","linux","x64","nuc","courtlistener-mcp"]
```

Until that variable is set and a runner with all five labels is registered,
these jobs automatically use `ubuntu-latest`. Browser-dependent validation and
security scanning remain on GitHub-hosted runners because they require hosted
system packages and security-tool artifact assumptions. Keep the NUC dedicated
to this repository and do not use it for untrusted public pull-request workloads
unless the repository and runner trust boundary has been reviewed. The
Cloudflare release controller, production credentials, npm publishing, and
deployment authority remain on GitHub-hosted runners.

## Publishing to npm

This repository is configured to publish from `.github/workflows/release.yml`
when you push a version tag such as `v1.0.5`.

You have two supported auth paths:

1. **Repository secret**: create an npm publish token and store it as the GitHub
   Actions secret `NPM_TOKEN`.
2. **Trusted publishing**: connect the npm package to this GitHub repository and
   let npm trust GitHub Actions OIDC, with no token stored in GitHub.

Once one of those is configured, publish with:

```bash
git tag v1.0.5
git push origin v1.0.5
```

## Deployment Modes

### 1. Local mode (`stdio`)

- Run the MCP server on the same machine as the client
- No hosted auth required
- Best for privacy-sensitive workflows, local development, and
  bring-your-own-hosting

### 2. Hosted remote mode

- Use the CourtListener Cloudflare Worker as the remote MCP endpoint
- The Worker is the MCP OAuth server and exposes `/mcp`, `/oauth/authorize`,
  `/token`, `/register`, and discovery metadata
- The Worker also owns the browser auth handoff routes on the same origin
  (`/auth/start`, `/auth/callback`, `/oauth/approve`, `/oauth/logout`)
- Keep Logto as the current upstream hosted identity provider if you want a
  managed OIDC tenant; the Worker-facing contract stays generic OIDC
- Best for ChatGPT, Claude, Codex, and browser-native remote clients

## MCP Client Configuration

Prebuilt configs are provided in [`configs/`](./configs):

- `local-stdio.json`
- `self-hosted-remote.json` for a self-hosted remote Worker
- `hosted-remote-claude.json`
- `hosted-oauth-chatgpt.json`
- `hosted-oauth-codex.json`
- `codex.toml`
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
- [`configs/self-hosted-remote.json`](./configs/self-hosted-remote.json) for a
  self-hosted Cloudflare Worker remote
- [`configs/hosted-remote-claude.json`](./configs/hosted-remote-claude.json) for
  hosted remote use with Claude-style clients
- [`configs/hosted-oauth-chatgpt.json`](./configs/hosted-oauth-chatgpt.json) for
  hosted remote OAuth with ChatGPT-style clients
- [`configs/codex.toml`](./configs/codex.toml) for the current terminal Codex
  CLI (`~/.codex/config.toml`, then run `codex mcp login courtlistener`)
- [`configs/hosted-oauth-codex.json`](./configs/hosted-oauth-codex.json) for
  older JSON-based Codex-style clients

Additional client-specific examples remain available for clients with
provider-specific configuration formats:

- [`configs/codex.json`](./configs/codex.json) for the direct HTTP JSON example
- [`configs/openai-chatgpt.json`](./configs/openai-chatgpt.json) for hosted
  OAuth
- [`configs/claude-desktop-remote.json`](./configs/claude-desktop-remote.json)
  for hosted remote use
- [`mcp-config.json`](./mcp-config.json) for local and direct remote variants
  used in development

## Tool Catalog (52)

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

- Node.js 24.18.0 (see `.nvmrc`)
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

Production uses **three** Worker scripts (edge portal, MCP, auth limiter). See
[`docs/repo/WORKER_SPLIT.md`](docs/repo/WORKER_SPLIT.md).

```bash
pnpm install
pnpm run generate:web:spa
pnpm run generate:tool-schemas
pnpm run generate:hosted-auth-styles
# Secrets (apply to edge + MCP workers as needed)
pnpm exec wrangler secret put COURTLISTENER_API_KEY -c wrangler.mcp.jsonc
pnpm exec wrangler secret put MCP_UI_SESSION_SECRET -c wrangler.edge.jsonc
pnpm exec wrangler secret put OIDC_ISSUER -c wrangler.edge.jsonc
pnpm exec wrangler secret put OIDC_AUDIENCE -c wrangler.edge.jsonc
pnpm exec wrangler secret put MCP_OAUTH_REGISTRATION_TOKEN_SECRET -c wrangler.edge.jsonc
# Optional shared token auth
pnpm exec wrangler secret put MCP_AUTH_TOKEN -c wrangler.mcp.jsonc
pnpm run cloudflare:check
# Production changes go through the GitHub Actions Cloudflare Release Controller.
# It performs upload, canary, promotion, rollback, and receipt validation.
```

Endpoints after deploy:

- `GET /health`
- `POST /mcp` (primary MCP endpoint)
- `GET /oauth/authorize`
- `GET/POST /oauth/approve`
- `POST /oauth/logout`
- `POST /token`
- `POST /register`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`

`GET /health` returns a unified runtime contract on the Edge and MCP Workers:

- Core fields: `status`, `service`, `timestamp`, `version`, `runtime`,
  `transport`
- Shared diagnostics: `diagnostics.cloudflare`,
  `diagnostics.metrics.latency_ms`; MCP transport is stateless and has no
  protocol-session topology.
- Runtime-specific diagnostics live alongside those shared sections.

## Web UX Wave (SPA)

- ✅ **UX15–UX19 complete**: accessibility AA hardening, design-system
  consolidation, performance UX optimizations, and dark-mode visual parity are
  now shipped.
- ✅ **Validation safety pass**: `pnpm run test:spa`, `pnpm run build`, and
  `pnpm run typecheck` are the required UX-wave release gate.
- ✅ **Focused SPA rule**: use `pnpm run test:spa:focus -- <file...>` for
  targeted browser-auth/UI checks so the real SPA Vitest config and setup are
  always applied.
- **Overview** (`/app`): live session/auth/key/runtime posture with a guided MCP
  checklist.
- **Protocol explorer**: v2 discovery/tool/resource/prompt surfaces surfaced
  directly in the overview metadata panels.
- **Async operator workspace** (`/app/playground`): queue async tool calls
  (`__mcp_async`), monitor lifecycle state, deep-link job details, cancel/retry,
  and fetch results.
- **Recovery UX**: cross-page recovery status banners plus safe fallback routes
  back to login, account, and the workspace overview.

## Auth Model by Deployment Mode

### Hosted remote mode: Worker OAuth

Cloudflare OAuth is the primary hosted auth path for remote MCP routes.

- The Worker is the OAuth authorization/resource server for MCP clients
- The Worker serves the minimal auth handoff routes on the same origin
- Remote MCP clients connect directly to the Worker

- OAuth endpoints:
  - `GET /oauth/authorize`
  - `POST /token`
  - `POST /register`
- Discovery endpoints:
  - `GET /.well-known/oauth-authorization-server`
  - `GET /.well-known/oauth-protected-resource`
- `/oauth/authorize` resolves identity from:
  - Signed UI session (`clmcp_ui`) when present
  - Cloudflare Access identity headers (`cf-access-authenticated-user-id` or
    `cf-access-authenticated-user-email`) only when
    `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true`
  - If no trusted identity is present, the Worker redirects to the hosted auth
    handoff or returns `identity_required`; there is no development identity
    bypass.
- If unresolved, `/oauth/authorize` redirects to same-origin
  `/auth/start?return_to=<authorize_url>` when Worker-native hosted auth config
  is present
- `POST /api/session/bootstrap` remains the Worker-native bearer-to-session
  bootstrap endpoint for trusted same-origin/session handoff cases
- Same-origin Worker auth handoff:
  - `GET /auth/start`
  - `GET /auth/callback`
  - `GET/POST /oauth/approve`
  - `GET/POST /oauth/logout` (`GET` renders a confirmation form; `POST` performs
    the logout)
  - Worker-native hosted auth expects `OIDC_ISSUER`, `MCP_UI_SESSION_SECRET`,
    and a complete upstream OIDC client pair
  - Required upstream pair: `MCP_AUTH_OIDC_CLIENT_ID` +
    `MCP_AUTH_OIDC_CLIENT_SECRET`
  - As an alternative browser-auth boundary, protect `/oauth/authorize` and
    `/oauth/approve` with Cloudflare Access and enable
    `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true` plus
    `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true`; the Worker will bootstrap
    its own same-origin UI session from trusted Access identity headers before
    rendering the approval step
  - Partial `MCP_AUTH_OIDC_CLIENT_*` config fails closed
  - Dynamic client-registration management tokens require the dedicated
    `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`; without it, registration management
    tokens are disabled
  - `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS` defaults to 86400 and should be
    set explicitly for hosted deployments
  - Browser-session authorization now stops at an explicit same-site approval
    screen before the Worker completes `/oauth/authorize`
  - Hosted-auth probe responses emit `X-Hosted-Auth-*` readiness headers with a
    concrete reason, coarse failure category, stable low-cardinality
    signal/failure flags, stable flow correlation ID, flow outcome, credential
    source, and config-error count
  - Route-level rate limit controls:
    - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
    - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
    - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`
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
  - `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true` only when
    `/oauth/authorize` is deployed behind Cloudflare Access or another edge that
    strips/spoof-proofs `cf-access-authenticated-user-*`
  - `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` is required by deploy checks
    before either scoped trust flag is allowed
  - Without those explicit per-surface flags, the Worker ignores
    `CF-Access-Jwt-Assertion` and `cf-access-authenticated-user-*`
- Optional service-token path:
  - `MCP_AUTH_TOKEN`
  - `MCP_SERVICE_TOKEN_HEADER`

Use this mode when you want the CourtListener MCP runtime but need to keep
identity, secrets, and deployment policy inside your own infrastructure.

### Local mode: no hosted auth required

- Local `stdio` clients do not need the hosted OAuth surface
- Users typically provide their own `COURTLISTENER_API_KEY`
- This is the simplest path for desktop-local MCP clients and development

Unknown or retired UI/auth paths are not routed by the Worker and return the
normal `404` response. Canonical hosted OAuth contract values (paths, grants,
response types, scopes, PKCE methods, priority clients) live in
`src/auth/oauth-contract.ts`.

### Hosted auth rollout checks

Before promoting a hosted Worker deploy, verify:

- `pnpm run cloudflare:check` is clean; optional DCR signing-secret and WAF
  API-token warnings are understood and tracked separately
- `https://<worker>/auth/start?continue=1` returns `302`
  - a real `/oauth/authorize` browser journey reaches `/oauth/approve` before
    OAuth completion
- DCR management token rotation is independent of UI session rotation by setting
  `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`
- any Cloudflare Access trust flags are paired with
  `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true`

## Runtime and Observability

The local public health endpoint is the Edge Worker:

- Edge (portal, OAuth, SPA shell): `GET http://localhost:8787/health`
  (`pnpm run health`)

Start the topology with `pnpm run dev:workers`; point the Vite SPA dev server at
the edge worker (default `http://localhost:8787`). The MCP Worker is an internal
service in this mode and is verified through the Edge `/ready` service-binding
probe.

Useful runtime variables:

- `CACHE_ENABLED`
- `CACHE_TTL`
- `LOG_LEVEL`
- `LOG_FORMAT`
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
# focused SPA slice under the supported SPA Vitest config
pnpm run test:spa:focus -- src/web-spa/src/__tests__/shell.test.tsx
pnpm run coverage
pnpm run coverage:check
```

### MCP v2 protocol contract

```bash
pnpm run test:mcp
pnpm run ci:test:mcp-v2
pnpm run ci:test:mcp-v2:extended
```

### Release hardening performance gates

```bash
pnpm run ci:load-profile-suite -- --light --base-url http://127.0.0.1:8787
pnpm run ci:perf-gate -- baseline.json current.json
pnpm run ci:hardening:soak-leak-checks -- --light --base-url http://127.0.0.1:8787
pnpm run ci:release-readiness-gate -- --light --base-url http://127.0.0.1:8787
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
