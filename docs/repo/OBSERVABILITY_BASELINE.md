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
