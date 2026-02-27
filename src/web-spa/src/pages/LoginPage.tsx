import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, loginByAccessToken, requestPasswordReset, toErrorMessage } from '../lib/api';
import { trackEvent } from '../lib/telemetry';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { isRecoveryHash, readLoginHashToken } from '../lib/hash-utils';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';
import { useRateLimitBackoff } from '../hooks/useRateLimitBackoff';

export function LoginPage(): React.JSX.Element {
  useDocumentTitle('Login');
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { status, statusType, setOk, setError, setInfo } = useStatus();
  const backoff = useRateLimitBackoff();

  React.useEffect(() => {
    if (isRecoveryHash()) {
      navigate({
        pathname: '/app/reset-password',
        search: window.location.search,
        hash: window.location.hash,
      }, { replace: true });
      return;
    }

    const token = readLoginHashToken();
    if (!token) return;

    // Clear hash immediately to prevent token leaking in browser history
    window.history.replaceState({}, document.title, '/app/login');

    let cancelled = false;
    (async () => {
      setBusy(true);
      setInfo('Finalizing email confirmation...');
      try {
        await loginByAccessToken(token);
        if (cancelled) return;
        await refresh();
        setOk('Email confirmed. Redirecting...');
        trackEvent('login_succeeded', { type: 'hash_token' });
        setTimeout(() => navigate('/app/keys'), 200);
      } catch (error) {
        if (cancelled) return;
        setError(toErrorMessage(error));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setInfo('Logging in...');

    try {
      await login({ email: email.trim(), password });
      await refresh();
      setOk('Logged in. Redirecting...');
      trackEvent('login_succeeded', { type: 'password' });
      setTimeout(() => navigate('/app/keys'), 200);
    } catch (error) {
      const apiErr = error as { error_code?: string; message?: string; status?: number };
      if (apiErr.error_code === 'email_not_verified') {
        setError('Email verification is required. Check your inbox or request a password reset to verify.');
      } else if (apiErr.message) {
        setError(apiErr.message);
      } else {
        setError('Login failed. Check your credentials and try again.');
      }
      backoff.trigger(error);
      trackEvent('login_failed', { category: 'auth' });
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest(): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter a valid email first, then request reset.');
      return;
    }
    setBusy(true);
    setInfo('Sending password reset email...');
    try {
      const result = await requestPasswordReset({ email: normalizedEmail });
      setOk(result.message || 'If the request can be processed, check your email for reset instructions.');
      trackEvent('password_reset_requested');
    } catch (error) {
      setError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-col">
      <Card title="Login" subtitle="Authenticate your verified account and continue onboarding.">
        <form onSubmit={onSubmit} noValidate>
          <fieldset disabled={busy || backoff.blocked} className="fieldset-plain">
          <FormField id="email" label="Email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField id="password" label="Password" hint={capsLock ? 'Caps lock is on.' : undefined}>
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>

          <label className="inline-check">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            Show password
          </label>
          <div className="row">
            <Link to="/app/reset-password" className="text-link">
              Forgot password?
            </Link>
          </div>

          <Button id="loginBtn" type="submit" disabled={busy || backoff.blocked}>
            {backoff.blocked ? `Rate limited (${backoff.secondsLeft}s)` : busy ? 'Logging in...' : 'Login'}
          </Button>
          <StatusBanner id="loginStatus" message={status} type={statusType} />
          </fieldset>
        </form>
      </Card>

      <Card title="Need help?" subtitle="If login fails after verification, wait a minute and retry.">
        <ul className="ordered">
          <li>Use the same email used at signup</li>
          <li>Confirm your inbox verification completed</li>
          <li>If needed, request a password reset email</li>
        </ul>
        <div className="stack">
          <Button
            variant="secondary"
            onClick={handleResetRequest}
            disabled={busy}
          >
            Send reset email
          </Button>
        </div>
      </Card>
    </div>
  );
}
