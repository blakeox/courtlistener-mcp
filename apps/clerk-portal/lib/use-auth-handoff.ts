'use client';

import { useCallback, useState } from 'react';

import { CLERK_TOKEN_TEMPLATE, MCP_ORIGIN } from './config';
import { isDirectOauthReturnTarget } from './auth-start';

type HandoffErrorResponse = {
  error?: string;
  message?: string;
  redirectTo?: string;
};

interface UseAuthHandoffOptions {
  returnTo: string;
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: (options: { template: string }) => Promise<string | null>;
}

export function useAuthHandoff({ returnTo, isLoaded, isSignedIn, getToken }: UseAuthHandoffOptions) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completeAuthHandoff = useCallback(async () => {
    if (!isLoaded || !isSignedIn || isSubmitting) return;

    setIsSubmitting(true);
    setStatus('Minting Clerk template token...');
    setError('');

    try {
      const token = await getToken({ template: CLERK_TOKEN_TEMPLATE });
      if (!token) {
        throw new Error(
          `Clerk did not return a token for template "${CLERK_TOKEN_TEMPLATE}". Check your Clerk JWT template configuration.`,
        );
      }

      const isDirectOauthFlow = isDirectOauthReturnTarget(returnTo);
      setStatus(
        isDirectOauthFlow
          ? 'Completing OAuth authorization with the worker...'
          : 'Exchanging token for MCP browser session...',
      );

      const endpoint = isDirectOauthFlow ? '/api/session/oauth-complete' : '/api/session/bootstrap';
      const headers = new Headers({
        authorization: `Bearer ${token}`,
      });
      const requestInit: RequestInit = {
        method: 'POST',
        headers,
        credentials: 'include',
      };
      if (isDirectOauthFlow) {
        headers.set('content-type', 'application/json');
        requestInit.body = JSON.stringify({ return_to: returnTo });
      }

      const response = await fetch(`${MCP_ORIGIN}${endpoint}`, requestInit);

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as HandoffErrorResponse;
        const reason = body.error || body.message || 'Session bootstrap failed.';
        throw new Error(reason);
      }

      if (isDirectOauthFlow) {
        const body = (await response.json().catch(() => ({}))) as HandoffErrorResponse;
        if (!body.redirectTo) {
          throw new Error('OAuth completion response did not include a redirect target.');
        }

        setStatus('Authorization approved. Redirecting back to the MCP client...');
        window.location.assign(body.redirectTo);
        return;
      }

      setStatus('Session established. Redirecting back to the worker...');
      window.location.assign(returnTo);
    } catch (cause) {
      setIsSubmitting(false);
      setStatus('');
      setError(cause instanceof Error ? cause.message : 'Unable to complete the sign-in handoff.');
    }
  }, [getToken, isLoaded, isSignedIn, isSubmitting, returnTo]);

  return {
    status,
    error,
    isSubmitting,
    completeAuthHandoff,
  };
}
