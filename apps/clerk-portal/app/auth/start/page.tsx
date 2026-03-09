'use client';

import { UserButton, useAuth, useClerk } from '@clerk/nextjs';
import { Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import { resolveAuthStartReturnTarget } from '../../../lib/auth-start';
import { CLERK_TOKEN_TEMPLATE, MCP_ORIGIN } from '../../../lib/config';
import { useAuthHandoff } from '../../../lib/use-auth-handoff';

const DEBUG_CHECKLIST = [
  {
    title: 'Issuer must match',
    detail: 'Your worker OIDC_ISSUER must trust the same Clerk instance used by this portal.',
  },
  {
    title: 'Audience must match',
    detail: 'The Clerk template audience must equal the worker OIDC_AUDIENCE.',
  },
  {
    title: 'Bootstrap must allow cookies',
    detail: 'NEXT_PUBLIC_MCP_ORIGIN must point at the worker domain that sets clmcp_ui.',
  },
];

function resolveStatusHeading(isLoaded: boolean, isSignedIn: boolean, hasReturnTo: boolean, status: string) {
  if (status) return 'Handoff in progress';
  if (!isLoaded) return 'Loading Clerk session';
  if (!isSignedIn) return 'Sign in to continue';
  return hasReturnTo ? 'Preparing your redirect' : 'Ready to finish the session';
}

function resolveStatusLine(isLoaded: boolean, isSignedIn: boolean, hasReturnTo: boolean, status: string) {
  if (status) return status;
  if (!isLoaded) return 'Loading Clerk session...';
  if (!isSignedIn) return 'Waiting for sign-in...';
  return hasReturnTo
    ? 'Completing sign-in handoff...'
    : 'Signed in. Ready to continue to the worker.';
}

function AuthStartContent() {
  const params = useSearchParams();
  const returnTarget = useMemo(() => resolveAuthStartReturnTarget(params.get('return_to')), [params]);
  const returnTo = returnTarget.value;
  const hasReturnTo = returnTarget.isExplicit;
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const clerk = useClerk();
  const { status, error, isSubmitting, completeAuthHandoff } = useAuthHandoff({
    returnTo,
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    getToken,
  });

  useEffect(() => {
    if (!hasReturnTo || !isLoaded || !isSignedIn || isSubmitting) return;
    void completeAuthHandoff();
  }, [completeAuthHandoff, hasReturnTo, isLoaded, isSignedIn, isSubmitting]);

  const statusHeading = resolveStatusHeading(Boolean(isLoaded), Boolean(isSignedIn), hasReturnTo, status);
  const statusLine = resolveStatusLine(Boolean(isLoaded), Boolean(isSignedIn), hasReturnTo, status);

  return (
    <main className="portal-page auth-page">
      <section className="portal-hero">
        <section className="hero-panel" aria-labelledby="auth-start-title">
          <div className="hero-panel-content">
            <div className="hero-eyebrow">Auth start</div>
            <h1 id="auth-start-title" className="hero-title hero-title-wide">Complete the Clerk handoff.</h1>
            <p className="hero-copy">
              Once you are signed in, this page requests the
              {' '}<span className="inline-code">{CLERK_TOKEN_TEMPLATE}</span>{' '}
              template token and then either completes OAuth directly or exchanges it for the worker browser session.
            </p>
            <div className="auth-status-meta">
              <span className={`status-badge${isSignedIn ? ' success' : ' neutral'}`}>
                {isSignedIn ? 'Clerk session active' : 'Authentication required'}
              </span>
              <span className={`status-badge${hasReturnTo ? ' warn' : ' neutral'}`}>
                {hasReturnTo ? 'Return target detected' : 'Manual continue available'}
              </span>
            </div>
            <div className="hero-actions">
              {!isLoaded ? (
                <button className="secondary-button" disabled>
                  Loading Clerk...
                </button>
              ) : !isSignedIn ? (
                <>
                  <button className="primary-button" onClick={() => clerk.redirectToSignIn()}>
                    Sign in
                  </button>
                  <button className="ghost-button" onClick={() => clerk.redirectToSignUp()}>
                    Create account
                  </button>
                </>
              ) : (
                <>
                  {!hasReturnTo ? (
                    <button className="primary-button" onClick={() => void completeAuthHandoff()} disabled={isSubmitting}>
                      {isSubmitting ? 'Continuing…' : 'Continue to worker'}
                    </button>
                  ) : null}
                  <UserButton />
                  <button className="secondary-button" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </>
              )}
              <a href={`${MCP_ORIGIN}/.well-known/oauth-authorization-server`} className="ghost-button">
                View worker metadata
              </a>
            </div>
            <p className="support-copy">
              We only use the template token to complete this handoff and return you to the CourtListener worker or MCP client.
            </p>
          </div>
        </section>

        <aside className="status-panel" aria-labelledby="auth-status-title">
          <div className="status-panel-header">
            <div>
              <p className="panel-kicker">Live status</p>
              <h2 id="auth-status-title" className="panel-title">{statusHeading}</h2>
            </div>
            <span className={`status-badge${status && !error ? ' success' : error ? ' warn' : ' neutral'}`}>
              {error ? 'Attention needed' : status ? 'Redirecting soon' : 'Waiting'}
            </span>
          </div>
          <div className="sr-only" role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
            {error || statusLine}
          </div>
          <p className={`status-line${status && !error ? ' is-success' : ''}`} aria-hidden="true">
            {statusLine}
          </p>
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          <ul className="status-list">
            <li>
              <strong>Clerk state</strong>
              <span>{isLoaded ? (isSignedIn ? 'Signed in and ready to mint a token.' : 'Loaded and waiting for a user session.') : 'Loading the Clerk session runtime.'}</span>
            </li>
            <li>
              <strong>Worker handoff mode</strong>
              <span>{hasReturnTo ? 'Direct OAuth completion from the worker authorize flow.' : 'Browser-session bootstrap back into the worker UI.'}</span>
            </li>
            <li>
              <strong>Next action</strong>
              <span>{isSignedIn ? (hasReturnTo ? 'The portal will finish the redirect automatically.' : 'Use Continue to complete the worker session.') : 'Authenticate with Clerk to continue.'}</span>
            </li>
          </ul>
          <p className="footnote">
            Long redirect targets are contained below so troubleshooting stays available without overwhelming the handoff.
          </p>
        </aside>
      </section>

      <section className="portal-grid portal-grid-two">
        <article className="portal-card">
          <h2 className="section-title">How this handoff works</h2>
          <p className="section-copy">
            The page keeps the auth decision simple even though it supports two worker completion paths.
          </p>
          <ol className="step-list">
            <li>
              <strong>Authenticate with Clerk</strong>
              <span>The portal waits for a valid Clerk session and then requests the configured template token.</span>
            </li>
            <li>
              <strong>Resolve the worker completion path</strong>
              <span>The return target determines whether the worker wants direct OAuth completion or a browser session cookie.</span>
            </li>
            <li>
              <strong>Redirect back automatically</strong>
              <span>When the worker confirms the handoff, the page sends you back to the exact destination that started the flow.</span>
            </li>
          </ol>
        </article>

        <article className="portal-card">
          <h2 className="section-title">Trusted handoff notes</h2>
          <p className="section-copy">
            Keep the Clerk portal and worker on the same trust chain so the redirect can finish cleanly.
          </p>
          <ul className="trust-list">
            <li>
              <strong>Shared Clerk instance</strong>
              <span>The portal and worker should validate against the same issuer and signing keys.</span>
            </li>
            <li>
              <strong>Audience alignment</strong>
              <span>The template token audience must stay in sync with the worker OIDC audience.</span>
            </li>
            <li>
              <strong>Cookie-capable worker origin</strong>
              <span>The configured MCP origin must be the domain that can set the worker browser session cookie.</span>
            </li>
          </ul>
        </article>
      </section>

      <details className="diagnostics-panel">
        <summary>Redirect and troubleshooting details</summary>
        <div className="diagnostics-content">
          <p className="diagnostics-copy">
            Expand this section when you need to inspect the exact redirect target or verify the worker and Clerk configuration.
          </p>
          <div className="diagnostic-block">
            <span className="diagnostic-label">Redirect target</span>
            <code className="technical-value">{returnTo}</code>
          </div>
          <ul className="info-list">
            {DEBUG_CHECKLIST.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </main>
  );
}

export default function AuthStartPage() {
  return (
    <Suspense
      fallback={(
        <main className="portal-page">
          <section className="hero-panel" aria-labelledby="auth-start-loading-title">
            <div className="hero-panel-content">
              <div className="hero-eyebrow">Auth start</div>
              <div id="auth-start-loading-title" className="hero-title">Loading auth handoff...</div>
            </div>
          </section>
        </main>
      )}
    >
      <AuthStartContent />
    </Suspense>
  );
}
