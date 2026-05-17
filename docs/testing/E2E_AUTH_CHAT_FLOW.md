# E2E Hosted OAuth Handshake Test

This test verifies the deployed Worker-owned hosted OAuth handshake:

1. Fetch authorization-server metadata
2. Fetch protected-resource metadata
3. Register a public OAuth client
4. Request `/oauth/authorize` (not legacy `/authorize`, which may hit Cloudflare
   Access)
5. Verify redirect into same-origin Worker `/auth/start`
6. Verify hosted-auth readiness headers and handoff page behavior

## Command

```bash
E2E_BASE_URL="https://courtlistenermcp.blakeoxford.com" \
pnpm run test:e2e:oauth-remote
```

## Optional Variables

- `OAUTH_CLIENT_ORIGIN` client origin used for DCR and metadata checks
- `OAUTH_REDIRECT_URI` redirect URI used for the OAuth authorization request
- `OAUTH_SCOPE` scope requested during the authorization probe
- `OAUTH_CLIENT_ID` or `E2E_OAUTH_CLIENT_ID` skip dynamic registration when
  CI/WAF blocks DCR
- `OAUTH_REGISTRATION_RETRIES` retries transient registration failures like
  `403`/`429`/`5xx` (default `3`)

## Notes

- The probe follows the current Worker-owned OAuth flow and no longer relies on
  removed legacy signup/login/key-management routes.
- The deeper browser login and upstream IdP callback path remains covered by
  focused unit tests and the auth release gate’s hosted-auth route coverage.

## GitHub Actions

Workflow: `.github/workflows/e2e-auth-chat-flow.yml`

This workflow probes a deployed remote base URL from `E2E_BASE_URL`. It is not
coupled to the code in the current commit, so it runs as a manual/scheduled
deployment monitor instead of a `push` gate for `main`.

Configure these repository secrets:

- `E2E_BASE_URL`
- `E2E_OAUTH_CLIENT_ID` (optional) long-lived probe client when GitHub Actions
  IPs cannot register
