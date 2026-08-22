# Edge + MCP worker split

Production uses **three** Worker scripts:

| Script                           | Wrangler config               | Role                                   |
| -------------------------------- | ----------------------------- | -------------------------------------- |
| `courtlistener-mcp-auth-limiter` | `wrangler.auth-limiter.jsonc` | `AuthFailureLimiterDO` only            |
| `courtlistener-mcp-mcp`          | `wrangler.mcp.jsonc`          | `/mcp`, async tool queue               |
| `courtlistener-mcp`              | `wrangler.edge.jsonc`         | OAuth, hosted auth, SPA assets, UI API |

Code Mode is not part of either public contract. `CODEMODE_ENABLED=false` is
explicitly set in both split Worker configurations until an isolated preview
implementation passes separate capability, resource, audit, and result-parity
gates.

## Routing (same hostname)

- **Edge** uses a
  [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  on `courtlistenermcp.blakeoxford.com` (see `wrangler.edge.jsonc`).
- **Edge** owns the public custom domain, including canonical `/mcp`.
  Authenticated MCP requests are forwarded privately through `MCP_SERVICE` to
  `courtlistener-mcp-mcp`; the MCP Worker has no public zone routes.

If your zone name differs, update `zone_name` in `wrangler.mcp.jsonc`.

## Service binding

The edge worker calls the MCP worker for in-app AI tool RPC:

```jsonc
"services": [
  { "binding": "MCP_SERVICE", "service": "courtlistener-mcp-mcp" }
]
```

The MCP worker owns `COURTLISTENER_API_KEY` directly. Stage the secret with
`pnpm run cloudflare:secrets:sync-mcp` (reads from the process environment or
`.dev.vars`). The command fails closed when the secret is absent; no internal
HTTP secret endpoint, reverse service binding, or local sibling-Worker fallback
exists in the active runtime.

## Local development

```bash
pnpm run generate:web:spa
pnpm run dev:workers   # Edge :8787 + connected local MCP service binding
# optional third terminal:
pnpm exec vite --config src/web-spa/vite.config.ts   # SPA :5173 → proxies to :8787
```

The combined command uses Wrangler's multi-config local development mode. Edge
is the public local process on port 8787; Wrangler connects its `MCP_SERVICE`
binding to the local MCP Worker internally.

The MCP Worker can still be run separately for focused protocol work:

```bash
pnpm run dev:mcp     # :3001 — optional focused MCP protocol work
```

The Edge Worker has no HTTP localhost fallback. Use `pnpm run dev:workers` so
Wrangler can connect the local `MCP_SERVICE` binding, matching production's
private Worker-to-Worker topology.

Vite (`src/web-spa/vite.config.ts`) proxies `/api`, `/auth`, `/oauth`, etc. to
**port 8787** (edge), not 3001.

Run the local Workerd topology smoke before changing either Worker:

```bash
pnpm run test:workers
```

This runs the MCP Worker binding smoke, builds the test MCP bundle, and then
proves that Edge `/ready` reaches the MCP Worker through a named local
`MCP_SERVICE` binding. It does not prove a deployed Cloudflare service binding.

## Deploy order

```bash
# Use the GitHub Actions Cloudflare Release Controller workflow.
# It deploys auth-limiter directly, then uploads/canaries/promotes Edge + MCP.
```

Deploy order is **auth-limiter → edge → mcp** so the public Edge ingress and its
private service binding are live before the MCP Worker is promoted.

The auth-limiter uses Cloudflare's declarative Durable Object `exports`
lifecycle and is therefore deployed directly at 100% during release preparation.
Edge and MCP continue through version upload, canary, and promotion; the limiter
is not split across canary percentages.

## Entry files

- `src/worker-edge.ts` — portal fetch + OAuth wrapper
- `src/worker-mcp.ts` — MCP fetch + queue consumer
- `src/worker/courtlistener-mcp-v2.ts` — stateless MCP v2 handler factory

Bundle audit: `pnpm run ci:analyze:worker-bundle`; startup profiling across
Edge, MCP, and auth-limiter: `pnpm run cloudflare:check:startup`.

## Post-deploy verification

```bash
curl -fsS https://courtlistenermcp.blakeoxford.com/health
curl -fsS https://courtlistenermcp.blakeoxford.com/ready
curl -fsS -o /dev/null -w '%{http_code}\n' 'https://courtlistenermcp.blakeoxford.com/auth/start?return_to=https%3A%2F%2Fexample.com'
curl -fsS -X POST https://courtlistenermcp.blakeoxford.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

Expect `/health` JSON from the edge worker, `/ready` with `status: "ready"` only
when the Edge-to-MCP service binding probe succeeds, `/auth/start` **302** (not
503), and MCP `server/discover` with a v2 result from the MCP worker routes. The
MCP worker's `/ready` response is an internal dependency receipt, not proof that
the public Edge route is healthy.
