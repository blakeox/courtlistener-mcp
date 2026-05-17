import React from 'react';
import { ButtonLink, Card, InlineGroup } from '../components/ui';
import { monoClass, mutedCopyClass } from '../lib/ui-classes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { stackClass } from '../lib/workspace-classes';
import { buildHostedAuthStartHref, redirectToHostedAuth } from '../lib/hosted-auth';

export function HostedAuthRedirectPage(): React.JSX.Element {
  const authStartHref = buildHostedAuthStartHref();

  useDocumentTitle('Redirecting to sign in');

  React.useEffect(() => {
    redirectToHostedAuth();
  }, []);

  return (
    <div className={stackClass}>
      <Card
        title="Redirecting to sign in"
        subtitle="This app route has been retired in favor of the hosted auth flow."
      >
        <p className={mutedCopyClass}>
          Continue in hosted auth to start or recover your browser session, then return to your
          account workspace at <span className={monoClass}>/app/account</span>.
        </p>
        <InlineGroup>
          <ButtonLink href={authStartHref}>Continue to hosted auth</ButtonLink>
        </InlineGroup>
      </Card>
    </div>
  );
}
