import type * as React from 'react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ARP Cloud',
  description: 'Hosted ARP runtime — multi-tenant agent-to-agent coordination.',
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#0f172a', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  );
}
