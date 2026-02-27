import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listKeys, toErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, StatusBanner } from '../components/ui';

export function OnboardingPage(): React.JSX.Element {
  const { session } = useAuth();
  const keyQuery = useQuery({
    queryKey: ['keys', 'onboarding'],
    queryFn: () => listKeys(),
    enabled: Boolean(session?.authenticated),
  });

  const hasKeys = (keyQuery.data?.keys.length ?? 0) > 0;

  return (
    <div className="stack">
      <Card
        title="Onboarding"
        subtitle="Complete the flow to reach your first successful MCP tool call quickly and safely."
      >
        {!session?.authenticated ? (
          <div className="stack">
            <p>You are not logged in yet.</p>
            <Link to="/app/login" className="btn">
              Login now
            </Link>
          </div>
        ) : hasKeys ? (
          <div className="stack">
            <p>Your account already has at least one API key.</p>
            <div className="row">
              <Link to="/app/console" className="btn">
                Run MCP smoke test
              </Link>
              <Link to="/app/keys" className="btn secondary">
                Manage keys
              </Link>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p>Next required step: create your first API key.</p>
            <Link to="/app/keys" className="btn">
              Create first API key
            </Link>
          </div>
        )}
      </Card>

      {keyQuery.isError ? (
        <StatusBanner role="alert" message={toErrorMessage(keyQuery.error)} type="error" />
      ) : null}

      <Card title="Setup checklist">
        <ol className="ordered">
          <li>Create account</li>
          <li>Verify email</li>
          <li>Login</li>
          <li>Create API key</li>
          <li>Initialize MCP session and run tool call</li>
        </ol>
      </Card>
    </div>
  );
}
