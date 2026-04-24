'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#0A0A0A',
          color: '#E5E5E5',
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
          <h1 style={{ fontSize: 24, lineHeight: 1.2, margin: '0 0 16px' }}>
            The owner app couldn't load.
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 24px' }}>
            Something went wrong before the app could render. Reload the page.
            If it keeps failing, email support@arp.run.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #E5E5E5',
              background: '#E5E5E5',
              color: '#0A0A0A',
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
