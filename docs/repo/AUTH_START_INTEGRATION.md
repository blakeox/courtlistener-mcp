# Auth `/auth/start` Integration

This repo is the OAuth/resource server. The Worker owns the hosted auth surface
on the same origin.

## Flow

1. MCP client hits `/oauth/authorize` on this worker.
2. If identity is missing and Worker-native hosted auth is configured, the
   worker redirects to same-origin `/auth/start?return_to=<authorize_url>`.
3. If `/oauth/authorize` is instead protected by Cloudflare Access and
   `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true`, the Worker can bootstrap
   its own UI session from trusted Access identity headers on `/oauth/approve`
   and continue to the same approval step without any upstream OIDC client pair.
4. The Worker-native path redirects to the upstream OIDC provider, exchanges the
   callback code, sets `clmcp_ui`, and for `/oauth/authorize` return targets
   stops on a same-site approval screen before completing OAuth.

The browser-auth contract is canonical and uses only the `/oauth/*` path set.
Former aliases are not routed and return the normal `404` response.

## Worker env required

- `OIDC_ISSUER=<issuer for provider access tokens>`
- `OIDC_AUDIENCE=<audience/resource expected by the worker>`
- `OIDC_JWKS_URL=<jwks url>` (optional)
- `MCP_AUTH_OIDC_CLIENT_ID=<upstream OIDC client id>` (required for same-origin
  Worker auth)
- `MCP_AUTH_OIDC_CLIENT_SECRET=<upstream OIDC client secret>` (required for
  same-origin Worker auth)
- `MCP_AUTH_OIDC_SCOPES=<optional scopes; defaults to openid profile email>`
- `MCP_UI_SESSION_SECRET=<strong random secret>` (required; hosted auth is not
  considered healthy without it)
- Development identity fallback is removed; use the hosted auth handoff or a
  real OIDC bearer identity in every environment.
- `MCP_OAUTH_REGISTRATION_TOKEN_SECRET=<dedicated DCR management-token signing secret>`
  (recommended so registration token rotation is decoupled from UI
  session/API-key rotation)
- `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS=<seconds>` (optional; defaults to
  `86400`, but set it explicitly for hosted environments)
- `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` only when intentionally
  enabling one of the scoped Cloudflare Access trust flags for a trusted edge
  deployment
- `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true` only when
  `/oauth/authorize` and `/oauth/approve` are actually protected by Cloudflare
  Access or another edge that strips spoofed `cf-access-authenticated-user-*`
  headers
- Optional bootstrap throttles:
  - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
  - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
  - `MCP_UI_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`

## Current route behavior

- Worker-native hosted auth routes:
  - `/auth/start`
  - `/auth/callback`
  - `/oauth/approve`
  - `/oauth/logout`
- Readiness now requires all of: `OIDC_ISSUER`, the complete upstream client
  pair (`MCP_AUTH_OIDC_CLIENT_*`), and `MCP_UI_SESSION_SECRET`.
- In Cloudflare Access browser-auth mode, `/oauth/approve` can bootstrap the
  Worker UI session directly from trusted Access identity headers, but
  `/auth/start` is still only the Worker-native upstream-OIDC handoff surface.
- Partial Worker-native credentials fail closed until the pair is completed or
  removed.
- Hosted auth always starts on the Worker origin; external auth-origin overrides
  are not supported.
- DCR management tokens require `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`; without
  it registration management tokens are disabled.
- Authorization-server metadata advertises the modern Client ID Metadata
  Document (CIMD) path. The `/register` endpoint remains available for RFC 7591
  clients during the compatibility window; both paths resolve through the same
  OAuth client policy.
- Hosted-auth responses now emit stable `X-Hosted-Auth-*` metadata for
  dashboards and alerts:
  - `X-Hosted-Auth-Ready`
  - `X-Hosted-Auth-Status`
  - `X-Hosted-Auth-Error` (when a concrete failure reason exists)
  - `X-Hosted-Auth-Route`
  - `X-Hosted-Auth-Outcome` (`redirect`, `interactive`, `completed`, `rejected`,
    `unavailable`)
  - `X-Hosted-Auth-Category` (for coarse alert grouping such as
    `misconfiguration`, `timeout`, `dependency`, `security`)
  - `X-Hosted-Auth-Signal` (stable low-cardinality counter key such as
    `ready_redirect`, `config_missing`, `csrf_validation_failed`)
  - `X-Hosted-Auth-Failure` (`true` for `rejected`/`unavailable` responses)
  - `X-Hosted-Auth-Terminal` (`true` when the current route ended the flow
    rather than continuing it)
  - `X-Hosted-Auth-Correlation-Id` (stable across the normal `/auth/start` →
    `/auth/callback` → `/oauth/approve` → `/oauth/logout` browser journey)
  - `X-Hosted-Auth-Credential-Source`
  - `X-Hosted-Auth-Config-Error-Count`
  - `X-Hosted-Auth-Duration-Ms` (overall route handling time)
  - Route-specific duration headers when relevant:
    - `X-Hosted-Auth-Upstream-Discovery-Duration-Ms`
    - `X-Hosted-Auth-Upstream-Discovery-Cache` (`hit` or `miss`)
    - `X-Hosted-Auth-Token-Exchange-Duration-Ms`
    - `X-Hosted-Auth-Token-Verification-Duration-Ms`
    - `X-Hosted-Auth-JWKS-Fetch-Duration-Ms`
    - `X-Hosted-Auth-Session-Creation-Duration-Ms`
    - `X-Hosted-Auth-Approval-Duration-Ms`
    - `X-Hosted-Auth-Logout-Duration-Ms`
