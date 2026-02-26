# E2E Auth + Chat Flow Test

This test verifies the full user journey against a deployed Worker:

1. Create account via `/api/signup`
2. Confirm user in Supabase Auth (admin API)
3. Login via `/api/login`
4. Verify `/api/session` authenticated
5. Logout and verify unauthenticated
6. Login again
7. Create API key from the browser UI (`/keys`, "Create key" action)
8. Call `/mcp` `initialize`
9. Call `/mcp` `tools/call` (equivalent to chat send)

## Command

```bash
E2E_BASE_URL="https://courtlistenermcp.blakeoxford.com" \
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SECRET_KEY="<secret-key>" \
pnpm run test:e2e:auth-chat-flow
```

## Optional Variables

- `E2E_EMAIL` fixed test email (default: generated unique email)
- `E2E_PASSWORD` fixed password
- `E2E_FULL_NAME` display name for signup
- `E2E_TURNSTILE_TOKEN` required only if Turnstile is enforced in your
  deployment
- `E2E_MCP_TOOL` tool for MCP call (default: `search_cases`)
- `E2E_MCP_PROMPT` tool input prompt

## Notes

- The script uses cookie-jar + CSRF handling exactly like the browser UI.
- User confirmation is done through Supabase Admin API to avoid manual
  email-clicking in automated runs.
- Key issuance is intentionally exercised through Playwright browser automation
  to validate the same flow real users use.
- If you need to verify actual email delivery/click paths, pair this with a
  mailbox-based test harness.

## GitHub Actions

Workflow: `.github/workflows/e2e-auth-chat-flow.yml`

Configure these repository secrets:

- `E2E_BASE_URL`
- `E2E_SUPABASE_URL`
- `E2E_SUPABASE_SECRET_KEY`
- `E2E_TURNSTILE_TOKEN` (optional; only if Turnstile is enabled)
