#!/usr/bin/env node

/**
 * Production approve-page contract probe (no browser session required).
 * Verifies authorize -> auth/start wiring and that unauthenticated approve
 * redirects to sign-in instead of returning invalid_approval_state JSON.
 */

import {
  OAUTH_PROBE_USER_AGENT,
  registerOAuthClient,
  resolveProbeConfig,
} from './e2e-remote-oauth-handshake.mjs';

const DEFAULT_BASE_URL = 'https://courtlistenermcp.blakeoxford.com';

async function main() {
  const cfg = resolveProbeConfig({
    ...process.env,
    OAUTH_BASE_URL:
      process.env.OAUTH_BASE_URL?.trim() ||
      process.env.REMOTE_SERVER_URL?.trim() ||
      DEFAULT_BASE_URL,
  });

  const baseUrl = cfg.baseUrl;
  const redirectUri = 'http://127.0.0.1:59999/callback';
  const scope = 'legal:read legal:search legal:analyze';

  const discovery = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, {
    headers: { 'user-agent': OAUTH_PROBE_USER_AGENT },
  }).then((r) => r.json());

  const registration = cfg.clientId
    ? { client_id: cfg.clientId }
    : await registerOAuthClient(discovery.registration_endpoint, {
        clientOrigin: cfg.clientOrigin,
        redirectUri,
        scope,
        clientName: 'Approve Contract Probe',
        retries: cfg.registrationRetries,
      });

  const authorizeUrl = new URL(discovery.authorization_endpoint);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', registration.client_id);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', scope);
  authorizeUrl.searchParams.set('state', 'probe-state');
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('code_challenge', 'probe-challenge-not-s256-valid');

  const authorizeRes = await fetch(authorizeUrl, { redirect: 'manual' });
  const authStart = authorizeRes.headers.get('location');
  if (!authStart?.includes('/auth/start')) {
    throw new Error(`Expected /auth/start redirect, got ${authStart}`);
  }

  const returnTo = new URL(authStart).searchParams.get('return_to');
  if (!returnTo?.includes('/oauth/authorize')) {
    throw new Error(`return_to missing authorize URL: ${returnTo}`);
  }

  const approveUrl = new URL('/oauth/approve', baseUrl);
  approveUrl.searchParams.set('return_to', returnTo);

  const approveGet = await fetch(approveUrl, { redirect: 'manual' });
  const approveGetLocation = approveGet.headers.get('location') || '';
  if (!approveGetLocation.includes('/auth/start')) {
    throw new Error(
      `Unauthenticated approve should redirect to auth/start, got ${approveGet.status} ${approveGetLocation}`,
    );
  }

  const approvePost = await fetch(`${baseUrl}/oauth/approve`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `csrf_token=invalid&return_to=${encodeURIComponent(returnTo)}`,
  });
  const postBody = await approvePost.text();
  if (approvePost.status === 400 && postBody.includes('invalid_approval_state')) {
    throw new Error(
      'Unauthenticated POST returned invalid_approval_state; expected invalid_session or csrf failure',
    );
  }

  let approvePostError = null;
  if (postBody.includes('error_code')) {
    try {
      approvePostError = JSON.parse(postBody).error_code;
    } catch {
      // postBody contains 'error_code' substring but is not valid JSON
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        authorizeRedirect: authStart,
        approveGetStatus: approveGet.status,
        approveGetRedirect: approveGetLocation,
        approvePostStatus: approvePost.status,
        approvePostError,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
