# Phase 2B implementation status

The original Phase 2B document described the pre-Cloudflare Express server,
including `error-boundary.ts`, `error-recovery.ts`,
`enhanced-express-server.ts`, and an Express demonstration. Those modules and
demos were removed during the MCP v2/Cloudflare Workers cutover and are no
longer supported.

Current runtime controls are documented and tested through:

- `src/worker-edge.ts` and `src/worker-mcp.ts` for the two Worker entrypoints.
- `pnpm run dev:workers` for the local Edge + MCP Worker topology.
- `src/infrastructure/runtime-health-contract.ts` for shared health payloads.
- `test/integration/test-http-v2.ts` and the Worker MCP v2 test suites.
- `docs/repo/WORKER_SPLIT.md` for the production topology.

This file is retained only as a migration marker so historical references do not
imply that the removed Express implementation remains deployable.
