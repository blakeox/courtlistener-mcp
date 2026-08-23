# CourtListener MCP architecture

This repository is a Cloudflare Workers deployment with a local MCP v2 parity
harness. The production topology is intentionally split into small Workers so
that OAuth/UI traffic, MCP tool execution, and rate limiting have separate blast
radii.

## Production topology

```text
Browser / MCP client
        |
        v
courtlistener-mcp (edge Worker)
  OAuth, hosted auth, SPA Assets, UI APIs
        |
        | service binding: MCP_SERVICE
        v
courtlistener-mcp-mcp (MCP Worker)
  stateless MCP v2 /mcp, tools, resources, prompts, async queue consumer
        |
        +--> CourtListener REST API
        +--> KV/Analytics/Queues as configured

courtlistener-mcp-auth-limiter (Durable Object Worker)
  shared auth-failure and front-door rate-limit state
```

The authoritative deployment files are `wrangler.edge.jsonc`,
`wrangler.mcp.jsonc`, and `wrangler.auth-limiter.jsonc`. Staging and test
variants are checked for binding and environment isolation before deployment.

## Runtime entrypoints

- `src/worker-edge.ts` is the public edge Worker. It owns OAuth, hosted auth,
  SPA Assets, UI APIs, and forwarding to the MCP service binding.
- `src/worker-mcp.ts` is the private MCP Worker. It owns the canonical,
  stateless `/mcp` route and the async tool queue consumer.
- `src/worker-auth-limiter.ts` hosts the Durable Object used by the edge and MCP
  Workers for bounded auth-failure state.
- `src/index.ts` provides the local stdio MCP v2 runtime.
- `test/tools/runtime-parity-certification.ts` provides deterministic parity
  checks between the local stdio contracts and the Cloudflare Worker runtime.

## MCP v2 contract

The production and local runtimes use the MCP server package plus the Cloudflare
Agents MCP wrapper. The canonical protocol is `2026-07-28`.

- Discovery uses `server/discover` with the modern metadata envelope.
- Requests are stateless; no MCP session is stored in a Durable Object.
- Legacy claimless `initialize` traffic and `/sse` ingress are rejected.
- The canonical remote endpoint is `/mcp` over Streamable HTTP.
- Tools, resources, prompts, output schemas, and annotations are registered from
  the shared tool registry and generated schema contracts.

The Worker boundary owns origin, authorization, protocol-version, rate-limit,
and abuse-policy checks. The MCP SDK owns protocol dispatch after the request
passes that boundary.

## Application layers

```text
Worker entrypoints
  -> route composition and request policy
  -> OAuth / auth / rate-limit services
  -> MCP v2 server factory
  -> tool registry and execution service
  -> domain handlers
  -> CourtListener API client and bounded cache
```

Domain handlers live under `src/domains/` and are registered by
`src/infrastructure/bootstrap.ts`. Shared infrastructure includes structured
logging, configuration validation, circuit breaking, bounded caching, runtime
health contracts, and Cloudflare telemetry.

## Cloudflare resources

Wrangler configurations are the source of truth for deployed bindings:

- Workers Assets serves the generated SPA from `.spa-dist`.
- Service bindings keep edge-to-MCP traffic private and local to Cloudflare.
- KV stores OAuth and bounded async-job state.
- Queues provide durable async tool execution with retry and dead-letter
  handling.
- Durable Objects provide bounded auth-failure rate-limit state.
- Analytics Engine receives structured operational telemetry.
- Cloudflare AI is available through the MCP Worker binding where configured.

Terraform is limited to explicitly owned Cloudflare resources and follows an
import-first, non-destructive plan policy. Wrangler-generated bindings are
validated before CI or release promotion.

## Validation and release flow

The dependency order is:

1. `pnpm install --frozen-lockfile`
2. version, formatting, type, and repository-hygiene checks
3. generated Wrangler bindings and IaC ownership checks
4. unit, integration, SPA, and Workers-runtime tests
5. Wrangler dry-run bundle review and MCP v2 contract validation
6. authenticated Cloudflare setup, environment, and live-inventory checks
7. ordered production deployment: auth limiter, edge, then MCP

The production `deploy` script fails closed when required secrets, environment
isolation, live inventory, or dedicated DCR signing controls are missing.
Rollback uses a previously validated Worker version; it does not attempt
destructive Durable Object lifecycle changes.

See [`docs/repo/WORKER_SPLIT.md`](docs/repo/WORKER_SPLIT.md),
[`docs/repo/DEPLOYMENT_SAFETY_CHECKLIST.md`](docs/repo/DEPLOYMENT_SAFETY_CHECKLIST.md),
and [`docs/repo/WORKER_BUNDLE_AUDIT.md`](docs/repo/WORKER_BUNDLE_AUDIT.md) for
operational detail.
