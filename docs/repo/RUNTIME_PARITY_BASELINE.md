# Runtime Parity Baseline (Worker vs Local)

## Scope

- Cloudflare Worker runtime: `src/worker-edge.ts` + `src/worker-mcp.ts`
- Local runtime: `src/index.ts` + `src/server/http-transport-server.ts` +
  `src/http-server.ts`

## Entrypoints and critical paths

- Worker MCP transport: `POST /mcp`, `GET /sse`, health at `GET /health`
- Worker readiness contract: `GET /ready` (Edge aggregates MCP service binding;
  MCP checks its own bindings)
- Local streamable HTTP transport: `app.all('/mcp', ...)`, health at
  `GET /health`
- Local diagnostics transport: health/metrics/cache endpoints in
  `src/http-server.ts`
- Shared core service bootstrap: `bootstrapServices()` via DI container

## Parity matrix

| Area                                       | Cloudflare Worker                                                                                                          | Local runtime                                                                                         | Gap / note                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MCP transport endpoint                     | `/mcp` + `/sse` compatibility                                                                                              | `/mcp`                                                                                                | Equivalent for MCP clients                                                                                                                                         |
| Health endpoint                            | `/health` (edge and MCP worker response bodies)                                                                            | `/health` (HTTP transport + diagnostics server)                                                       | **Unified** via `runtime-health-contract.ts`: core fields plus `diagnostics.session_topology`, `diagnostics.cloudflare`, and `diagnostics.metrics` on all runtimes |
| Readiness endpoint                         | `/ready` with Edge → MCP binding check and MCP binding checks                                                              | Not exposed by the Node transport                                                                     | Readiness is deployment-topology specific; liveness remains `/health`                                                                                              |
| CORS origin policy                         | `parseAllowedOrigins()` + `isAllowedOrigin()` + reject disallowed origins                                                  | **Now aligned**: explicit origin allowlist check via `isAllowedOrigin()` in HTTP transport middleware | Reduced origin-validation drift                                                                                                                                    |
| CORS headers                               | Reflects allowed request origin + `Vary: Origin` + MCP protocol header support                                             | **Now aligned**: reflects allowed origin, sets `Vary`, includes MCP protocol headers                  | Behavioral parity improved                                                                                                                                         |
| MCP protocol header validation             | Optional strict validation via `MCP_REQUIRE_PROTOCOL_VERSION`                                                              | Header passed through transport; no dedicated strict gate                                             | Intentional difference (SDK transport-managed locally)                                                                                                             |
| Session lifecycle invalid-session contract | **Now aligned** via shared invalid-session JSON-RPC payload helper and Worker session lifecycle boundary checks            | Shared helper reused by local Streamable HTTP transport invalid session branch                        | Improved cross-runtime session parity                                                                                                                              |
| Worker session ownership topology          | **Now explicit (v2)** deterministic shard mapping `hash(sessionId) % shardCount` with DO-backed idle/absolute TTL eviction | N/A (local Node runtime uses in-process session map with capacity limits)                             | Runtime-specific, but contract-compatible session errors                                                                                                           |
| Auth mode selection                        | Static / OIDC via worker-security selection logic                                                                          | OAuth router + bearer verification (when enabled)                                                     | Different mechanisms by runtime design                                                                                                                             |
| UI auth/session flows                      | Full session cookie, CSRF, consent UI, rate limits in worker                                                               | Not present in local HTTP transport                                                                   | Expected divergence (worker-hosted UI path)                                                                                                                        |
| Config source                              | Explicit Worker env bindings passed through Worker runtime/DI boundaries                                                   | Direct `process.env`                                                                                  | Equivalent values without mutating global process state in the Worker path                                                                                         |
| Startup validation                         | Route-level config checks, some runtime guards                                                                             | `getConfig()` + server setup checks                                                                   | Additional fail-fast hardening can be expanded                                                                                                                     |
| Observability                              | Structured logs + worker-specific signals                                                                                  | Structured logs + local health/metrics endpoints                                                      | Similar capabilities, different deployment channels                                                                                                                |

## Reliability targets (initial)

- MCP endpoint availability: **99.9%** monthly target for deployed worker.
- Critical request failure rate (5xx): **< 1%** rolling 24h.
- Auth/config regressions detected before deploy: **100%** via
  `cloudflare:check` and CI gates.
- Recovery objective for bad deploy: rollback procedure executable within **15
  minutes**.

## Immediate follow-ups

1. ~~Expand pre-deploy checks for session/auth config consistency.~~ Session
   topology vars + `/health` contract probe in `cloudflare:check`.
2. ~~Extend CI smoke tests to include Worker-vs-Node session lifecycle contract
   fixtures.~~ `test:session:contract` and `test:transport:http` wired into
   `npm run test:integration`; HTTP transport contract also runs in
   `startup-diagnostics` release gate.
3. ~~Standardize health payload fields across runtimes where practical.~~ Done
   via unified `diagnostics.session_topology`, `diagnostics.cloudflare`, and
   `diagnostics.metrics` on Worker, streamable HTTP, and diagnostics HTTP
   (`runtime-health-contract.ts`).
4. ~~Add a real local Edge-to-MCP service-binding smoke.~~ Done via
   `pnpm run test:workers`, which uses `@cloudflare/vitest-pool-workers` and a
   locally built MCP bundle. Live Cloudflare binding/version receipts remain a
   release gate.

## Controlled breaking-change gates (BP8-BP10)

| Change                      | Feature flag                             | Protocol gate   | Migration notes                                                                                                      |
| --------------------------- | ---------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| BP8 session topology v2     | `MCP_BREAKING_BP8_SESSION_TOPOLOGY_V2`   | `>= 2025-03-26` | Validate deterministic shard ownership for existing session IDs and set explicit session TTL env values.             |
| BP9 async workflow envelope | `MCP_BREAKING_BP9_ASYNC_WORKFLOW`        | `>= 2025-03-26` | Adopt `mcp_async_*` control tools and treat async envelopes as canonical long-running responses.                     |
| BP10 edge auth precedence   | `MCP_BREAKING_BP10_EDGE_AUTH_PRECEDENCE` | `>= 2025-03-26` | Set `MCP_AUTH_PRIMARY` and `MCP_ALLOW_STATIC_FALLBACK` explicitly; audit `x-mcp-service-token` fail-closed behavior. |

Runtime parity certification writes artifact output to
`test-output/runtime-parity/certification-report.json` with per-case diffs when
Node/Worker behavior drifts. Release-readiness certification extends parity with
performance gating and writes
`test-output/release-readiness/release-readiness-gate.json`.
