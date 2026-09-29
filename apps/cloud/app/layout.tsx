import type * as React from 'react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import './globals.css';
import { PostHogProvider } from '@/components/PostHogProvider';

export const metadata: Metadata = {
  title: 'AgentID',
  description: 'A permanent name and identity for your agent. Claim a .agent name, connect your agent, stay in control.',
};

export const viewport: Viewport = {
  themeColor: '#f1ede4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" data-theme="light" data-density="tight">
      <body>
        {/* Suspense wraps useSearchParams() inside PostHogProvider —
            required for any client hook reading nav state. */}
        <Suspense fallback={null}>
          <PostHogProvider>{children}</PostHogProvider>
        </Suspense>
      </body>
    </html>
  );
}
