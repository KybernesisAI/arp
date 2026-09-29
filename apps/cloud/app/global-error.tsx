'use client';

import type * as React from 'react';

/**
 * Last-resort error boundary — fires when the root layout itself fails. No
 * stylesheet or shell is reachable from here (the layout never rendered), so
 * the page is self-contained: inline styles in the lander language (white
 * page, Inter stack, black pill button) and nothing else.
 */
const FONT = 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

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
      <body style={{ margin: 0, minHeight: '100vh', background: '#ffffff', color: '#09090b', fontFamily: FONT, WebkitFontSmoothing: 'antialiased' }}>
        <header style={{ background: '#000', color: '#fff', height: 64, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: '#fff' }} /> AgentID
          </span>
        </header>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '56px 24px' }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#71717a', marginBottom: 8 }}>
            Something went wrong
          </div>
          <h1 style={{ fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.025em', fontWeight: 500, margin: '0 0 16px' }}>
            AgentID could not load.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: '#52525b', margin: '0 0 28px' }}>
            Something broke before the page could show. Try again. If it keeps happening, email support@agentid.dev.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ border: 0, background: '#000', color: '#fff', borderRadius: 9999, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
