'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Card, ErrorText, Kicker, PrimaryButton, QuietLink, SecondaryButton } from '@/app/lander/ui';
import {
  getOrCreatePrincipalKey,
  exportRecoveryPhrase,
  type PrincipalKey,
} from '@/lib/principal-key-browser';
import { signRepresentationJwtBrowser } from '@/lib/representation-jwt-browser';
import { origins } from '@/lib/origins';

/**
 * Client form for `/onboard`. Reuses the Phase-8.5 browser-held did:key flow
 * to mint an identity, creates a tenant server-side, signs a representation
 * JWT in the browser, and redirects back to the registrar's callback with the
 * cloud-managed principal DID (`did:web:cloud.agentid.dev:u:<tenantId>`) alongside
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

const PRE = 'mt-3 whitespace-pre-wrap break-all rounded-xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-800';

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
      const cloudPrincipalDid = `did:web:${origins().consoleHost}:u:${tenantBody.tenantId}`;

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
      <Card className="max-w-[640px]">
        <Kicker>Sending you back</Kicker>
        <p className="mt-3 text-[16px] text-zinc-600">
          Taking you back to where you bought your name. If nothing happens, return to that tab yourself.
        </p>
      </Card>
    );
  }

  return (
    <Card className="max-w-[640px]">
      {error && (
        <ErrorText data-testid="onboard-error" className="mb-4">
          Something went wrong: {error}
        </ErrorText>
      )}

      <Kicker>Your name</Kicker>
      <p className="mt-1 mb-6 text-[20px] font-medium tracking-[-0.015em] text-zinc-950">{props.domain}</p>

      {stage === 'idle' && (
        <>
          <h2 className="text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">Create your account.</h2>
          <p className="mt-3 mb-6 text-[16px] text-zinc-600">
            This connects {props.domain} to a new AgentID account. No password and no email needed: your
            browser creates a key and keeps it here.
          </p>
          <div>
            <PrimaryButton onClick={() => void handleGenerate()} data-testid="onboard-generate-btn">
              Create my account
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <QuietLink onClick={handleCancel} data-testid="onboard-cancel-btn">
              Cancel and go back
            </QuietLink>
          </div>
        </>
      )}

      {stage === 'generating' && (
        <p className="text-[16px] text-zinc-600">Creating your account key in this browser…</p>
      )}

      {stage === 'show_phrase' && principal && phrase && (
        <>
          <h2 className="text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-zinc-950">Save your recovery phrase.</h2>
          <p className="mt-3 text-[16px] text-zinc-600">
            This is the only way to get back into this account if you lose this browser. Write it down or
            keep it in a password manager.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900">Show account key</summary>
            <pre className={PRE} data-testid="onboard-principal-did">{principal.did}</pre>
          </details>
          {!phraseRevealed && (
            <div className="mt-5">
              <SecondaryButton onClick={() => setPhraseRevealed(true)} data-testid="onboard-reveal-phrase-btn">
                Show recovery phrase
              </SecondaryButton>
            </div>
          )}
          {phraseRevealed && (
            <>
              <pre className={PRE} data-testid="onboard-recovery-phrase">{phrase}</pre>
              <label className="mt-4 mb-5 flex items-start gap-3 text-[15px] text-zinc-700">
                <input
                  type="checkbox"
                  checked={phraseSaved}
                  onChange={(e) => setPhraseSaved(e.target.checked)}
                  data-testid="onboard-phrase-saved-checkbox"
                  className="mt-1 h-4 w-4 accent-black"
                />
                <span>I have saved my recovery phrase somewhere safe.</span>
              </label>
              <div>
                <PrimaryButton disabled={!phraseSaved} onClick={() => void handleComplete()} data-testid="onboard-complete-btn">
                  Finish
                </PrimaryButton>
              </div>
            </>
          )}
        </>
      )}

      {(stage === 'creating_tenant' || stage === 'signing_jwt') && (
        <p className="text-[16px] text-zinc-600">
          {stage === 'creating_tenant' && 'Creating your account…'}
          {stage === 'signing_jwt' && 'Confirming your name…'}
        </p>
      )}
    </Card>
  );
}

export function buildCallback(callback: string, params: Record<string, string>): string {
  const url = new URL(callback);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}
