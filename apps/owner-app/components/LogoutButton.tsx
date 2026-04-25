'use client';

import { useCallback, useState } from 'react';

/**
 * Header logout button for the owner-app. Visual treatment matches the
 * cloud `LogoutButton`: tracked-uppercase mono, nav-line hover underline.
 */
export function LogoutButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const doLogout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Cookie clears server-side on next request regardless.
    }
    window.location.assign('/login');
  }, []);

  return (
    <button
      type="button"
      onClick={() => void doLogout()}
      disabled={busy}
      data-testid="owner-logout-btn"
      className="border-b border-transparent py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-fast hover:border-ink disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
