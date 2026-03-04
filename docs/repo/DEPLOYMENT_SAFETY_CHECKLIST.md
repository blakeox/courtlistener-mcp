# Deployment Safety Checklist (Worker + Local Parity)

## Pre-deploy checks (required)
1. Install/build:
   - `pnpm install`
   - `pnpm run build` (when baseline TypeScript state allows)
2. Protocol smoke tests:
   - `npm run test:mcp`
3. Cloudflare readiness:
   - `pnpm run cloudflare:check`
4. Confirm required secrets:
   - `COURTLISTENER_API_KEY`
   - At least one auth mode (`MCP_AUTH_TOKEN` or `OIDC_ISSUER` or Supabase server auth pair)
5. Confirm runtime parity inputs:
   - `MCP_ALLOWED_ORIGINS` aligned with expected browser clients
   - session secret source available (`MCP_UI_SESSION_SECRET` or `SUPABASE_PUBLISHABLE_KEY`)

## Post-deploy verification
1. `GET /health` returns success.
2. MCP initialize succeeds on `/mcp`.
3. CORS check from expected origin succeeds.
4. Authentication path expected for current mode (static/OIDC/Supabase).

## Fast rollback playbook
1. Identify last known good deployment.
2. Redeploy previous commit/tag:
   - `wrangler deploy --env <env> --compatibility-date <date>` (using previous artifact/commit context)
3. Re-run:
   - `/health` check
   - MCP initialize smoke test
4. Tail logs for 5–10 minutes:
   - `pnpm run cloudflare:tail`
5. Open incident follow-up item with:
   - trigger condition
   - blast radius
   - prevention action
