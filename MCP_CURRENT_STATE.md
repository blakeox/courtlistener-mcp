# MCP current state

**Protocol:** MCP 2026-07-28 / SDK v2 **Runtime:** Cloudflare Workers with
stateless Streamable HTTP at `/mcp` **Local runtime:** Node stdio CLI; local
Worker development uses the Edge/MCP Workers topology

## Current surface

- 52 governed tools, including three asynchronous job-control tools.
- 12 resources and 12 prompts.
- Structured tool output with generated input/output schemas.
- OAuth/OIDC edge authorization and Worker-native hosted auth.
- Queue-backed asynchronous workflows with KV durability.
- Unified health and readiness contracts across the Edge and MCP Workers.
- Optional progress notifications, native tasks, sampling, and catalog
  `listChanged` notifications.

## Canonical entrypoints

- `src/worker-edge.ts`: public edge, OAuth, hosted auth, and Workers Assets.
- `src/worker-mcp.ts`: stateless MCP service Worker.
- `src/index.ts`: local stdio/diagnostic CLI.

## Validation

- `test/integration/test-mcp-surface-protocol.ts`
- `test/integration/test-http-v2.ts`
- `test/unit/test-worker-mcp-v2.ts`
- `test/unit/test-runtime-health-contract.ts`
- `test/unit/test-manifest-contract.ts`
- `test:workers`, `test:spa:auth`, and the release/auth gates

Legacy HTTP+SSE, Express, inline-SPA, and enterprise Docker paths are removed;
the canonical production topology is documented in `docs/repo/WORKER_SPLIT.md`.

_Last updated: 2026-08-18_
