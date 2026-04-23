'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Minimal QR scanner shell — in a proper deploy we mount html5-qrcode here,
 * but its runtime is browser-only and adds ~80 kB to the bundle. For v0 we
 * render a manual-paste fallback too, so the phase-4 acceptance can drive
 * this page without touching the camera APIs.
 */
export function QrScanner() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const go = () => {
    if (!value) return;
    try {
      const url = new URL(value);
      router.push(`/pair/accept?invitation=${url.searchParams.get('invitation') ?? ''}`);
    } catch {
      // Assume a bare base64url payload.
      router.push(`/pair/accept?invitation=${encodeURIComponent(value)}`);
    }
  };

  return (
    <div className="card max-w-xl space-y-3 text-sm">
      <div className="rounded border border-dashed border-arp-border p-6 text-center text-arp-muted">
        Camera preview (html5-qrcode) mounts here in the full build.
      </div>
      <label className="block">
        <span className="label">Manual paste</span>
        <textarea
          className="input h-24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste invitation URL or raw base64url payload"
          data-testid="scan-input"
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        onClick={go}
        disabled={value.trim().length === 0}
        data-testid="scan-go-btn"
      >
        Open invitation
      </button>
    </div>
  );
}
