# CourtListener MCP Server

Production-ready Model Context Protocol (MCP) server for CourtListener legal data.
It exposes legal research tools over MCP (`stdio` and HTTP), with deployment-ready support for Cloudflare Workers, structured logging, caching, auth options, and CI testing.

## What This Repository Provides

- MCP server built on `@modelcontextprotocol/sdk`
- 33 legal research tools backed by CourtListener API v4
- Local runtime (`stdio`) and remote runtime (HTTP/Cloudflare Worker)
- OAuth-protected MCP transport via Cloudflare Workers OAuth Provider
- Built-in health checks and metrics endpoints for operations
- Prebuilt MCP client config examples in [`configs/`](./configs)

## Repository Structure

- `src/` core server, tool handlers, API integration, worker runtime
- `configs/` ready-to-use MCP client configs (Claude, Codex, Cursor, ChatGPT, etc.)
- `docs/` deployment, testing, and operational documentation
- `test/` unit/integration/e2e test suites
- `scripts/` deployment helpers, diagnostics, inspector tooling, key management

## Quick Start

### 1. Use a deployed remote endpoint (fastest)

If an instance is already deployed:

```json
{
  "mcpServers": {
    "courtlistener": {
      "url": "https://courtlistener-mcp.<subdomain>.workers.dev/mcp"
    }
  }
}
```

### 2. Run locally with `npx`

```bash
npx courtlistener-mcp --setup
```

Or run directly:

```bash
npx courtlistener-mcp
```

### 3. Run from source

```bash
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp
pnpm install
pnpm build
node dist/index.js
```

### 4. Run with Docker

```bash
cp .env.production .env
docker compose -f docker-compose.prod.yml up -d
```

## MCP Client Configuration

Prebuilt configs are provided in [`configs/`](./configs):

- `claude-desktop.json`
- `claude-desktop-remote.json`
- `cursor.json`
- `continue-dev.json`
- `vscode-copilot.json`
- `zed.json`
- `openai-chatgpt.json`
- `codex.json`

For Codex specifically:

- [`configs/codex.json`](./configs/codex.json) for direct HTTP transport
- [`mcp-config.json`](./mcp-config.json) for local/bridge variants used in development

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
```

## Deployment (Cloudflare Workers)

```bash
pnpm install
wrangler secret put COURTLISTENER_API_KEY
# Optional shared token auth
wrangler secret put MCP_AUTH_TOKEN
pnpm run cloudflare:check
pnpm run cloudflare:deploy
```

Endpoints after deploy:

- `GET /health`
- `POST /mcp` (primary MCP endpoint)
- `GET /sse` (SSE compatibility)

## Web UX Wave (SPA)

- ✅ **UX15–UX19 complete**: accessibility AA hardening, design-system consolidation, performance UX optimizations, and dark-mode visual parity are now shipped.
- ✅ **Validation safety pass**: `pnpm run test:spa`, `pnpm run build`, and `pnpm run typecheck` are the required UX-wave release gate.
- **Control Center** (`/app/control-center`): live session/auth/key/runtime posture with a guided MCP checklist.
- **Protocol explorer**: initialize/tool/resource/prompt discovery surfaced directly in Control Center metadata panels.
- **Async operator workspace** (`/app/playground`): queue async tool calls (`__mcp_async`), monitor lifecycle state, deep-link job details, cancel/retry, and fetch results.
- **Recovery UX**: cross-page recovery status banners plus safe fallback routes back to login, keys, and Control Center.

## Authentication Modes

### Cloudflare OAuth (default)

Cloudflare OAuth is now the primary and only supported hosted auth path for MCP routes.

- OAuth endpoints:
  - `GET/POST /authorize`
  - `POST /token`
  - `POST /register`
- Discovery endpoints:
  - `GET /.well-known/oauth-authorization-server`
  - `GET /.well-known/oauth-protected-resource`
- `/authorize` resolves identity from:
  - Signed UI session (`clmcp_ui`) when present
  - Cloudflare Access identity headers (`cf-access-authenticated-user-id` or `cf-access-authenticated-user-email`)
  - `MCP_OAUTH_DEV_USER_ID` only when `MCP_ALLOW_DEV_FALLBACK=true` (development fallback only)
  - If unresolved and `MCP_AUTH_UI_ORIGIN` is set, `/authorize` redirects to `${MCP_AUTH_UI_ORIGIN}/auth/start?return_to=<authorize_url>`
- External auth UI handoff:
  - OAuth handoffs from the Clerk portal call `POST /api/session/oauth-complete` with a valid short-lived Clerk/OIDC bearer token plus the original `return_to`
  - Non-OAuth browser bootstrap flows call `POST /api/session/bootstrap`, which sets the secure `clmcp_ui` cookie used by `/authorize`
  - Route-level rate limit controls:
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
    - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`
- Usage dashboard endpoint:
  - `GET /api/usage` returns per-user counters (`totalRequests`, `dailyRequests`, `byRoute`, `lastSeenAt`)

### Static bearer token

Set `MCP_AUTH_TOKEN` secret. Clients send:

```text
Authorization: Bearer <token>
```

### OIDC JWT auth

Set:

- `OIDC_ISSUER`
- `OIDC_AUDIENCE` (optional)
- `OIDC_JWKS_URL` (optional)
- `OIDC_REQUIRED_SCOPE` (optional)

Use this for direct bearer-token validation paths and for the Clerk portal handoff inside the worker. The worker accepts a direct Clerk/OIDC JWT bearer token posted to `/api/session/oauth-complete` for OAuth completion and to `/api/session/bootstrap` for browser-session bootstrap.

### Removed Legacy UI/Auth Endpoints

The following legacy UI endpoints are disabled in the hard cutover and return `410`:

- `/api/login*`
- `/api/logout*`
- `/api/signup*`
- `/api/password*`
- `/api/keys*`
- `/oauth/consent`

Canonical hosted OAuth contract values (paths, grants, response types, scopes, PKCE methods, priority clients) live in `src/auth/oauth-contract.ts`.

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

CI runs these gates in warn mode for pull requests/non-protected branches, and strict fail mode for `main`/`master`/`release/*` and `v*` tags.

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
