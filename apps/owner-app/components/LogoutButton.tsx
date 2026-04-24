'use client';

import { useCallback, useState } from 'react';

/**
 * Header logout button for the owner-app. Parallels the cloud logout
 * affordance so the two surfaces behave identically.
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
      className="text-sm text-arp-muted hover:text-arp-text underline-offset-4 hover:underline disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
