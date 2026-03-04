# Runtime Parity Baseline (Worker vs Local)

## Scope
- Cloudflare Worker runtime: `src/worker.ts`
- Local runtime: `src/index.ts` + `src/server/http-transport-server.ts` + `src/http-server.ts`

## Entrypoints and critical paths
- Worker MCP transport: `POST /mcp`, `GET /sse`, health at `GET /health`
- Local streamable HTTP transport: `app.all('/mcp', ...)`, health at `GET /health`
- Local diagnostics transport: health/metrics/cache endpoints in `src/http-server.ts`
- Shared core service bootstrap: `bootstrapServices()` via DI container

## Parity matrix

| Area | Cloudflare Worker | Local runtime | Gap / note |
| --- | --- | --- | --- |
| MCP transport endpoint | `/mcp` + `/sse` compatibility | `/mcp` | Equivalent for MCP clients |
| Health endpoint | `/health` (worker response body) | `/health` (HTTP transport + diagnostics server) | Similar surface, different payload shapes |
| CORS origin policy | `parseAllowedOrigins()` + `isAllowedOrigin()` + reject disallowed origins | **Now aligned**: explicit origin allowlist check via `isAllowedOrigin()` in HTTP transport middleware | Reduced origin-validation drift |
| CORS headers | Reflects allowed request origin + `Vary: Origin` + MCP protocol header support | **Now aligned**: reflects allowed origin, sets `Vary`, includes MCP protocol headers | Behavioral parity improved |
| MCP protocol header validation | Optional strict validation via `MCP_REQUIRE_PROTOCOL_VERSION` | Header passed through transport; no dedicated strict gate | Intentional difference (SDK transport-managed locally) |
| Auth mode selection | Static / OIDC / Supabase via worker-security selection logic | OAuth router + bearer verification (when enabled) | Different mechanisms by runtime design |
| UI auth/session flows | Full session cookie, CSRF, consent UI, rate limits in worker | Not present in local HTTP transport | Expected divergence (worker-hosted UI path) |
| Config source | Worker env bindings bridged into `process.env` | Direct `process.env` | Equivalent config path after bootstrap |
| Startup validation | Route-level config checks, some runtime guards | `getConfig()` + server setup checks | Additional fail-fast hardening can be expanded |
| Observability | Structured logs + worker-specific signals | Structured logs + local health/metrics endpoints | Similar capabilities, different deployment channels |

## Reliability targets (initial)
- MCP endpoint availability: **99.9%** monthly target for deployed worker.
- Critical request failure rate (5xx): **< 1%** rolling 24h.
- Auth/config regressions detected before deploy: **100%** via `cloudflare:check` and CI gates.
- Recovery objective for bad deploy: rollback procedure executable within **15 minutes**.

## Immediate follow-ups
1. Expand pre-deploy checks for session/auth config consistency.
2. Standardize health payload fields across runtimes where practical.
3. Add parity-focused CI smoke tests for MCP initialize + auth/CORS scenarios.
