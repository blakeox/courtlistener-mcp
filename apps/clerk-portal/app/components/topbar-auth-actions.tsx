'use client';

import { UserButton, useAuth, useClerk } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

export function TopbarAuthActions() {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const pathname = usePathname();

  if (pathname === '/auth/start') {
    return null;
  }

  if (!isLoaded) {
    return (
      <div className="topbar-auth-placeholder" aria-hidden="true">
        <span className="topbar-auth-pill" />
        <span className="topbar-auth-pill topbar-auth-pill-accent" />
      </div>
    );
  }

  if (isSignedIn) {
    return <UserButton />;
  }

  return (
    <>
      <button className="ghost-button" onClick={() => clerk.redirectToSignIn()}>
        Sign in
      </button>
      <button className="primary-button" onClick={() => clerk.redirectToSignUp()}>
        Create account
      </button>
    </>
  );
}
