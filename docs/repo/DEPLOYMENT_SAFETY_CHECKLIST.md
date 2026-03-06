# Deployment Safety Checklist (Worker + Local Parity)

## Pre-deploy checks (required)
1. Install/build:
   - `pnpm install`
   - `pnpm run build` (when baseline TypeScript state allows)
2. Protocol smoke tests:
   - `npm run test:mcp`
   - `pnpm run test:runtime-parity:certify` (artifact: `test-output/runtime-parity/certification-report.json`)
3. Cloudflare readiness:
   - `pnpm run cloudflare:check`
4. Confirm required secrets:
   - `COURTLISTENER_API_KEY`
   - At least one auth mode (`MCP_AUTH_TOKEN` or `OIDC_ISSUER`)
5. Confirm runtime parity inputs:
   - `MCP_ALLOWED_ORIGINS` aligned with expected browser clients
   - session secret configured (`MCP_UI_SESSION_SECRET`)

## Post-deploy verification
1. `GET /health` returns success.
2. MCP initialize succeeds on `/mcp`.
3. CORS check from expected origin succeeds.
4. Authentication path expected for current mode (static/OIDC).

## Canary promotion criteria (protocol/runtime)
1. Keep first rollout to a canary slice and observe for at least 10 minutes.
2. Promote only if all are true:
   - MCP protocol contract checks remain green (`test:mcp`, protocol governance/unit contract checks).
   - Auth/security matrix checks remain green (gateway + worker auth contract suites).
   - Runtime parity certification stays green with zero diffs (`pnpm run ci:runtime-safety-gate`).
   - Performance certification remains within gate budgets (`pnpm run ci:perf-gate -- performance-data/load-profile-baseline.json performance-data/load-profile-current.json`).
   - Combined release-readiness gate remains green (`pnpm run ci:release-readiness-gate -- --light --base-url http://127.0.0.1:3002`).
   - Async workflow contracts remain green (`test/unit/test-async-tool-execution-service.ts`).
   - Startup diagnostics invariants stay `status=ok` on `/startup-diagnostics`.
   - No sustained increase in `5xx`, `429`, or auth failures on `/mcp` and `/health`.
3. Block promotion and trigger rollback if protocol negotiation failures, auth regression, or startup invariant errors appear.

## Fast rollback playbook
1. Identify last known good deployment.
2. Redeploy previous commit/tag:
   - `wrangler deploy --env <env> --compatibility-date <date>` (using previous artifact/commit context)
3. Re-run:
   - `/health` check
   - MCP initialize smoke test
4. Tail logs for 5–10 minutes:
   - `pnpm run cloudflare:tail`
5. Open incident follow-up item with:
   - trigger condition
   - blast radius
   - prevention action
6. Record rollback reason as one of:
   - `protocol_contract_regression`
   - `auth_security_regression`
   - `startup_diagnostics_invariant_failure`
   - `stress_or_reliability_regression`
