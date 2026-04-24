# Auth `/auth/start` Integration

This repo is the OAuth/resource server. The Worker owns the hosted auth surface
on the same origin.

## Flow

1. MCP client hits `/authorize` on this worker.
2. If identity is missing and Worker-native hosted auth is configured, the
   worker redirects to same-origin `/auth/start?return_to=<authorize_url>`.
3. The Worker-native path redirects to the upstream OIDC provider, exchanges the
   callback code, sets `clmcp_ui`, and for `/authorize` return targets stops on
   a same-site approval screen before completing OAuth.

## Worker env required

- `OIDC_ISSUER=<issuer for provider access tokens>`
- `OIDC_AUDIENCE=<audience/resource expected by the worker>`
- `OIDC_JWKS_URL=<jwks url>` (optional)
- `MCP_AUTH_OIDC_CLIENT_ID=<upstream OIDC client id>` (preferred for same-origin
  Worker auth)
- `MCP_AUTH_OIDC_CLIENT_SECRET=<upstream OIDC client secret>` (preferred for
  same-origin Worker auth)
- `MCP_AUTH_OIDC_SCOPES=<optional scopes; defaults to openid profile email>`
- `LOGTO_APP_ID=<traditional app id>` and
  `LOGTO_APP_SECRET=<traditional app secret>` remain supported only as a
  migration fallback when the Worker-native `MCP_AUTH_OIDC_CLIENT_*` pair is
  entirely absent
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
- Readiness now requires all of: `OIDC_ISSUER`, one complete upstream client
  pair (`MCP_AUTH_OIDC_CLIENT_*` preferred, otherwise `LOGTO_APP_*`), and
  `MCP_UI_SESSION_SECRET`.
- Partial Worker-native credentials do not fall back to `LOGTO_APP_*`; they fail
  closed until the generic pair is completed or removed.
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
2. Confirm redirect to `https://<worker>/auth/start?return_to=...`.
3. Sign in via the configured provider.
4. Confirm the Worker shows an approval screen before completing browser-session
   `/authorize` requests.
5. Confirm a direct probe of `https://<worker>/auth/start?continue=1` returns
   `302` only when hosted auth is fully ready and a non-redirect with setup
   guidance when it is not.
6. Confirm `MCP_OAUTH_REGISTRATION_TOKEN_SECRET` is set so DCR management token
   rotation is decoupled from UI session rotation.
7. If Cloudflare Access trust is enabled, confirm
   `MCP_TRUST_CLOUDFLARE_ACCESS_ACKNOWLEDGED=true` is present in deploy config
   and intentional.
8. Confirm `GET /api/usage` returns user counters after MCP calls.
