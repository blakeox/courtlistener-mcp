import React from 'react';
import { Link } from 'react-router-dom';
import { signup, toErrorMessage } from '../lib/api';
import { markSignupStarted, trackEvent } from '../lib/telemetry';
import { useAuth } from '../lib/auth';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password should include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password should include a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password should include a number.';
  return null;
}

export function SignupPage(): React.JSX.Element {
  const { session } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [statusType, setStatusType] = React.useState<'ok' | 'error' | 'info'>('info');
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
      setStatus('Please address password requirements.');
      setStatusType('error');
      return;
    }

    setBusy(true);
    setStatus('Creating account...');
    setStatusType('info');
    markSignupStarted();
    trackEvent('signup_submitted');

    try {
      const turnstileToken =
        (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)
          ?.value?.trim() || '';

      const result = await signup({ email: email.trim(), password, fullName: fullName.trim(), turnstileToken });
      setStatus(result.message ?? 'Check your email for verification and next steps.');
      setStatusType('ok');
      setSubmitted(true);
      trackEvent('signup_succeeded');
    } catch (error) {
      setStatus(toErrorMessage(error));
      setStatusType('error');
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
          <ul className="password-checks">
            {checks.map((check) => (
              <li key={check.label} className={check.pass ? 'ok' : ''}>
                {check.pass ? '✓' : '○'} {check.label}
              </li>
            ))}
          </ul>
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

          <Button id="signupBtn" type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create account'}
          </Button>
          <StatusBanner id="signupStatus" message={status} type={statusType} />
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
