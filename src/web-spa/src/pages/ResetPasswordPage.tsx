import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword, requestPasswordReset, toErrorMessage } from '../lib/api';
import { trackEvent } from '../lib/telemetry';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

function getRecoveryAccessTokenFromHash(): string {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  const flowType = (params.get('type') || '').trim().toLowerCase();
  const tokenType = (params.get('token_type') || '').trim().toLowerCase();
  const accessToken = (params.get('access_token') || '').trim();
  if (flowType !== 'recovery') return '';
  if (!accessToken) return '';
  if (tokenType && tokenType !== 'bearer') return '';
  return accessToken;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password should include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password should include a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password should include a number.';
  return null;
}

export function ResetPasswordPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [statusType, setStatusType] = React.useState<'ok' | 'error' | 'info'>('info');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const recoveryAccessToken = React.useMemo(() => getRecoveryAccessTokenFromHash(), []);
  const canReset = Boolean(recoveryAccessToken);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pwdError = validatePassword(password);
    if (pwdError) {
      setPasswordError(pwdError);
      setStatus('Please address password requirements.');
      setStatusType('error');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      setStatus('Passwords do not match.');
      setStatusType('error');
      return;
    }
    if (!recoveryAccessToken) {
      setStatus('Password reset link is missing or invalid. Request a new one.');
      setStatusType('error');
      return;
    }

    setBusy(true);
    setStatus('Resetting password...');
    setStatusType('info');

    try {
      const result = await resetPassword({
        accessToken: recoveryAccessToken,
        password,
      });
      window.history.replaceState({}, document.title, '/app/reset-password');
      setStatus(result.message ?? 'Password updated successfully. Redirecting to login...');
      setStatusType('ok');
      trackEvent('password_reset_succeeded');
      setTimeout(() => navigate('/app/login', { replace: true }), 400);
    } catch (error) {
      setStatus(toErrorMessage(error));
      setStatusType('error');
      trackEvent('password_reset_failed', { category: 'auth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-col">
      <Card title="Reset password" subtitle="Set a new password using your recovery email link.">
        {canReset ? (
          <form onSubmit={onSubmit} noValidate>
            <FormField id="password" label="New password" error={passwordError ?? undefined}>
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
            <FormField id="confirmPassword" label="Confirm password">
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError(null);
                }}
              />
            </FormField>
            <Button type="submit" disabled={busy}>
              {busy ? 'Resetting...' : 'Reset password'}
            </Button>
            <StatusBanner id="resetPasswordStatus" message={status} type={statusType} />
          </form>
        ) : (
          <div className="stack">
            <p className="muted">
              This reset link is missing or expired. Enter your email below to request a new one.
            </p>
            <FormField id="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <div className="row">
              <Button
                type="button"
                onClick={async () => {
                  const normalizedEmail = email.trim().toLowerCase();
                  if (!normalizedEmail || !normalizedEmail.includes('@')) {
                    setStatus('A valid email is required.');
                    setStatusType('error');
                    return;
                  }
                  setBusy(true);
                  setStatus('Sending password reset email...');
                  setStatusType('info');
                  try {
                    const result = await requestPasswordReset({ email: normalizedEmail });
                    setStatus(
                      result.message ||
                        'If the request can be processed, check your email for reset instructions.',
                    );
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
              <Link to="/app/login" className="btn secondary">
                Back to login
              </Link>
            </div>
            <StatusBanner id="forgotPasswordStatus" message={status} type={statusType} />
          </div>
        )}
      </Card>

      <Card title="Security notes" subtitle="Recovery links are short-lived and single-use.">
        <ol className="ordered">
          <li>Use a unique password you do not reuse elsewhere</li>
          <li>Include uppercase, lowercase, and a number</li>
          <li>After reset, login from the normal login page</li>
        </ol>
      </Card>
    </div>
  );
}
