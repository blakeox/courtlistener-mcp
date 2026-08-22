# Deployment Safety Checklist (Worker + Local Parity)

## Pre-deploy checks (required)

1. Install/build:
   - `pnpm install`
   - `pnpm run build` (when baseline TypeScript state allows)
2. Protocol smoke tests:
   - `pnpm run test:mcp`
   - `pnpm run test:runtime-parity:certify` (artifact:
     `test-output/runtime-parity/certification-report.json`)
   - `pnpm run ci:auth-release-gate` for hosted auth regressions across handoff,
     HTML CSP contract, and (when `OAUTH_BASE_URL` is set) production approve
     probes runtime trust boundaries, authorize flow, and Worker auth handoff
3. Worker startup profiling:
   - `pnpm run cloudflare:check:startup`
4. Cloudflare readiness:
   - `pnpm run cloudflare:check`
5. Confirm required secrets:
   - `COURTLISTENER_API_KEY`
   - At least one auth mode (`MCP_AUTH_TOKEN` or `OIDC_ISSUER`)
   - `MCP_UI_SESSION_SECRET` for Worker-owned browser auth/session signing
   - `MCP_OAUTH_REGISTRATION_TOKEN_SECRET` so DCR management tokens do not reuse
     UI session or API-key material
   - if Turnstile is enforced, both `TURNSTILE_SITE_KEY` and
     `TURNSTILE_SECRET_KEY`
   - if Cloudflare analytics emission is enabled,
     `MCP_CF_ANALYTICS_ENABLED=true`
6. Confirm runtime parity inputs:
   - `MCP_ALLOWED_ORIGINS` aligned with expected browser clients
   - session secret configured (`MCP_UI_SESSION_SECRET`)
   - if Worker-native hosted auth is enabled, verify `OIDC_ISSUER` plus the
     complete upstream client pair (`MCP_AUTH_OIDC_CLIENT_*`)
   - if browser auth is delegated to Cloudflare Access, verify
     `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true`,
     `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true`, and Access protection on
     `/oauth/authorize` plus `/oauth/approve`
   - block deploy on partial hosted-auth env drift (for example only one of
     `MCP_AUTH_OIDC_CLIENT_ID` / `MCP_AUTH_OIDC_CLIENT_SECRET`)
   - block deploy if `LOGTO_APP_ID` or `LOGTO_APP_SECRET` is present
   - set `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS` explicitly instead of
     relying on the 24h default
   - if `MCP_TRUST_CLOUDFLARE_ACCESS_JWT_ASSERTION` or
     `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS` is enabled, require
     `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true`
   - hosted auth is Worker-owned and same-origin only; no external auth-origin
     override is supported
   - if queue-backed async execution is enabled, bind both `ASYNC_TOOL_QUEUE`
     and `ASYNC_JOBS_KV`
   - if Turnstile is enforced, set `MCP_TURNSTILE_ENFORCED_ROUTES` explicitly
     (current route ids: `session_bootstrap`, `ai_chat`)

The GitHub Actions release controller enforces the dedicated-secret gate, so a
missing `MCP_OAUTH_REGISTRATION_TOKEN_SECRET` blocks a release instead of
silently falling back to UI-session or CourtListener API-key material.

## Post-deploy verification

1. `GET /health` returns success.
2. MCP v2 `server/discover` and an envelope-bearing request succeed on `/mcp`.
3. CORS check from expected origin succeeds.
4. Authentication path expected for current mode (static/OIDC).
5. Hosted browser auth probe and approval journey:
   - Worker-native mode: `GET /auth/start?continue=1` redirects only when hosted
     auth is fully ready
   - Cloudflare Access mode: `GET /oauth/authorize?...` redirects to the Access
     login boundary before the Worker sees the request
   - a real `/oauth/authorize` browser flow reaches `/oauth/approve` before
     completing OAuth
6. Registration management token policy:
   - dedicated `MCP_OAUTH_REGISTRATION_TOKEN_SECRET` configured
   - explicit `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS` value recorded for the
     deploy

## Canary promotion criteria (protocol/runtime)

1. Keep first rollout to a canary slice and observe for at least 10 minutes.
2. Promote only if all are true:
   - MCP protocol contract checks remain green (`test:mcp`, protocol
     governance/unit contract checks).
   - Auth/security matrix checks remain green (gateway + worker auth handoff
     suites).
   - Hosted auth release gate remains green (`pnpm run ci:auth-release-gate`).
   - Runtime parity certification stays green with zero diffs
     (`pnpm run ci:runtime-safety-gate`).
   - Performance certification remains within gate budgets
     (`pnpm run ci:perf-gate -- performance-data/load-profile-baseline.json performance-data/load-profile-current.json`).
   - Combined release-readiness gate remains green
     (`pnpm run ci:release-readiness-gate -- --light --base-url http://127.0.0.1:8787`).
   - Async workflow contracts remain green
     (`test/unit/test-async-tool-execution-service.ts`).
   - Startup diagnostics invariants stay `status=ok` on `/startup-diagnostics`.
   - No sustained increase in `5xx`, `429`, or auth failures on `/mcp` and
     `/health`.
3. Block promotion and trigger rollback if protocol negotiation failures, auth
   regression, or startup invariant errors appear.
4. Treat missing Access acknowledgement or missing dedicated registration-token
   secret as rollout blockers for hosted auth.

## Fast rollback playbook

1. Identify last known good deployment.
2. Use the recorded release state and the versioned release controller:
   - `pnpm run cloudflare:release -- --environment <env> --phase rollback --release-id <release-id> --source-sha <40-char-sha> --state-file release-state.json`
   - In CI, rerun the Cloudflare Release Controller workflow with the same
     release state and select its rollback path.
3. Re-run:
   - `/health` check
   - MCP v2 discovery and envelope smoke tests
4. Tail logs for 5–10 minutes:
   - `pnpm run cloudflare:tail:edge` and/or `pnpm run cloudflare:tail:mcp`
5. Open incident follow-up item with:
   - trigger condition
   - blast radius
   - prevention action
6. Record rollback reason as one of:
   - `protocol_contract_regression`
   - `auth_security_regression`
   - `startup_diagnostics_invariant_failure`
   - `stress_or_reliability_regression`
