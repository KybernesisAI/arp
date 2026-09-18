'use client';

import type * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, FieldError } from '@/components/ui';

/**
 * "Host the key here" (AgentID S4): re-provisions a name into hosted custody so
 * a runtime can be attached. Rotates the key; existing connections must be
 * paired again, so it asks first.
 */
export function ReprovisionHostedButton({ sld, hadKey }: { sld: string; hadKey: boolean }): React.JSX.Element {
  const router = useRouter();
  const [stage, setStage] = useState<'idle' | 'confirm' | 'working' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setStage('working');
    setError(null);
    try {
      const res = await fetch(`/api/names/${encodeURIComponent(sld)}/reprovision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'The name could not be re-provisioned.');
        setStage('error');
        return;
      }
      router.refresh();
      setStage('idle');
    } catch {
      setError('The name could not be re-provisioned.');
      setStage('error');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {stage === 'confirm' ? (
        <div className="flex flex-col items-end gap-2">
          <p className="text-body-sm text-ink-2 m-0 max-w-[40ch] text-right">
            {hadKey
              ? 'This issues a new key for the name and keeps it here for hosted delivery. Existing connections will need to be paired again.'
              : 'This issues a key for the name and keeps it here so you can attach a runtime.'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => setStage('idle')}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => void run()}>
              {hadKey ? 'Yes, issue a new key' : 'Yes, set it up'}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="primary" size="sm" onClick={() => setStage('confirm')} disabled={stage === 'working'}>
          {stage === 'working' ? 'Setting up…' : hadKey ? 'Host the key here' : 'Set up identity'}
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
