'use client';

import type * as React from 'react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Code,
  FieldError,
  Pre,
} from '@/components/ui';
import {
  getOrCreatePrincipalKey,
  exportRecoveryPhrase,
  type PrincipalKey,
} from '@/lib/principal-key-browser';
import { signRepresentationJwtBrowser } from '@/lib/representation-jwt-browser';

/**
 * Client form for `/onboard`. Reuses the Phase-8.5 browser-held did:key flow
 * to mint an identity, creates a tenant server-side, signs a representation
 * JWT in the browser, and redirects back to the registrar's callback with the
 * cloud-managed principal DID (`did:web:cloud.arp.run:u:<tenantId>`) alongside
 * the JWT.
 *
 * The principal key stays in the browser; the did:web identifier is an alias
 * for the user's browser-held key, published server-side via
 * `GET /u/<tenantId>/did.json` so any verifier can fetch the same public key
 * the user signed with.
 */

type Stage =
  | 'idle'
  | 'generating'
  | 'show_phrase'
  | 'confirming'
  | 'creating_tenant'
  | 'signing_jwt'
  | 'redirecting'
  | 'cancelled';

interface Props {
  sessionId: string;
  domain: string;
  registrar: string;
  callback: string;
}

export default function OnboardRedirectForm(props: Props): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [principal, setPrincipal] = useState<PrincipalKey | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(): Promise<void> {
    setError(null);
    setStage('generating');
    try {
      const key = await getOrCreatePrincipalKey();
      const recovery = await exportRecoveryPhrase();
      setPrincipal(key);
      setPhrase(recovery);
      setStage('show_phrase');
    } catch (err) {
      setError((err as Error).message);
      setStage('idle');
    }
  }

  async function handleComplete(): Promise<void> {
    if (!principal) return;
    setError(null);
    setStage('creating_tenant');
    try {
      const tenantRes = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalDid: principal.did,
          publicKeyMultibase: principal.publicKeyMultibase,
          recoveryPhraseConfirmed: true,
        }),
      });
      if (!tenantRes.ok) {
        const body = (await tenantRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `tenant_create_failed_${tenantRes.status}`);
      }
      const tenantBody = (await tenantRes.json()) as { tenantId: string };
      const cloudPrincipalDid = `did:web:cloud.arp.run:u:${tenantBody.tenantId}`;

      setStage('signing_jwt');
      const jwt = await signRepresentationJwtBrowser({
        principal,
        issuerDid: cloudPrincipalDid,
        agentDid: `did:web:${props.domain}`,
      });

      // Best-effort: update the onboarding_sessions row with the resolved
      // principal DID so a future reconciliation can match. Non-blocking on
      // the redirect path.
      void fetch('/api/onboard/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: props.sessionId, principalDid: cloudPrincipalDid }),
      }).catch(() => {});

      setStage('redirecting');
      const target = buildCallback(props.callback, {
        principal_did: cloudPrincipalDid,
        public_key_multibase: principal.publicKeyMultibase,
        signed_representation_jwt: jwt,
      });
      window.location.replace(target);
    } catch (err) {
      setError((err as Error).message);
      setStage('show_phrase');
    }
  }

  function handleCancel(): void {
    setStage('cancelled');
    const target = buildCallback(props.callback, { error: 'cancelled' });
    window.location.replace(target);
  }

  if (stage === 'redirecting' || stage === 'cancelled') {
    return (
      <div className="border border-rule bg-paper p-7">
        <Badge tone="blue" className="mb-4">
          HANDING OFF TO {props.registrar.toUpperCase()}
        </Badge>
        <p className="text-body text-ink-2">
          Redirecting back to your registrar. If nothing happens, return to the registrar tab
          manually.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-rule bg-paper p-7">
      {error && (
        <FieldError data-testid="onboard-error" className="mb-4">
          Error: {error}
        </FieldError>
      )}

      <p className="font-mono text-kicker uppercase text-muted mb-3">
        // DOMAIN · <Code>{props.domain}</Code>
      </p>

      {stage === 'idle' && (
        <>
          <h2 className="font-display font-medium text-h3 mt-0 mb-3">
            Create your agent-owner identity.
          </h2>
          <p className="text-body text-ink-2 mb-6">
            This binds <Code>{props.domain}</Code> to a new ARP Cloud tenant. No password, no
            email — your browser generates the keys locally.
          </p>
          <Button
            variant="primary"
            arrow
            onClick={() => void handleGenerate()}
            data-testid="onboard-generate-btn"
          >
            Generate identity
          </Button>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="font-mono text-kicker uppercase text-muted hover:text-ink transition-colors"
              data-testid="onboard-cancel-btn"
            >
              Cancel &amp; return to registrar
            </button>
          </div>
        </>
      )}

      {stage === 'generating' && (
        <p className="text-body text-ink-2">
          Your identity is being generated securely in your browser…
        </p>
      )}

      {stage === 'show_phrase' && principal && phrase && (
        <>
          <h2 className="font-display font-medium text-h3 mt-0 mb-2">Save your recovery phrase</h2>
          <p className="font-mono text-kicker uppercase text-muted mb-3">
            // THIS IS THE ONLY WAY TO RECOVER THIS ACCOUNT
          </p>
          <Pre data-testid="onboard-principal-did">{principal.did}</Pre>
          {!phraseRevealed && (
            <div className="mt-4">
              <Button
                variant="ghost"
                arrow
                onClick={() => setPhraseRevealed(true)}
                data-testid="onboard-reveal-phrase-btn"
              >
                Reveal recovery phrase
              </Button>
            </div>
          )}
          {phraseRevealed && (
            <>
              <div className="mt-4">
                <Pre data-testid="onboard-recovery-phrase">{phrase}</Pre>
              </div>
              <label className="flex items-center gap-2 font-mono text-kicker uppercase text-ink-2 mt-3 mb-3">
                <input
                  type="checkbox"
                  checked={phraseSaved}
                  onChange={(e) => setPhraseSaved(e.target.checked)}
                  data-testid="onboard-phrase-saved-checkbox"
                  className="accent-signal-blue"
                />
                I HAVE SAVED MY RECOVERY PHRASE SOMEWHERE SAFE
              </label>
              <Button
                variant="primary"
                arrow
                disabled={!phraseSaved}
                onClick={() => void handleComplete()}
                data-testid="onboard-complete-btn"
              >
                Finish &amp; return to registrar
              </Button>
            </>
          )}
        </>
      )}

      {(stage === 'creating_tenant' || stage === 'signing_jwt') && (
        <p className="text-body text-ink-2">
          {stage === 'creating_tenant' && 'Creating your tenant…'}
          {stage === 'signing_jwt' && 'Signing domain binding…'}
        </p>
      )}
    </div>
  );
}

export function buildCallback(callback: string, params: Record<string, string>): string {
  const url = new URL(callback);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}
