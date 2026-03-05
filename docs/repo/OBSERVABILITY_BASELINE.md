# Observability Baseline

## Core operational signals
- Request volume and success/failure rate by route.
- Error rate split by category:
  - `auth`
  - `origin/cors`
  - `upstream` (CourtListener/Supabase/OIDC)
  - `validation`
- Latency percentiles (`p50`, `p95`, `p99`) for `/mcp` and `/health`.
- Session/auth lifecycle events (login success/failure, token validation failures).

## Structured log field baseline
Use these fields consistently where possible across Worker and local runtimes:
- `timestamp`
- `level`
- `component`
- `message`
- `requestId`
- `route`
- `method`
- `status`
- `durationMs`
- `errorCode` (when applicable)
- `origin` (when applicable)
- `authMode` (static/oidc/supabase where applicable)

## Incident-first troubleshooting flow
1. Confirm `/health` status.
2. Verify MCP initialize handshake on `/mcp`.
3. Check auth mode-specific failures (missing token, issuer mismatch, Supabase key validation).
4. Check CORS/origin rejection events.
5. Check upstream dependency failure rate and timeout spikes.

## Startup diagnostics interpretation
- `GET /startup-diagnostics` with `status=ok`: startup invariants passed; proceed with protocol/auth triage if traffic still fails.
- `status=error` with `invariants.errors`: treat as deploy-blocking configuration drift.
- `authPolicy.precedence`:
  - Unexpected order or missing mode indicates auth selection drift.
  - Verify `MCP_AUTH_PRIMARY`, `MCP_ALLOW_STATIC_FALLBACK`, and Supabase/OIDC variables align with intended policy.

## Common incident remediation runbook
1. **Protocol negotiation failures (`invalid_protocol_version`)**
   - Confirm client sends `MCP-Protocol-Version`.
   - Validate server supported versions from current release and rerun protocol contract CI gate.
2. **Auth spike (`invalid_token`, `insufficient_scope`)**
   - Confirm active auth mode and key/issuer rotation state.
   - Re-run auth/security matrix gate locally before redeploy.
3. **Backpressure/429 increase**
   - Check `/health` diagnostics backpressure counters and session limits.
   - Reduce traffic burst or scale runtime, then retest stress/reliability gate.
4. **Startup invariant failures**
   - Inspect `/startup-diagnostics` invariant errors and missing env bindings.
   - Roll back if errors cannot be corrected quickly in-place.
