'use client';

import type * as React from 'react';
import { useCallback, useState } from 'react';

export function ConsoleLogout(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const doLogout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // The cookie clears server-side on the next round-trip either way.
    }
    window.location.assign('/cloud/login');
  }, []);
  return (
    <button
      type="button"
      onClick={() => void doLogout()}
      disabled={busy}
      data-testid="cloud-logout-btn"
      className="rounded-full border border-white/20 px-4 py-2 text-[14px] text-white/80 hover:border-white hover:text-white disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