- The matching diagnostics log payload now includes `hosted_auth_signal`,
  `hosted_auth_failure`, and `hosted_auth_terminal` so alerts can aggregate by
  stable fields instead of parsing free-form event names.

## Troubleshooting

### Durable Objects free-tier duration quota (HTTP 503 / alert email)

Cloudflare bills Durable Object **duration** (CPU + storage I/O time while a DO
is active). This repo uses two DO classes:

- **`AuthFailureLimiterDO`** — auth rate limits and bounded usage counters. MCP
  v2 request handling is stateless and does not use a per-client MCP session
  Durable Object.

If you receive a “90% of daily Durable Objects free tier limit” email, check
`/health` → `diagnostics.metrics.latency_ms.durable_objects.*` on the edge and
MCP workers.

**Immediate mitigation (no deploy):**

1. Wait for the quota reset (midnight UTC).
2. Upgrade to the **Workers Paid** plan for production traffic.
3. Temporarily reduce DO load via env vars:
   - `MCP_BOUNDARY_GUARDS_ENABLED=false` — removes bundled boundary/replay DO
     calls per MCP request
   - `MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED=false` — disables auth/OAuth limiter
     DO calls

**Code-side optimizations (deploy auth-limiter + MCP workers):**

- MCP boundary + replay checks are bundled into **one** DO call per request.
- Successful MCP auth skips a redundant **clear** DO call when the client has no
  failure state.

See `docs/repo/WORKER_BUNDLE_AUDIT.md` for architecture context.

### `oauth_route_rate_limit_unavailable` (HTTP 503)

```json
{
  "error": "Unable to validate OAuth route rate limit.",
  "error_code": "oauth_route_rate_limit_unavailable"
}
```

**Root cause (production):** the `AUTH_FAILURE_LIMITER` Durable Object could not
run. On the Workers **free tier**, tail logs often show:

`Exceeded allowed duration in Durable Objects free tier.`

**Fix options:**

1. Upgrade the Cloudflare Workers plan (recommended for production hosted auth).
2. Wait for the free-tier DO duration quota to reset.
3. Set `MCP_AUTH_FAILURE_RATE_LIMIT_ENABLED=false` to skip limiter calls
   entirely.
4. Keep the default `MCP_AUTH_FAILURE_RATE_LIMIT_FAIL_OPEN=true` so OAuth and
   session bootstrap continue when the limiter is down (throttling disabled
   until the limiter works again). Set to `false` only if you require strict
   fail-closed behavior.

Check `/health` on the **edge** worker →
`diagnostics.metrics.latency_ms.durable_objects.auth_limiter.unavailable_count`
and `pnpm run cloudflare:tail:edge` (or `cloudflare:tail:mcp` for MCP-only
issues) for `auth_limiter_fetch_error`.

Hosted auth (`/auth/start`) runs on the **edge** worker (`courtlistener-mcp`),
not the MCP worker — see `docs/repo/WORKER_SPLIT.md`.

## Verification checklist

1. Open MCP OAuth flow from ChatGPT/Codex.
2. In Worker-native mode, confirm redirect to
   `https://<worker>/auth/start?return_to=...`.
3. In Cloudflare Access mode, confirm `/oauth/authorize` first redirects to the
   Access login boundary for the protected route.
4. Sign in via the configured provider or Access login boundary.
5. Confirm the Worker shows an approval screen before completing browser-session
   `/oauth/authorize` requests.
6. Confirm a direct probe of `https://<worker>/auth/start?continue=1` returns
   `302` only when hosted auth is fully ready and a non-redirect with setup
   guidance when it is not.
7. Confirm `MCP_OAUTH_REGISTRATION_TOKEN_SECRET` is set so DCR management token
   rotation is decoupled from UI session rotation.
8. If Cloudflare Access trust is enabled, confirm
   `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` is present in deploy config
   and intentional.
9. Confirm `GET /api/usage` returns user counters after MCP calls.
10. Confirm hosted auth HTML CSP omits `form-action` and the approve form uses
    `action="/oauth/approve"` with `return_to` in the POST body (see
    `docs/repo/HOSTED_AUTH_HTML_SECURITY.md`). Run
    `pnpm run test:e2e:oauth-approve-contract` against production after auth
    changes.
