'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Badge, Button, FieldError } from '@/components/ui';
import { isPasskeySupported, registerPasskey } from '@/lib/principal-key-passkey';

/**
 * Phase-9d migrate-to-passkey banner.
 *
 * Rendered on the dashboard for tenants that have NO registered passkey.
 * Does NOT rotate the principal DID — the passkey only replaces the
 * authenticator surface (no more "paste your private key / recovery phrase
 * to sign in"). The tenant's did:key identity stays the same.
 */
export function MigrateToPasskeyBanner(): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  const [stage, setStage] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [supportChecked, setSupportChecked] = useState(false);
  const [supported, setSupported] = useState(true);

  // Lazy-check support on mount. If not supported, hide the banner.
  if (!supportChecked && typeof window !== 'undefined') {
    void isPasskeySupported()
      .then((ok) => {
        setSupported(ok);
        setSupportChecked(true);
      })
      .catch(() => setSupportChecked(true));
  }

  if (dismissed || !supported || stage === 'success') return null;

  async function handleAdd(): Promise<void> {
    setError(null);
    setStage('pending');
    try {
      await registerPasskey();
      setStage('success');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  return (
    <div
      data-testid="migrate-to-passkey-banner"
      className="border border-rule bg-paper-2 p-5 mb-8 flex flex-col md:flex-row md:items-center gap-4"
    >
      <div className="flex-1">
        <Badge tone="yellow" className="mb-2">
          ADD PASSKEY · RECOMMENDED
        </Badge>
        <p className="font-display font-medium text-h5 mt-0 mb-1">
          Replace recovery-phrase sign-in with a passkey.
        </p>
        <p className="text-body-sm text-ink-2">
          Uses your device's Touch ID / Face ID / Windows Hello. Your principal identity stays
          the same — the passkey is just a faster, safer way to sign in next time.
        </p>
        {error && <FieldError className="mt-3">Error: {error}</FieldError>}
      </div>
      <div className="flex gap-3">
        <Button
          variant="primary"
          arrow
          onClick={() => void handleAdd()}
          disabled={stage === 'pending'}
          data-testid="add-passkey-btn"
        >
          {stage === 'pending' ? 'Adding passkey…' : 'Add passkey'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDismissed(true)}
          data-testid="dismiss-passkey-banner-btn"
        >
          Later
        </Button>
      </div>
    </div>
  );
}
