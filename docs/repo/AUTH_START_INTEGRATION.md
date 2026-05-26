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

Legacy `/authorize`, `/auth/approve`, and `/auth/logout` aliases are still
recognized by the Worker, but the published browser-auth contract is now the
`/oauth/*` path set.

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
- `MCP_ALLOW_DEV_FALLBACK=false` (recommended in production; enabling it with
  `MCP_OAUTH_DEV_USER_ID` now emits explicit startup risk warnings and is
  rejected when `NODE_ENV=production`)
- `MCP_OAUTH_REGISTRATION_TOKEN_SECRET=<dedicated DCR management-token signing secret>`
  (recommended so registration token rotation is decoupled from UI
  session/API-key rotation)
- `MCP_OAUTH_REGISTRATION_TOKEN_TTL_SECONDS=<seconds>` (optional; defaults to
  `86400`, but set it explicitly for hosted environments)
- `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` only when intentionally
  enabling one of the scoped Cloudflare Access trust flags for a trusted edge
  deployment
- `MCP_TRUST_CLOUDFLARE_ACCESS_IDENTITY_HEADERS=true` only when `/authorize` and
  `/auth/approve` are actually protected by Cloudflare Access or another edge
  that strips spoofed `cf-access-authenticated-user-*` headers
- Optional bootstrap throttles:
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`

## Current route behavior

- Worker-native hosted auth routes:
  - `/auth/start`
  - `/auth/callback`
  - `/auth/approve`
  - `/auth/logout`
- Readiness now requires all of: `OIDC_ISSUER`, the complete upstream client
  pair (`MCP_AUTH_OIDC_CLIENT_*`), and `MCP_UI_SESSION_SECRET`.
- In Cloudflare Access browser-auth mode, `/auth/approve` can bootstrap the
  Worker UI session directly from trusted Access identity headers, but
  `/auth/start` is still only the Worker-native upstream-OIDC handoff surface.
- Partial Worker-native credentials fail closed until the pair is completed or
  removed.
- `MCP_AUTH_UI_ORIGIN` is deprecated and ignored; hosted auth always starts on
  the Worker origin.
- DCR management tokens should use `MCP_OAUTH_REGISTRATION_TOKEN_SECRET`;
  without it they fall back to `MCP_UI_SESSION_SECRET` or
  `COURTLISTENER_API_KEY`.
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
    `/auth/callback` → `/auth/approve` → `/auth/logout` browser journey)
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

## Verification checklist

1. Open MCP OAuth flow from ChatGPT/Codex.
2. In Worker-native mode, confirm redirect to
   `https://<worker>/auth/start?return_to=...`.
3. In Cloudflare Access mode, confirm `/authorize` first redirects to the Access
   login boundary for the protected route.
4. Sign in via the configured provider or Access login boundary.
5. Confirm the Worker shows an approval screen before completing browser-session
   `/authorize` requests.
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
