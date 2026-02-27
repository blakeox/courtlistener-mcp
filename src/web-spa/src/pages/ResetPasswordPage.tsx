import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword, requestPasswordReset, toErrorMessage } from '../lib/api';
import { trackEvent } from '../lib/telemetry';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStatus } from '../hooks/useStatus';
import { getRecoveryToken, getRecoveryTokenHash } from '../lib/hash-utils';
import { validatePassword } from '../lib/validation';
import { useAuth } from '../lib/auth';
import { Button, Card, FormField, Input, StatusBanner } from '../components/ui';

export function ResetPasswordPage(): React.JSX.Element {
  useDocumentTitle('Reset Password');
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { status, statusType, setOk, setError, setInfo } = useStatus();
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const recoveryAccessToken = getRecoveryToken();
  const recoveryTokenHash = getRecoveryTokenHash();
  const canReset = Boolean(recoveryAccessToken || recoveryTokenHash);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const pwdError = validatePassword(password);
    if (pwdError) {
      setPasswordError(pwdError);
      setError('Please address password requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      setError('Passwords do not match.');
      return;
    }
    if (!recoveryAccessToken && !recoveryTokenHash) {
      setError('Password reset link is missing or invalid. Request a new one.');
      return;
    }

    setBusy(true);
    setInfo('Resetting password...');

    try {
      const result = await resetPassword({
        accessToken: recoveryAccessToken || undefined,
        tokenHash: recoveryTokenHash || undefined,
        password,
      });
      window.history.replaceState({}, document.title, '/app/reset-password');

      if (result.autoLogin) {
        await refresh();
        setOk('Password updated. Redirecting...');
        trackEvent('password_reset_succeeded', { autoLogin: true });
        setTimeout(() => navigate('/app/keys', { replace: true }), 400);
      } else {
        setOk(result.message ?? 'Password updated successfully. Redirecting to login...');
        trackEvent('password_reset_succeeded');
        setTimeout(() => navigate('/app/login', { replace: true }), 400);
      }
    } catch (error) {
      setError(toErrorMessage(error));
      trackEvent('password_reset_failed', { category: 'auth' });
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest(): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('A valid email is required.');
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
      <Card title="Reset password" subtitle="Set a new password using your recovery email link.">
        {canReset ? (
          <form onSubmit={onSubmit} noValidate>
            <FormField id="password" label="New password" error={passwordError ?? undefined}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
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
                onClick={handleResetRequest}
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
