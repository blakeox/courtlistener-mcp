# Clerk Portal

A minimal Next.js App Router frontend for the CourtListener MCP auth handoff.

## What it does

- Signs users in with Clerk
- Requests a Clerk JWT template token
- Completes one of two worker handoff paths:
  - `POST /api/session/oauth-complete` for OAuth `/authorize` handoffs
  - `POST /api/session/bootstrap` for direct browser-session bootstrap
- Redirects back to the worker once the handoff succeeds

## Required environment variables

Copy `.env.example` to `.env.local` and fill in the values:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_MCP_ORIGIN`
- `NEXT_PUBLIC_MCP_ADDITIONAL_ORIGINS`
- `NEXT_PUBLIC_CLERK_TOKEN_TEMPLATE`

Recommended defaults already included:

- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/start`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/start`
- `NEXT_PUBLIC_MCP_ADDITIONAL_ORIGINS=https://courtlistener-mcp.blakeoxford.workers.dev`

## Run locally

```bash
cd apps/clerk-portal
pnpm install
pnpm dev
```

Open `http://localhost:3000/` (it redirects to `/auth/start`).

## Run with Wrangler preview

Copy the local secrets file and then use the OpenNext preview adapter:

```bash
cd apps/clerk-portal
cp .dev.vars.example .dev.vars
pnpm install
pnpm preview
```

This uses `open-next.config.ts` and `wrangler.jsonc` to run the app in a Workers-compatible preview mode.

## Deploy with Wrangler

The app is configured for Cloudflare Workers using the OpenNext adapter.

```bash
cd apps/clerk-portal
pnpm install
pnpm deploy
```

If you want a custom domain, add it in Cloudflare after the first deployment, then update the MCP worker to point `MCP_AUTH_UI_ORIGIN` at that deployed auth portal origin.

Wrangler variables are defined in `wrangler.jsonc` for public values. Secrets such as `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` should be added as Cloudflare secrets or Workers Build variables.

## Match these worker settings

Your MCP worker must trust the same Clerk instance and token template:

```bash
OIDC_ISSUER=https://clerk.auth.courtlistenermcp.blakeoxford.com
OIDC_JWKS_URL=https://clerk.auth.courtlistenermcp.blakeoxford.com/.well-known/jwks.json
OIDC_AUDIENCE=courtlistener-mcp
MCP_AUTH_UI_ORIGIN=http://localhost:3000
```

For production, change `MCP_AUTH_UI_ORIGIN` to the deployed origin of this app.

## Cloudflare files

- `wrangler.jsonc`: Worker config for the OpenNext output
- `open-next.config.ts`: OpenNext Cloudflare adapter config
- `.dev.vars.example`: local preview secrets for Wrangler

## Auth flow notes

- `/` redirects directly into the auth handoff.
- `/auth/start` is the single focused handoff screen.
- The worker redirects to `/auth/start?return_to=...` when an OAuth `/authorize` request needs user identity.
- The portal decides between `oauth-complete` and `bootstrap` by inspecting `return_to`; there is no separate `mode` query parameter anymore.
- Direct OAuth completion posts back to the exact trusted worker origin that initiated `/authorize`, so workers.dev and custom-domain flows stay on the same authorization server.

## Key files

- `app/page.tsx`: redirect into the focused handoff route
- `app/auth/start/page.tsx`: Clerk sign-in and bootstrap exchange
- `middleware.ts`: Clerk middleware setup
- `.env.example`: required variables
