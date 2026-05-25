# Hosted auth HTML security contract

Worker-hosted sign-in and OAuth approval pages (`/auth/start`, `/oauth/approve`,
`/oauth/logout`, and related error/setup HTML) share one CSP profile so embedded
browsers (Chrome, Cursor) can submit same-origin forms reliably.

## Rules

1. **Omit `form-action`** on all hosted auth HTML responses. Listing explicit
   origins alongside `'self'` can block POSTs to `/oauth/approve` on the Worker
   origin when `redirect_uri` uses opaque or custom schemes (for example
   `cursor://…`).
2. **Approve form** must use `action="/oauth/approve"` with **no query string**.
   Pass `return_to` in a hidden POST field instead.
3. **Allowlisted inline script hashes** cover Cloudflare
   challenge/captive-portal injections. Hashes live in
   `src/server/hosted-auth-html-security.ts` and are asserted in unit tests and
   production probes.

## Verification

```bash
# Unit contract
npx tsx --test test/unit/test-hosted-auth-html-security.ts

# Production (no session required)
pnpm run test:e2e:oauth-approve-contract

# Full hosted-auth release gate (includes unit + optional remote probes)
pnpm run ci:auth-release-gate
```

When debugging a browser approve failure, confirm the approve **document**
response CSP has **no** `form-action` directive after a hard refresh.
