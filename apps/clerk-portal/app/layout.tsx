import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { TopbarAuthActions } from './components/topbar-auth-actions';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'CourtListener Clerk Portal',
  description: 'External auth UI for CourtListener MCP OAuth and browser session bootstrap.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        <ClerkProvider>
          <div className="page-shell">
            <div className="portal-frame">
              <a href="#main-content" className="skip-link">Skip to auth content</a>
              <header className="topbar">
                <div className="topbar-main">
                  <Link href="/" className="brand-link">
                    <span className="brand-kicker">CourtListener MCP</span>
                    <span className="brand-title">Clerk auth portal</span>
                  </Link>
                  <p className="brand-copy">
                    Secure the handoff between Clerk identity, worker sessions, and MCP OAuth completion.
                  </p>
                </div>
                <div className="surface-pill" role="status" aria-live="polite">
                  Public auth surface
                </div>
                <div className="topbar-actions">
                  <TopbarAuthActions />
                </div>
              </header>
              <main id="main-content" className="portal-layout" tabIndex={-1}>
                {children}
              </main>
            </div>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
