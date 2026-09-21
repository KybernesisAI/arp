'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';

export function ShortLinkClient(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = window.location.hash.replace(/^#/, '');
    if (!token) { setError('Open this page from the full invitation link you were given.'); return; }
    void (async () => {
      try {
        const res = await fetch('/api/pairing/invitations/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
        const body = (await res.json()) as { payload?: string; message?: string };
        if (!res.ok || !body.payload) { setError(body.message ?? 'This invitation link is no longer open.'); return; }
        window.location.replace(`/pair/accept#${body.payload}`);
      } catch {
        setError('The invitation could not be loaded. Please try again.');
      }
    })();
  }, []);
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-[15px] text-zinc-700">
      {error ?? 'Opening your invitation…'}
    </div>
  );
}
