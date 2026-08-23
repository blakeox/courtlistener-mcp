# Worker bundle audit

After the **edge/MCP worker split** (see `docs/repo/WORKER_SPLIT.md`), dry-run
uploads are approximately:

| Script                           | Upload         | Gzip               |
| -------------------------------- | -------------- | ------------------ |
| **Edge** (`wrangler.edge.jsonc`) | **520.1 KiB**  | **107.8 KiB gzip** |
| **MCP** (`wrangler.mcp.jsonc`)   | **1525.1 KiB** | **266.6 KiB gzip** |
| **Auth limiter**                 | **20.7 KiB**   | **3.9 KiB gzip**   |

The SPA is served from **Workers Assets** (`.spa-dist`), not inlined in the
Worker bundle. Portal/OAuth cold starts load only the edge script; `/mcp` loads
the MCP script (tools, Zod, and the official MCP v2 handler).

Re-run the audit anytime:

```bash
node scripts/reports/analyze-worker-bundle.mjs
```

## Snapshot (MCP v2, August 2026)

The current edge build is **520.1 KiB minified**. The MCP Worker is **1525.1
KiB** (266.6 KiB gzip). The SPA is **618.1 KiB** (532.0 KiB JavaScript plus 86.1
KiB CSS) and is served through the Workers Assets binding rather than included
in the Worker bundle.

The current edge composition is:

| Bucket                         |     ~Size | Notes                                                   |
| ------------------------------ | --------: | ------------------------------------------------------- |
| **src/server**                 | 274.7 KiB | OAuth, MCP v2 routing, queues, hosted auth, diagnostics |
| **workers-oauth-provider**     | 166.5 KiB | Cloudflare OAuth provider runtime                       |
| **worker-auth-handoff-routes** |  91.0 KiB | Hosted auth handoff HTML/CSS                            |
| **jose**                       |  41.1 KiB | Token and JWT operations                                |
| **src/infrastructure**         |  28.0 KiB | Runtime health, observability, configuration            |

The MCP endpoint uses the stateless MCP v2 handler and is reached privately
through the edge-to-MCP service binding. The active Worker graph contains no
`McpAgent`, partyserver, legacy SSE transport, or Express server.

**Auth limiter** (20.7 KiB upload / 3.9 KiB gzip) — `AuthFailureLimiterDO` only.

Re-run `node scripts/reports/analyze-worker-bundle.mjs` for an edge-focused
breakdown.

Every Worker deployment graph also passes the platform-surface gate:

```bash
pnpm run cloudflare:check:surface
```

That gate dry-runs Edge, MCP, and the auth-limiter Workers and rejects
`process.env` plus broad Node runtime imports. `node:async_hooks` is the only
allowed Node import because the Agents MCP handler requires `AsyncLocalStorage`
through the focused `nodejs_als` compatibility flag.

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
4. ~~**Split edge vs MCP workers**~~ — Done. The edge and MCP contracts are
   separate Workers connected by a private service binding. See
   `WORKER_SPLIT.md`.
5. **Trim `worker-auth-handoff-routes.ts`** — HTML/CSS partially externalized;
   further template splits possible.
6. **Runtime Zod on MCP worker** — Precomputed schemas help listing; validation
   still pulls full Zod (~730 KiB).
7. ~~**Remove agent/SSE-era transport weight**~~ — Done. MCP v2 uses the
   stateless `createMcpHandler` path directly from
   `@modelcontextprotocol/server`.
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
