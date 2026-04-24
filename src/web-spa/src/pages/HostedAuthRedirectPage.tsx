import React from 'react';
import { Card } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { buildHostedAuthStartHref, redirectToHostedAuth } from '../lib/hosted-auth';

export function HostedAuthRedirectPage(): React.JSX.Element {
  const authStartHref = buildHostedAuthStartHref();

  useDocumentTitle('Redirecting to sign in');

  React.useEffect(() => {
    redirectToHostedAuth();
  }, []);

  return (
    <div className="stack">
      <Card
        title="Redirecting to sign in"
        subtitle="This app route has been retired in favor of the hosted auth flow."
      >
        <p className="muted">
          Continue in hosted auth to start or recover your browser session, then return to your operator session at
          {' '}
          <span className="mono">/app/account</span>
          .
        </p>
        <div className="row">
          <a href={authStartHref} className="btn">
            Continue to hosted auth
          </a>
        </div>
      </Card>
    </div>
  );
}
