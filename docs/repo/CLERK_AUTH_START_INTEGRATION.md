# Clerk `/auth/start` Integration (External Auth UI)

This repo is the OAuth/resource server. Your Clerk app is the external auth UI.

Flow:
1. MCP client hits `/authorize` on this worker.
2. If identity is missing, worker redirects to `${MCP_AUTH_UI_ORIGIN}/auth/start?return_to=<authorize_url>`.
3. Clerk app signs user in, gets token, and calls `POST /api/session/bootstrap` on this worker with that Clerk/OIDC bearer token.
4. Worker sets `clmcp_ui` cookie.
5. Clerk app redirects back to `return_to`.
6. `/authorize` now completes OAuth with per-user identity.

## Worker env required

- `MCP_AUTH_UI_ORIGIN=https://<your-clerk-app-origin>`
- `OIDC_ISSUER=<issuer for Clerk JWTs>`
- `OIDC_AUDIENCE=<audience expected by your Clerk token template>` (optional if not enforced)
- `OIDC_JWKS_URL=<jwks url>` (optional)
- `MCP_UI_SESSION_SECRET=<strong random secret>`
- `MCP_ALLOW_DEV_FALLBACK=false` (recommended in production)
- Optional bootstrap throttles:
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_MAX`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_WINDOW_SECONDS`
  - `MCP_SESSION_BOOTSTRAP_RATE_LIMIT_BLOCK_SECONDS`
- `MCP_ALLOWED_ORIGINS` is optional for auth UI origin now; worker auto-allows `MCP_AUTH_UI_ORIGIN`.

## Next.js App Router example (`app/auth/start/page.tsx`)

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/nextjs';

const MCP_ORIGIN = process.env.NEXT_PUBLIC_MCP_ORIGIN || 'https://courtlistenermcp.blakeoxford.com';
const CLERK_TOKEN_TEMPLATE = process.env.NEXT_PUBLIC_CLERK_TOKEN_TEMPLATE || 'mcp';

function normalizeReturnTo(raw: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '/';
  if (value.startsWith('/')) return value;
  try {
    return new URL(value).toString();
  } catch {
    return '/';
  }
}

export default function AuthStartPage() {
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get('return_to')),
    [searchParams],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    (async () => {
      setStatus('Finalizing session...');
      setError('');
      try {
        const token = await getToken({ template: CLERK_TOKEN_TEMPLATE });
        if (!token) throw new Error('Unable to issue Clerk token.');

        const response = await fetch(`${MCP_ORIGIN}/api/session/bootstrap`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
          credentials: 'include',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || body?.message || 'Session bootstrap failed.');
        }

        if (!cancelled) {
          setStatus('Session ready. Redirecting...');
          window.location.assign(returnTo);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('');
          setError(err instanceof Error ? err.message : 'Unable to complete sign-in flow.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, returnTo]);

  return (
    <main style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Sign in to continue</h1>
      {!isLoaded ? <p>Loading...</p> : null}
      {isLoaded && !isSignedIn ? (
        <div style={{ display: 'flex', gap: 12 }}>
          <SignInButton mode="modal"><button>Sign in</button></SignInButton>
          <SignUpButton mode="modal"><button>Create account</button></SignUpButton>
        </div>
      ) : null}
      {isLoaded && isSignedIn ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <UserButton />
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      ) : null}
      {status ? <p>{status}</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
    </main>
  );
}
```

## Verification checklist

1. Open MCP OAuth flow from ChatGPT/Codex.
2. Confirm redirect to `https://<clerk-app>/auth/start?return_to=...`.
3. Sign in via Clerk.
4. Confirm `POST /api/session/bootstrap` returns `200` and sets `clmcp_ui` cookie.
5. Confirm redirect back to worker `/authorize` and OAuth completion.
6. Confirm `GET /api/usage` returns user counters after MCP calls.
