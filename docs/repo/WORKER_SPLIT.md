# Edge + MCP worker split

Production uses **three** Worker scripts:

| Script                           | Wrangler config               | Role                                                    |
| -------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `courtlistener-mcp-auth-limiter` | `wrangler.auth-limiter.jsonc` | `AuthFailureLimiterDO` only                             |
| `courtlistener-mcp-mcp`          | `wrangler.mcp.jsonc`          | `/mcp`, `/sse`, `CourtListenerMCP` DO, async tool queue |
| `courtlistener-mcp`              | `wrangler.edge.jsonc`         | OAuth, hosted auth, SPA assets, UI API                  |

## Routing (same hostname)

- **Edge** uses a
  [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  on `courtlistenermcp.blakeoxford.com` (see `wrangler.edge.jsonc`).
- **MCP** uses **zone routes** on `blakeoxford.com` for `/mcp`, `/mcp/*`,
  `/sse`, and `/sse/*` (see `wrangler.mcp.jsonc`). Zone routes are more specific
  than the custom-domain worker, so MCP traffic hits `courtlistener-mcp-mcp`
  while everything else stays on the edge worker.

If your zone name differs, update `zone_name` in `wrangler.mcp.jsonc`.

## Service binding

The edge worker calls the MCP worker for in-app AI tool RPC:

```jsonc
"services": [
  { "binding": "MCP_SERVICE", "service": "courtlistener-mcp-mcp" }
]
```

## Local development

```bash
pnpm run generate:web:spa
pnpm run dev:workers   # MCP :3001 + edge :8787 together
# optional third terminal:
pnpm exec vite --config src/web-spa/vite.config.ts   # SPA :5173 → proxies to :8787
```

Or run workers separately:

```bash
pnpm run dev:mcp     # :3001 — /mcp, /sse, queue
pnpm run dev:edge    # :8787 — OAuth, /auth, /api, SPA shell
```

When `MCP_SERVICE` is not bound (local `wrangler dev`), the edge worker forwards
MCP paths to `http://127.0.0.1:3001` by default. Override with env
`MCP_DEV_UPSTREAM_URL` in `.dev.vars` if needed. Production relies on the
service binding only (no dev upstream in `wrangler.edge.jsonc`).

Vite (`src/web-spa/vite.config.ts`) proxies `/api`, `/auth`, `/oauth`, etc. to
**port 8787** (edge), not 3001.

## Deploy order

```bash
pnpm run deploy
# auth-limiter → edge → mcp (edge must deploy before MCP so the async queue
# consumer moves off the legacy courtlistener-mcp script to courtlistener-mcp-mcp)
```

Edge migrations `v3`/`v4` remove local DO classes from the portal script
(classes live on `courtlistener-mcp-auth-limiter` and `courtlistener-mcp-mcp`).
First-time migration from the legacy monolith may require removing the async
queue consumer from `courtlistener-mcp` before the edge deploy:

```bash
wrangler queues consumer remove courtlistener-mcp-async-tool-jobs courtlistener-mcp
```

Deploy order is **auth-limiter → edge → mcp** so the queue consumer moves off
the portal script.

## Entry files

- `src/worker-edge.ts` — portal fetch + OAuth wrapper
- `src/worker-mcp.ts` — MCP fetch + queue consumer
- `src/worker/courtlistener-mcp-agent.ts` — `CourtListenerMCP` Durable Object
  class
- `src/worker.ts` — deprecated re-export of edge default + `CourtListenerMCP`

Bundle audit: `pnpm run ci:analyze:worker-bundle` (edge) and dry-run MCP config
separately.

## Post-deploy verification

```bash
curl -fsS https://courtlistenermcp.blakeoxford.com/health
curl -fsS -o /dev/null -w '%{http_code}\n' 'https://courtlistenermcp.blakeoxford.com/auth/start?return_to=https%3A%2F%2Fexample.com'
curl -fsS -X POST https://courtlistenermcp.blakeoxford.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2024-11-05' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"1.0.0"}}}'
```

Expect `/health` JSON from the edge worker, `/auth/start` **302** (not 503), and
MCP `initialize` with a `result` from the MCP worker routes.
