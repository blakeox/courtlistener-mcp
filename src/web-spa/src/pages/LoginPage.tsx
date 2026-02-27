import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, loginByAccessToken, requestPasswordReset, toErrorMessage } from '../lib/api';
import { trackEvent } from '../lib/telemetry';
import { useAuth } from '../lib/auth';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

function readHashAccessToken(): string {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  const accessToken = (params.get('access_token') || '').trim();
  const tokenType = (params.get('token_type') || '').trim().toLowerCase();
  const flowType = (params.get('type') || '').trim().toLowerCase();
  if (flowType === 'recovery') return '';
  if (!accessToken) return '';
  if (tokenType && tokenType !== 'bearer') return '';
  return accessToken;
}

function hasRecoveryHashToken(): boolean {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  const flowType = (params.get('type') || '').trim().toLowerCase();
  const accessToken = (params.get('access_token') || '').trim();
  return flowType === 'recovery' && Boolean(accessToken);
}

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [capsLock, setCapsLock] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [statusType, setStatusType] = React.useState<'ok' | 'error' | 'info'>('info');

  React.useEffect(() => {
    if (hasRecoveryHashToken()) {
      navigate({
        pathname: '/app/reset-password',
        hash: window.location.hash,
      }, { replace: true });
      return;
    }

    const token = readHashAccessToken();
    if (!token) return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      setStatus('Finalizing email confirmation...');
      setStatusType('info');
      try {
        await loginByAccessToken(token);
        if (cancelled) return;
        window.history.replaceState({}, document.title, '/app/login');
        await refresh();
        setStatus('Email confirmed. Redirecting to onboarding...');
        setStatusType('ok');
        trackEvent('login_succeeded', { type: 'hash_token' });
        setTimeout(() => navigate('/app/onboarding'), 200);
      } catch (error) {
        if (cancelled) return;
        setStatus(toErrorMessage(error));
        setStatusType('error');
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
    setStatus('Logging in...');
    setStatusType('info');

    try {
      await login({ email: email.trim(), password });
      await refresh();
      setStatus('Logged in. Redirecting to onboarding...');
      setStatusType('ok');
      trackEvent('login_succeeded', { type: 'password' });
      setTimeout(() => navigate('/app/onboarding'), 200);
    } catch (error) {
      const message = toErrorMessage(error);
      setStatus(
        message.toLowerCase().includes('verification')
          ? `${message} Verify your email and retry login.`
          : message,
      );
      setStatusType('error');
      trackEvent('login_failed', { category: 'auth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-col">
      <Card title="Login" subtitle="Authenticate your verified account and continue onboarding.">
        <form onSubmit={onSubmit} noValidate>
          <FormField id="email" label="Email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
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

          <Button id="loginBtn" type="submit" disabled={busy}>
            {busy ? 'Logging in...' : 'Login'}
          </Button>
          <StatusBanner id="loginStatus" message={status} type={statusType} />
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
            onClick={async () => {
              const normalizedEmail = email.trim().toLowerCase();
              if (!normalizedEmail || !normalizedEmail.includes('@')) {
                setStatus('Enter a valid email first, then request reset.');
                setStatusType('error');
                return;
              }
              setBusy(true);
              setStatus('Sending password reset email...');
              setStatusType('info');
              try {
                const result = await requestPasswordReset({ email: normalizedEmail });
                setStatus(result.message || 'If the request can be processed, check your email for reset instructions.');
                setStatusType('ok');
                trackEvent('password_reset_requested');
              } catch (error) {
                setStatus(toErrorMessage(error));
                setStatusType('error');
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            Send reset email
          </Button>
        </div>
      </Card>
    </div>
  );
}
