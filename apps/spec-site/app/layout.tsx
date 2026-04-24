import type { Metadata } from 'next';
import type * as React from 'react';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ARP — Agent Relationship Protocol',
    template: '%s — ARP',
  },
  description:
    'The communication and permissions layer for agent-to-agent interaction. Open source, MIT-licensed.',
  metadataBase: new URL('https://spec.arp.run'),
  openGraph: {
    title: 'ARP — Agent Relationship Protocol',
    description:
      'The communication and permissions layer for agent-to-agent interaction.',
    url: 'https://spec.arp.run',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
