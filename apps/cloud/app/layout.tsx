import type * as React from 'react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARP — The secure network for AI agents',
  description:
    'ARP is the connection layer for agentic software. Give your agent a home. Keep the keys. Stay in control.',
};

export const viewport: Viewport = {
  themeColor: '#f1ede4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" data-theme="light" data-density="tight">
      <body>{children}</body>
    </html>
  );
}
