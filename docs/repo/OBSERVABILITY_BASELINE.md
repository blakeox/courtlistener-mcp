# Observability Baseline

## Core operational signals

- Request volume and success/failure rate by route.
- Error rate split by category:
  - `auth`
  - `origin/cors`
  - `upstream` (CourtListener/OIDC)
  - `validation`
- Latency percentiles (`p50`, `p95`, `p99`) for `/mcp` and `/health`.
- Session/auth lifecycle events (login success/failure, token validation
  failures).

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
- `authMode` (static/oidc where applicable)

## Incident-first troubleshooting flow

1. Confirm `/health` status.
2. Verify MCP initialize handshake on `/mcp`.
3. Check auth mode-specific failures (missing token, issuer mismatch).
4. Check CORS/origin rejection events.
5. Check upstream dependency failure rate and timeout spikes.

## Startup diagnostics interpretation

- `GET /startup-diagnostics` with `status=ok`: startup invariants passed;
  proceed with protocol/auth triage if traffic still fails.
- `status=error` with `invariants.errors`: treat as deploy-blocking
  configuration drift.
- `authPolicy.precedence`:
  - Unexpected order or missing mode indicates auth selection drift.
  - Verify `MCP_AUTH_PRIMARY`, `MCP_ALLOW_STATIC_FALLBACK`, and OIDC/static
    variables align with intended policy.

## Common incident remediation runbook

1. **Protocol negotiation failures (`invalid_protocol_version`)**
   - Confirm client sends `MCP-Protocol-Version`.
   - Validate server supported versions from current release and rerun protocol
     contract CI gate.
2. **Auth spike (`invalid_token`, `insufficient_scope`)**
   - Confirm active auth mode and key/issuer rotation state.
   - Re-run auth/security matrix gate locally before redeploy.
3. **Backpressure/429 increase**
   - Check `/health` diagnostics backpressure counters and session limits.
   - Reduce traffic burst or scale runtime, then retest stress/reliability gate.
4. **Startup invariant failures**
   - Inspect `/startup-diagnostics` invariant errors and missing env bindings.
   - Roll back if errors cannot be corrected quickly in-place.

## Cloudflare control-plane observability

Cloudflare-native telemetry is the primary operational evidence path. Use
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)
for structured invocation evidence,
[Workers Traces](https://developers.cloudflare.com/workers/observability/traces/)
for Edge-to-MCP and binding latency, and the
[Query Builder](https://developers.cloudflare.com/workers/observability/query-builder/)
for saved, low-cardinality investigations. Keep Analytics Engine limited to
deliberate aggregates; it is not the incident log.

### Required event envelope

Every application event must be safe to retain and should carry only bounded
operational dimensions:

- environment, worker role/name, deployment version ID, source/release ID;
- request/trace correlation ID, `cf-ray`, route class, method, transport;
- status/outcome class, sanitized error code, duration, and auth mode;
- binding target and dependency outcome;
- Durable Object class/operation class;
- Queue job ID, attempt, age bucket, terminal state, and DLQ disposition.

Never emit API keys, OAuth tokens, cookies, authorization headers, request
bodies, legal search terms, result bodies, generated Code Mode source, or raw
personal identifiers. Redaction tests are release gates, not dashboard
configuration.

### Saved-query and alert contract

Create one saved Query Builder query per signal below. Each query must name an
owner, baseline, threshold/window, notification path, retention rule, runbook,
and kill switch:

| Signal                  | Leading indicator                                    | Lagging indicator                        | Kill switch                                                  |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Edge-to-MCP binding     | `/ready` failures, binding exceptions                | MCP 5xx rate                             | Stop promotion; revert the paired Worker version             |
| Stale deployment        | Edge/MCP version mismatch                            | Protocol initialize failures             | Hold release; restore the last paired version                |
| Boundary/auth           | 401/403/409/429 rate by role                         | Successful authenticated request rate    | Disable async/Code Mode; preserve direct read-only MCP       |
| Durable Objects         | unavailable count and wake/init latency              | session/reconnect failure rate           | Stop promotion; do not reverse migrations                    |
| Queue                   | oldest-message age, retry count, backlog             | terminal-success/time-to-completion rate | Set `MCP_ASYNC_QUEUE_ENABLED=false`; leave direct MCP online |
| DLQ                     | new message count and reason                         | unrecovered job count                    | Disable async; preserve DLQ for inspection, do not purge     |
| Secret/config readiness | `/ready` check failures and config fingerprint drift | request/auth failure rate                | Stop deployment; rotate only the affected secret             |

### Incident evidence and kill-switch procedure

For every alert or release decision, capture the source SHA, Worker version IDs,
health/readiness receipts, saved-query URL/export, Queue/DLQ state, and the
operator decision. The first response is containment: disable new async work or
Code Mode, stop promotion, and keep synchronous read-only MCP available. Then
investigate using native logs/traces before changing configuration. Any
Cloudflare mutation requires an approved release receipt; local green tests do
not prove remote state.

Use Logpush only when retention or an external incident system requires it, and
use Tail Workers only when native filtering/redaction and Logpush cannot meet
the requirement. Neither becomes a second deployment authority.
