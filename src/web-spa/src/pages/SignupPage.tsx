import React from 'react';
import { Link } from 'react-router-dom';
import { signup, toErrorMessage } from '../lib/api';
import { validatePassword } from '../lib/validation';
import { markSignupStarted, trackEvent } from '../lib/telemetry';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';
import { useRateLimitBackoff } from '../hooks/useRateLimitBackoff';

export function SignupPage(): React.JSX.Element {
  useDocumentTitle('Create Account');
  const { session } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { status, statusType, setOk, setError, setInfo } = useStatus();
  const backoff = useRateLimitBackoff();
  const [submitted, setSubmitted] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const turnstileSiteKey = session?.turnstile_site_key ?? '';

  React.useEffect(() => {
    if (!turnstileSiteKey) return;
    const existing = document.getElementById('turnstile-script');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [turnstileSiteKey]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pwdError = validatePassword(password);
    setPasswordError(pwdError);
    if (pwdError) {
      setError('Please address password requirements.');
      return;
    }

    setBusy(true);
    setInfo('Creating account...');
    markSignupStarted();
    trackEvent('signup_submitted');

    try {
      const turnstileToken =
        (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
          ?.value?.trim() || '';

      const result = await signup({ email: email.trim(), password, fullName: fullName.trim(), turnstileToken });
      setOk(result.message ?? 'Check your email for verification and next steps.');
      setSubmitted(true);
      trackEvent('signup_succeeded');
    } catch (error) {
      setError(toErrorMessage(error));
      backoff.trigger(error);
      trackEvent('signup_failed', { category: 'auth' });
    } finally {
      setBusy(false);
    }
  }

  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Contains number', pass: /[0-9]/.test(password) },
  ];

  return (
    <div className="two-col">
      <Card title="Create account" subtitle="Register once, verify email, then login to create your first API key.">
        <form onSubmit={onSubmit} aria-describedby="signupStatus" noValidate>
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
          <FormField id="password" label="Password" error={passwordError ?? undefined}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError(null);
              }}
            />
          </FormField>
          <fieldset className="password-fieldset">
            <legend>Password requirements</legend>
            <ul className="password-checks" aria-live="polite">
              {checks.map((check) => (
                <li key={check.label} className={check.pass ? 'ok' : ''}>
                  <span aria-hidden="true">{check.pass ? '✓' : '○'}</span>{' '}
                  <span className="sr-only">{check.pass ? 'Met: ' : 'Not met: '}</span>
                  {check.label}
                </li>
              ))}
            </ul>
          </fieldset>
          <FormField id="fullName" label="Display name (optional)">
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </FormField>

          {turnstileSiteKey ? (
            <div className="turnstile-wrap">
              <p className="hint">Complete anti-bot verification.</p>
              <div className="cf-turnstile" data-sitekey={turnstileSiteKey}></div>
            </div>
          ) : null}

          <Button id="signupBtn" type="submit" disabled={busy || backoff.blocked}>
            {backoff.blocked ? `Rate limited (${backoff.secondsLeft}s)` : busy ? 'Creating...' : 'Create account'}
          </Button>
          <StatusBanner id="signupStatus" message={status} type={statusType} />
          </fieldset>
        </form>
      </Card>

      <Card title="What happens next" subtitle="This flow stays explicit for security and operational clarity.">
        {submitted ? (
          <div className="stack">
            <p>Check your email for verification.</p>
            <Link to="/app/login" className="btn secondary">
              I already verified, go to login
            </Link>
          </div>
        ) : (
          <ol className="ordered">
            <li>Create account</li>
            <li>Verify email with Supabase link</li>
            <li>Login and create your first key</li>
            <li>Run quick MCP smoke test</li>
          </ol>
        )}
      </Card>
    </div>
  );
}
