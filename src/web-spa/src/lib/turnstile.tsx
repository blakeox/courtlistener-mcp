import React from 'react';

type TurnstileWidgetId = string;

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => TurnstileWidgetId;
  reset?: (widgetId?: TurnstileWidgetId) => void;
  remove?: (widgetId?: TurnstileWidgetId) => void;
}

declare global {
  interface Window {
    __clmcpTurnstileToken?: string;
    turnstile?: TurnstileApi;
  }
}

type TurnstileStatus = 'disabled' | 'loading' | 'ready' | 'verified' | 'expired' | 'error';

interface UseTurnstileTokenResult {
  enabled: boolean;
  status: TurnstileStatus;
  token: string;
  error: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  refresh: () => void;
}

let turnstileScriptPromise: Promise<void> | null = null;

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile is only available in the browser.'));
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-clmcp-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Turnstile.')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.clmcpTurnstile = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile.'));
    document.head.appendChild(script);
  }).catch((error) => {
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

function clearGlobalTurnstileToken(currentToken: string): void {
  if (typeof window === 'undefined') return;
  if (window.__clmcpTurnstileToken === currentToken) {
    window.__clmcpTurnstileToken = '';
  }
}

export function describeTurnstileStatus(status: TurnstileStatus, error: string): string {
  switch (status) {
    case 'disabled':
      return 'Not enforced for this worker';
    case 'loading':
      return 'Loading Cloudflare challenge';
    case 'ready':
      return 'Challenge ready';
    case 'verified':
      return 'Challenge verified';
    case 'expired':
      return 'Challenge expired';
    case 'error':
      return error || 'Challenge unavailable';
    default:
      return 'Challenge state unavailable';
  }
}

export function useTurnstileToken(
  siteKey?: string,
  options?: { action?: string },
): UseTurnstileTokenResult {
  const normalizedSiteKey = siteKey?.trim() ?? '';
  const enabled = Boolean(normalizedSiteKey);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<TurnstileWidgetId | null>(null);
  const tokenRef = React.useRef('');
  const [token, setToken] = React.useState(() =>
    typeof window !== 'undefined' ? (window.__clmcpTurnstileToken?.trim() ?? '') : '',
  );
  const [status, setStatus] = React.useState<TurnstileStatus>(enabled ? 'loading' : 'disabled');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  React.useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      setError('');
      return;
    }

    let cancelled = false;
    setStatus(tokenRef.current ? 'verified' : 'loading');
    setError('');

    async function mountWidget(): Promise<void> {
      try {
        await ensureTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current && window.turnstile.remove) {
          window.turnstile.remove(widgetIdRef.current);
        }
        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: normalizedSiteKey,
          action: options?.action,
          callback: (nextToken) => {
            if (cancelled) return;
            window.__clmcpTurnstileToken = nextToken;
            setToken(nextToken);
            setStatus('verified');
            setError('');
          },
          'expired-callback': () => {
            if (cancelled) return;
            clearGlobalTurnstileToken(tokenRef.current);
            setToken('');
            setStatus('expired');
          },
          'error-callback': () => {
            if (cancelled) return;
            clearGlobalTurnstileToken(tokenRef.current);
            setToken('');
            setStatus('error');
            setError('Cloudflare challenge failed. Refresh and retry.');
          },
        });
        if (!tokenRef.current) {
          setStatus('ready');
        }
      } catch (mountError) {
        if (cancelled) return;
        clearGlobalTurnstileToken(tokenRef.current);
        setToken('');
        setStatus('error');
        setError(
          mountError instanceof Error
            ? mountError.message
            : 'Cloudflare challenge failed to initialize.',
        );
      }
    }

    void mountWidget();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [enabled, normalizedSiteKey, options?.action]);

  function refresh(): void {
    if (!widgetIdRef.current || !window.turnstile?.reset) return;
    clearGlobalTurnstileToken(tokenRef.current);
    setToken('');
    setStatus('ready');
    setError('');
    window.turnstile.reset(widgetIdRef.current);
  }

  return {
    enabled,
    status,
    token,
    error,
    containerRef,
    refresh,
  };
}
