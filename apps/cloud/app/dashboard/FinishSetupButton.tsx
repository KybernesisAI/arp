'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError, Input } from '@/components/ui';
import { requirePrincipalKey } from '@/lib/principal-key-browser';
import { UnlockKey, useDeviceKey } from '@/components/app/UnlockKey';
import { signRepresentationJwtBrowser } from '@/lib/representation-jwt-browser';

/**
 * "Verify ownership" (AgentID S2 / T6): signs the owner proof in the browser
 * with the account's principal key and posts it to /api/registrar/bind-owner.
 * The private key never leaves the browser.
 */
export function FinishSetupButton({
  domain,
  tenantId,
  principalDid,
  ownerLabel = 'owner',
}: {
  domain: string;
  tenantId: string;
  principalDid: string;
  ownerLabel?: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<'idle' | 'label' | 'signing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState(ownerLabel);
  const [hasKey, setHasKey] = useDeviceKey(principalDid);
  const labelOk = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);

  async function run(): Promise<void> {
    setStage('signing');
    setError(null);
    try {
      const principal = await requirePrincipalKey(principalDid);
      const issuerDid = `did:web:cloud.arp.run:u:${tenantId}`;
      const jwt = await signRepresentationJwtBrowser({
        principal,
        issuerDid,
        agentDid: `did:web:${domain}`,
      });
      const res = await fetch('/api/registrar/bind-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain,
          owner_label: label,
          public_key_multibase: principal.publicKeyMultibase,
          signed_representation_jwt: jwt,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        setError(body.message ?? 'Ownership could not be verified.');
        setStage('error');
        return;
      }
      setStage('done');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ownership could not be verified.');
      setStage('error');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {hasKey === false && <UnlockKey className="w-full max-w-[560px] text-left" sessionPrincipalDid={principalDid} action="verify that you own this name" onUnlocked={() => setHasKey(true)} />}
      {stage === 'label' ? (
        <div className="flex flex-col items-end gap-2">
          <p className="text-body-sm text-ink-2 m-0 max-w-[40ch] text-right">
            Your browser signs a proof of ownership with this account's key and publishes it with the name. Pick how you are shown as the owner.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value.trim().toLowerCase())}
              placeholder="owner"
              aria-label="Shown as"
              autoComplete="off"
              spellCheck={false}
              className="w-40 font-mono text-[12px]"
            />
            <Button type="button" variant="default" size="sm" onClick={() => setStage('idle')}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={!labelOk} onClick={() => void run()}>
              Verify
            </Button>
          </div>
          {!labelOk && <FieldError>Lowercase letters, numbers and hyphens.</FieldError>}
        </div>
      ) : (
        <Button type="button" variant="primary" size="sm" onClick={() => setStage('label')} disabled={stage === 'signing' || stage === 'done'}>
          {stage === 'signing' ? 'Verifying…' : stage === 'done' ? 'Verified' : 'Verify ownership'}
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
