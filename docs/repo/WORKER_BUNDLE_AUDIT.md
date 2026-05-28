# Worker bundle audit

After the **edge/MCP worker split** (see `docs/repo/WORKER_SPLIT.md`), dry-run
uploads are approximately:

| Script                           | Upload       | Gzip         |
| -------------------------------- | ------------ | ------------ |
| **Edge** (`wrangler.edge.jsonc`) | **~496 KiB** | **~101 KiB** |
| **MCP** (`wrangler.mcp.jsonc`)   | **~2.5 MiB** | **~436 KiB** |
| **Auth limiter**                 | **~26 KiB**  | **~5 KiB**   |

The SPA is served from **Workers Assets** (`.spa-dist`), not inlined in
`worker.js`. Portal/OAuth cold starts load only the edge script; `/mcp` loads
the MCP script (tools, Zod, agents).

Re-run the audit anytime:

```bash
node scripts/reports/analyze-worker-bundle.mjs
```

## Snapshot (post-split, May 2026)

**MCP worker** (`wrangler.mcp.jsonc`, ~2.5 MiB upload) — largest buckets in
source map:

| Bucket            |    ~Size | Notes                                                                                       |
| ----------------- | -------: | ------------------------------------------------------------------------------------------- |
| **zod**           | ~730 KiB | Runtime validation in domain handlers + `tool-handler` (tool list uses precomputed schemas) |
| **agents**        | ~528 KiB | `McpAgent`, partyserver, SSE, mimetext                                                      |
| **src/server**    | ~482 KiB | MCP fetch runtime, queues, tool routes                                                      |
| **ajv / mime-db** | ~380 KiB | Transitive via agents stack                                                                 |

**Edge worker** (~496 KiB upload) — OAuth, hosted auth, UI API, Workers Assets
binding (SPA not inlined).

**Auth limiter** (~26 KiB upload) — `AuthFailureLimiterDO` only.

Re-run `node scripts/reports/analyze-worker-bundle.mjs` for an edge-focused
breakdown.

## Why this mattered for production OAuth

`/auth/start` calls `AUTH_FAILURE_LIMITER`. On the **Workers free tier**, tail
logs showed:

`Exceeded allowed duration in Durable Objects free tier.`

That is CPU/time budget inside the DO isolate while loading/executing this
bundle—not proof that rate-limit logic itself is heavy. **Fail-open**
(`MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN=true`, default) avoids blocking sign-in
when the limiter cannot run.

## Reduction options (priority)

1. ~~**Split DO from the monolith**~~ — Done (`courtlistener-mcp-auth-limiter`
   script).
2. ~~**Stop inlining the SPA**~~ — Done (Workers Assets on edge worker).
3. ~~**Precompute tool JSON Schema at build time**~~ — Done
   (`generate:tool-schemas`); runtime Zod for validation remains on the MCP
   worker.
4. ~~**Split edge vs MCP workers**~~ — Done (~496 KiB edge vs ~2.5 MiB MCP). See
   `WORKER_SPLIT.md`.
5. **Trim `worker-auth-handoff-routes.ts`** — HTML/CSS partially externalized;
   further template splits possible.
6. **Runtime Zod on MCP worker** — Precomputed schemas help listing; validation
   still pulls full Zod (~730 KiB).
7. **Review `agents` on MCP worker** — Evaluate lighter transport if the SDK
   allows.
8. **Plan upgrade** — Paid Workers raises DO duration limits; fail-open remains
   a safety valve.

## Related env vars

| Variable                                       | Effect                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN`        | Default `true` — allow OAuth when limiter unavailable                            |
| `MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED`          | `false` skips limiter RPC entirely                                               |
| `SPA_JS_BUDGET_BYTES` / `SPA_CSS_BUDGET_BYTES` | Caps for `scripts/web/build-spa-assets.mjs` only (SPA payload, not whole Worker) |

See also `docs/repo/AUTH_START_INTEGRATION.md` (troubleshooting
`oauth_route_rate_limit_unavailable`).
