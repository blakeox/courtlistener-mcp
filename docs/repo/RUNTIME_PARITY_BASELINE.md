# Runtime Contract Baseline (Cloudflare Workers)

## Scope

- Cloudflare Worker runtime: `src/worker-edge.ts` + `src/worker-mcp.ts`
- Local development runtime: the same Edge + MCP Workers launched by
  `pnpm run dev:workers` with a local service binding

## Entrypoints and critical paths

- Worker MCP transport: `POST /mcp`, health at `GET /health`
- Worker readiness contract: `GET /ready` (Edge aggregates MCP service binding;
  MCP checks its own bindings)
- Local service-binding transport: the Edge Worker `/mcp` path forwards to the
  MCP Worker, with health at `GET /health`
- Shared core service bootstrap: `bootstrapServices()` via DI container

## Parity matrix

| Area                              | Cloudflare Worker                                                              | Local runtime                                       | Gap / note                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MCP transport endpoint            | `/mcp`                                                                         | `/mcp`                                              | Stateless MCP v2 Streamable HTTP contract                                                                         |
| Health endpoint                   | `/health` (edge and MCP worker response bodies)                                | `/health` (local Edge + MCP Workers)                | **Unified** via `runtime-health-contract.ts`: core fields plus `diagnostics.cloudflare` and `diagnostics.metrics` |
| Readiness endpoint                | `/ready` with Edge → MCP binding check and MCP binding checks                  | Same multi-Worker topology under Wrangler           | Readiness is deployment-topology specific; liveness remains `/health`                                             |
| CORS origin policy                | `parseAllowedOrigins()` + `isAllowedOrigin()` + reject disallowed origins      | Same Worker route policy under Wrangler             | Reduced origin-validation drift                                                                                   |
| CORS headers                      | Reflects allowed request origin + `Vary: Origin` + MCP protocol header support | Same Worker response policy under Wrangler          | Behavioral parity improved                                                                                        |
| MCP protocol header validation    | Optional strict validation via `MCP_REQUIRE_PROTOCOL_VERSION`                  | Same boundary policy under Wrangler                 | Local exercises the deployed Worker contract                                                                      |
| Worker session ownership topology | Stateless MCP v2 request handling; no MCP session ownership                    | Same stateless MCP v2 topology under local Wrangler | No session affinity or Durable Object lifecycle is required for MCP requests                                      |
| Auth mode selection               | Static / OIDC via worker-security selection logic                              | Same Worker auth selection under Wrangler           | Local exercises the deployed Worker contract                                                                      |
| UI auth/session flows             | Full session cookie, CSRF, consent UI, rate limits in worker                   | Edge Worker routes available locally                | Local exercises the hosted UI path without external deployment                                                    |
| Config source                     | Explicit Worker env bindings passed through Worker runtime/DI boundaries       | Wrangler local bindings and vars                    | Local development exercises the same binding topology as production                                               |
| Startup validation                | Route-level config checks, some runtime guards                                 | `getConfig()` + server setup checks                 | Additional fail-fast hardening can be expanded                                                                    |
| Observability                     | Structured logs + worker-specific signals                                      | Wrangler logs + Worker health/readiness endpoints   | Same request topology; different log sink                                                                         |

## Reliability targets (initial)

- MCP endpoint availability: **99.9%** monthly target for deployed worker.
- Critical request failure rate (5xx): **< 1%** rolling 24h.
- Auth/config regressions detected before deploy: **100%** via
  `cloudflare:check` and CI gates.
- Recovery objective for bad deploy: rollback procedure executable within **15
  minutes**.

## Immediate follow-ups

1. ~~Expand pre-deploy checks for session/auth config consistency.~~ `/health`
   contract probe remains in `cloudflare:check`; MCP protocol sessions are not
   part of the stateless v2 deployment.
2. ~~Wire the MCP v2 handler contract checks into integration validation.~~
   `test:transport:http` exercises the SDK handler contract and is wired into
   `pnpm run test:integration`.
3. ~~Standardize health payload fields across runtimes where practical.~~ Done
   via unified `diagnostics.cloudflare` and `diagnostics.metrics` on the Edge
   and MCP Workers (`runtime-health-contract.ts`).
4. ~~Add a real local Edge-to-MCP service-binding smoke.~~ Done via
   `pnpm run test:workers`, which uses `@cloudflare/vitest-pool-workers` and a
   locally built MCP bundle. Live Cloudflare binding/version receipts remain a
   release gate.

Runtime contract certification writes artifact output to
`test-output/runtime-parity/certification-report.json` with per-case diffs when
Worker behavior drifts. Release-readiness certification extends the contract
with performance gating and writes
`test-output/release-readiness/release-readiness-gate.json`.
