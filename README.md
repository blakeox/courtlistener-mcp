# CourtListener MCP Server

Production-ready Model Context Protocol (MCP) server for CourtListener legal data.
It exposes legal research tools over MCP (`stdio` and HTTP), with deployment-ready support for Cloudflare Workers, structured logging, caching, auth options, and CI testing.

## What This Repository Provides

- MCP server built on `@modelcontextprotocol/sdk`
- 33 legal research tools backed by CourtListener API v4
- Local runtime (`stdio`) and remote runtime (HTTP/Cloudflare Worker)
- Optional auth layers: static bearer token, Supabase API-key auth, OIDC JWT
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

## Authentication Modes

### Static bearer token

Set `MCP_AUTH_TOKEN` secret. Clients send:

```text
Authorization: Bearer <token>
```

### Supabase API-key auth

Set:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_API_KEYS_TABLE` (optional)
- `MCP_UI_PUBLIC_ORIGIN` (optional)
- `MCP_UI_INSECURE_COOKIES` (optional, local HTTP only)

Schema files:

- [`docs/supabase/mcp-auth-schema.sql`](./docs/supabase/mcp-auth-schema.sql)
- [`docs/supabase/mcp-audit-logs.sql`](./docs/supabase/mcp-audit-logs.sql)

Key management CLI:

```bash
pnpm run mcp:key:create -- --user-id <auth_user_uuid> --label "prod-key" --expires-days 90
pnpm run mcp:key:list -- --active-only true --limit 100
pnpm run mcp:key:revoke -- --key-id <mcp_key_uuid>
```

### OIDC JWT auth

Set:

- `OIDC_ISSUER`
- `OIDC_AUDIENCE` (optional)
- `OIDC_JWKS_URL` (optional)
- `OIDC_REQUIRED_SCOPE` (optional)

### Supabase OAuth Server consent UI

If Supabase OAuth Server is enabled for your project, configure:

- **Site URL**: your deployed app origin (for example `https://courtlistenermcp.blakeoxford.com`)
- **Authorization Path**: `/oauth/consent`

This repository now implements `GET/POST /oauth/consent` in the Cloudflare Worker:

- renders a first-party consent page for third-party OAuth apps
- supports approve/deny actions
- redirects back to the OAuth client via Supabase authorization redirects

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
