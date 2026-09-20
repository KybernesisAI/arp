'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A name this account owns (owner proof exists) but has no identity yet:
 * one click mints the hosted identity for it. Same endpoint the name's page
 * uses ("Set up identity"); ownership is the binding or the registration.
 */
export function CreateIdentityButton({ sld }: { sld: string }): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/names/${encodeURIComponent(sld)}/reprovision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) { setError(body.message ?? 'The identity could not be created.'); return; }
      router.refresh();
    } catch {
      setError('The identity could not be created.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={() => void run()} disabled={busy} className="rounded-full bg-black px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
        {busy ? 'Creating…' : 'Create identity'}
      </button>
      {error && <span className="text-[12px] text-amber-800">{error}</span>}
    </span>
  );
}
