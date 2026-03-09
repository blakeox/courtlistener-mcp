# Clerk `/auth/start` Integration (External Auth UI)

This repo is the OAuth/resource server. Your Clerk app is the external auth UI.

Flow:
1. MCP client hits `/authorize` on this worker.
2. If identity is missing, worker redirects to `${MCP_AUTH_UI_ORIGIN}/auth/start?return_to=<authorize_url>`.
3. Clerk app signs user in and mints the `mcp` template token.
4. If `return_to` targets this worker's `/authorize`, the portal calls `POST /api/session/oauth-complete` with the Clerk/OIDC bearer token and the original `return_to`.
5. The worker validates the token, completes OAuth directly, and returns the hosted client redirect target.
6. For non-OAuth browser bootstrap flows, the portal instead calls `POST /api/session/bootstrap`, the worker sets `clmcp_ui`, and the portal redirects back to `return_to`.

## Worker env required

- `MCP_AUTH_UI_ORIGIN=https://<your-clerk-app-origin>`
  - Set this to the auth app origin/root only, not to an MCP endpoint like `/mcp`
- `OIDC_ISSUER=<issuer for Clerk JWTs>`
- `OIDC_AUDIENCE=<audience expected by your Clerk token template>` (optional if not enforced)
- `OIDC_JWKS_URL=<jwks url>` (optional)
  - If bootstrap fails with `no applicable key found in the JSON Web Key Set`, verify this matches the Clerk instance issuing the token and check whether the token `kid` has rotated
- `MCP_UI_SESSION_SECRET=<strong random secret>`
- `MCP_ALLOW_DEV_FALLBACK=false` (recommended in production)
- Optional bootstrap throttles:
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`
- `MCP_ALLOWED_ORIGINS` is optional for auth UI origin now; worker auto-allows `MCP_AUTH_UI_ORIGIN`.

## Current route behavior

- `/` is a light landing page for the external auth UI.
- `/auth/start` is the only handoff route.
- Manual visits to `/auth/start` do not auto-redirect unless an explicit `return_to` is present.
- The topbar hides its auth controls on `/auth/start` so there is only one visible auth action cluster.

## Current Next.js App Router example (`app/auth/start/page.tsx`)

```tsx
'use client';

import { UserButton, useAuth, useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const MCP_ORIGIN = process.env.NEXT_PUBLIC_MCP_ORIGIN || 'https://courtlistenermcp.blakeoxford.com';
const CLERK_TOKEN_TEMPLATE = process.env.NEXT_PUBLIC_CLERK_TOKEN_TEMPLATE || 'mcp';

function normalizeReturnTo(raw: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '/';
  try {
    return new URL(value).toString();
  } catch {
    return '/';
  }
}

function hasExplicitReturnTo(raw: string | null): boolean {
  return (raw || '').trim().length > 0;
}

function AuthStartContent() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const clerk = useClerk();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get('return_to')),
    [searchParams],
  );
  const hasReturnTo = useMemo(
    () => hasExplicitReturnTo(searchParams.get('return_to')),
    [searchParams],
  );

  useEffect(() => {
    if (!hasReturnTo || !isLoaded || !isSignedIn || isSubmitting) return;

    let cancelled = false;
    (async () => {
      setIsSubmitting(true);
      setStatus('Minting Clerk template token...');
      setError('');

      try {
        const token = await getToken({ template: CLERK_TOKEN_TEMPLATE });
        if (!token) throw new Error('Unable to issue Clerk token.');

        const response = await fetch(`${MCP_ORIGIN}/api/session/oauth-complete`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ return_to: returnTo }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || body?.message || 'OAuth completion failed.');
        }

        const body = await response.json().catch(() => ({}));
        if (!body?.redirectTo) {
          throw new Error('OAuth completion response did not include a redirect target.');
        }

        if (!cancelled) {
          setStatus('Authorization approved. Redirecting back to the MCP client...');
          window.location.assign(body.redirectTo);
        }
      } catch (err) {
        if (!cancelled) {
          setIsSubmitting(false);
          setStatus('');
          setError(err instanceof Error ? err.message : 'Unable to complete sign-in flow.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, hasReturnTo, isLoaded, isSignedIn, isSubmitting, returnTo]);

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Complete the Clerk handoff</h1>
      {!isLoaded ? <p>Loading Clerk...</p> : null}
      {isLoaded && !isSignedIn ? (
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => clerk.redirectToSignIn()}>Sign in</button>
          <button onClick={() => clerk.redirectToSignUp()}>Create account</button>
        </div>
      ) : null}
      {isLoaded && isSignedIn ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!hasReturnTo ? <button disabled={isSubmitting}>Continue to worker</button> : null}
          <UserButton />
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      ) : null}
      <p>Redirect target: {returnTo}</p>
      {status ? <p>{status}</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <p><Link href="/">Back home</Link></p>
    </main>
  );
}

export default function AuthStartPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 640, margin: '40px auto' }}>Loading auth handoff...</main>}>
      <AuthStartContent />
    </Suspense>
  );
}
```

## Verification checklist

1. Open MCP OAuth flow from ChatGPT/Codex.
2. Confirm redirect to `https://<clerk-app>/auth/start?return_to=...`.
3. Sign in via Clerk.
4. Confirm direct OAuth handoff uses `POST /api/session/oauth-complete` and returns a `redirectTo` URL.
5. For browser bootstrap flows, confirm `POST /api/session/bootstrap` returns `200` and sets `clmcp_ui`.
6. Confirm `GET /api/usage` returns user counters after MCP calls.
