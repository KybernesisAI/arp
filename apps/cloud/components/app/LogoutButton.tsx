'use client';

import { useCallback, useState } from 'react';

/**
 * Thin client component for the top-nav logout affordance.
 *
 * Posts /api/auth/logout + redirects to the cloud login page. The button
 * uses the Nav's mono-type ghost treatment so it blends in with the other
 * nav items — users notice it when they need it, and it doesn't compete
 * for attention with the dashboard CTAs.
 */
export function LogoutButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const doLogout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if the request fails we still want to redirect — the cookie
      // will clear on server-side on the next round-trip anyway.
    }
    window.location.assign('/cloud/login');
  }, []);

  return (
    <button
      type="button"
      onClick={() => void doLogout()}
      disabled={busy}
      data-testid="cloud-logout-btn"
      className="py-1.5 border-b border-transparent hover:border-ink transition-colors duration-fast font-mono text-[11px] tracking-[0.1em] uppercase disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
