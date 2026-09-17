'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError } from '@/components/ui';
import { getOrCreatePrincipalKey } from '@/lib/principal-key-browser';
import { signRepresentationJwtBrowser } from '@/lib/representation-jwt-browser';

/**
 * "Verify ownership" (AgentID S2 / T6): signs the owner proof in the browser
 * with the account's principal key and posts it to /api/registrar/bind-owner.
 * The private key never leaves the browser.
 */
export function FinishSetupButton({
  domain,
  tenantId,
  ownerLabel = 'owner',
}: {
  domain: string;
  tenantId: string;
  ownerLabel?: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<'idle' | 'signing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setStage('signing');
    setError(null);
    try {
      const principal = await getOrCreatePrincipalKey();
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
          owner_label: ownerLabel,
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
      <Button type="button" variant="primary" size="sm" onClick={() => void run()} disabled={stage === 'signing' || stage === 'done'}>
        {stage === 'signing' ? 'Verifying…' : stage === 'done' ? 'Verified' : 'Verify ownership'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
