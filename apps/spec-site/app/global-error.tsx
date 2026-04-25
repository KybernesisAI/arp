'use client';

import type * as React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  void error;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#F5F3EE',
          color: '#14120F',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          padding: '48px 24px',
        }}
      >
        <main style={{ maxWidth: 560, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              opacity: 0.55,
              marginBottom: 16,
            }}
          >
            // STATUS · CRITICAL FAILURE
          </div>
          <h1 style={{ fontSize: 28, lineHeight: 1.15, margin: '0 0 16px' }}>
            The spec site couldn't load.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 24px' }}>
            Something went wrong before the app could render. Reload the page.
            If the problem persists, email support@arp.run.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #14120F',
              background: '#14120F',
              color: '#F5F3EE',
              padding: '10px 18px',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
