'use client';

import type * as React from 'react';
import { useState } from 'react';
import {
  Badge,
  Button,
  ButtonLink,
  Code,
  FieldError,
  FieldHint,
  Input,
  Label,
  Pre,
  Textarea,
} from '@/components/ui';
import {
  getOrCreatePrincipalKey,
  exportRecoveryPhrase,
  clearPrincipalKey,
  type PrincipalKey,
} from '@/lib/principal-key-browser';

/**
 * Phase-8.5 onboarding UI.
 *
 * Default mode (new user): one-click did:key generation in the browser,
 * recovery-phrase reveal + save, tenant creation, agent naming. Zero DID
 * pasting, zero signature pasting.
 *
 * Advanced mode (sidecar migration): collapsible panel that preserves the
 * legacy three-step sign-in / handoff-paste flow for sovereign users who
 * already run the sidecar and hold a keypair there.
 */

type Stage =
  | 'idle'
  | 'generating'
  | 'show_identity'
  | 'show_phrase'
  | 'name_agent'
  | 'creating_tenant'
  | 'creating_agent'
  | 'done';

export default function OnboardingForm(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [principal, setPrincipal] = useState<PrincipalKey | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentDid, setAgentDid] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function handleGenerate(): Promise<void> {
    setError(null);
    setStage('generating');
    try {
      const key = await getOrCreatePrincipalKey();
      const recovery = await exportRecoveryPhrase();
      setPrincipal(key);
      setPhrase(recovery);
      setStage('show_identity');
    } catch (err) {
      setError((err as Error).message);
      setStage('idle');
    }
  }

  async function handleContinueToName(): Promise<void> {
    if (!phraseSaved || !principal) return;
    setStage('name_agent');
  }

  async function handleCreateAgent(): Promise<void> {
    if (!principal) return;
    const trimmed = agentName.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(trimmed) || trimmed.length < 2) {
      setError('Agent name must be lowercase alphanumeric with optional hyphens.');
      return;
    }
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
      setTenantId(tenantBody.tenantId);

      setStage('creating_agent');
      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentName: trimmed }),
      });
      if (agentRes.ok) {
        const body = (await agentRes.json()) as { agentDid?: string };
        if (body.agentDid) setAgentDid(body.agentDid);
      }
      // If agent provisioning is not yet wired for the cloud-minted flow (it
      // currently requires a handoff bundle), we still land the user on the
      // dashboard. Phase 9 lands full server-side provisioning.
      setStage('done');
    } catch (err) {
      setError((err as Error).message);
      setStage('name_agent');
    }
  }

  if (stage === 'done') {
    return (
      <div className="border border-rule bg-paper p-7">
        <Badge tone="blue" className="mb-4">
          ACCOUNT · CREATED
        </Badge>
        <h2 className="font-display font-medium text-h3 mt-0">You are live.</h2>
        <p className="mt-3 text-body text-ink-2">
          Your agent-owner identity is live and your tenant is provisioned.
        </p>
        {agentDid && (
          <p className="mt-3 text-body">
            Agent <Code>{agentDid}</Code> is now connected to ARP Cloud.
          </p>
        )}
        {tenantId && (
          <p className="mt-2 font-mono text-kicker uppercase text-muted">
            TENANT · {tenantId}
          </p>
        )}
        <div className="mt-6">
          <ButtonLink href="/dashboard" variant="primary" arrow>
            Go to dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="border border-rule bg-paper p-7">
        {error && (
          <FieldError data-testid="onboarding-error" className="mb-4">
            Error: {error}
          </FieldError>
        )}

        {stage === 'idle' && (
          <>
            <h2 className="font-display font-medium text-h3 mt-0 mb-3">
              Create your agent-owner identity.
            </h2>
            <p className="text-body text-ink-2 mb-6">
              Your keys stay in this browser. We never see them.
            </p>
            <Button
              variant="primary"
              arrow
              onClick={() => void handleGenerate()}
              data-testid="create-account-btn"
            >
              Create your account
            </Button>
          </>
        )}

        {stage === 'generating' && (
          <p className="text-body text-ink-2">
            Your identity is being generated securely in your browser…
          </p>
        )}

        {(stage === 'show_identity' ||
          stage === 'show_phrase' ||
          stage === 'name_agent' ||
          stage === 'creating_tenant' ||
          stage === 'creating_agent') &&
          principal && (
            <>
              <h2 className="font-display font-medium text-h3 mt-0 mb-2">
                Your agent-owner identity
              </h2>
              <p className="font-mono text-kicker uppercase text-muted mb-3">
                // THIS IS THE IDENTIFIER OTHER AGENTS WILL USE
              </p>
              <Pre data-testid="principal-did">{principal.did}</Pre>
            </>
          )}

        {(stage === 'show_identity' || stage === 'show_phrase') && phrase && (
          <div className="mt-6">
            <h3 className="font-display font-medium text-h4 mt-0 mb-2">
              Save your recovery phrase
            </h3>
            <p className="text-body-sm text-ink-2 mb-3">
              Write these 12 words down offline. If you lose this browser, this phrase is the
              only way to recover your account.
            </p>
            {!phraseRevealed && (
              <Button
                variant="ghost"
                arrow
                onClick={() => {
                  setPhraseRevealed(true);
                  setStage('show_phrase');
                }}
                data-testid="reveal-phrase-btn"
              >
                Reveal recovery phrase
              </Button>
            )}
            {phraseRevealed && (
              <>
                <Pre data-testid="recovery-phrase">{phrase}</Pre>
                <label className="flex items-center gap-2 font-mono text-kicker uppercase text-ink-2 mt-3 mb-3">
                  <input
                    type="checkbox"
                    checked={phraseSaved}
                    onChange={(e) => setPhraseSaved(e.target.checked)}
                    data-testid="phrase-saved-checkbox"
                    className="accent-signal-blue"
                  />
                  I HAVE SAVED MY RECOVERY PHRASE SOMEWHERE SAFE
                </label>
                <Button
                  variant="primary"
                  arrow
                  disabled={!phraseSaved}
                  onClick={() => void handleContinueToName()}
                  data-testid="name-agent-btn"
                >
                  Name your agent
                </Button>
              </>
            )}
          </div>
        )}

        {(stage === 'name_agent' || stage === 'creating_tenant' || stage === 'creating_agent') && (
          <div className="mt-6">
            <Label htmlFor="agent-name">Agent name (your agent subdomain)</Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="my-agent"
              data-testid="agent-name-input"
              disabled={stage !== 'name_agent'}
            />
            <FieldHint>LOWERCASE LETTERS, NUMBERS, AND HYPHENS</FieldHint>
            <div className="mt-4">
              <Button
                variant="primary"
                arrow
                disabled={stage !== 'name_agent' || agentName.length === 0}
                onClick={() => void handleCreateAgent()}
                data-testid="create-agent-btn"
              >
                {stage === 'creating_tenant' && 'Creating tenant…'}
                {stage === 'creating_agent' && 'Provisioning agent…'}
                {stage === 'name_agent' && 'Create agent'}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="advanced-toggle"
          className="font-mono text-kicker uppercase text-muted hover:text-ink transition-colors border-b border-current pb-0.5"
        >
          {advancedOpen ? '▾' : '▸'} I already run a sidecar — migrate it
        </button>
        {advancedOpen && (
          <div className="border border-rule bg-paper p-7 mt-3">
            <AdvancedHandoffFlow onReset={() => void clearPrincipalKey()} />
          </div>
        )}
      </div>
    </>
  );
}

function AdvancedHandoffFlow({ onReset: _onReset }: { onReset: () => void }): React.JSX.Element {
  const [step, setStep] = useState<'signin' | 'handoff' | 'complete'>('signin');
  const [principalDid, setPrincipalDid] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [handoff, setHandoff] = useState('');
  const [agentDid, setAgentDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestChallenge(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'challenge_failed');
      const data = (await res.json()) as { nonce: string };
      setNonce(data.nonce);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifySignature(): Promise<void> {
    if (!nonce) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid, nonce, signature }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'verify_failed');
      setStep('handoff');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitHandoff(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(handoff) as Record<string, unknown>;
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoff: parsed }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'provision_failed');
      const data = (await res.json()) as { agentDid: string };
      setAgentDid(data.agentDid);
      setStep('complete');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'complete') {
    return (
      <div>
        <Badge tone="blue" className="mb-3">
          SIDECAR · MIGRATED
        </Badge>
        <p className="text-body">
          Agent <Code>{agentDid}</Code> is now connected to ARP Cloud.
        </p>
        <div className="mt-4">
          <ButtonLink href="/dashboard" variant="primary" arrow>
            Go to dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-display font-medium text-h4 mt-0 mb-2">
        Migrate an existing sidecar
      </h3>
      <p className="text-body-sm text-ink-2 mb-4">
        Sign a challenge with your sidecar principal key, then paste your handoff bundle.
      </p>
      {error && <FieldError>Error: {error}</FieldError>}
      {step === 'signin' && !nonce && (
        <>
          <Label>Principal DID</Label>
          <Input
            value={principalDid}
            onChange={(e) => setPrincipalDid(e.target.value)}
            placeholder="did:key:z6Mk… or did:web:…"
            data-testid="advanced-principal-did-input"
            className="font-mono"
          />
          <div className="mt-4">
            <Button
              variant="primary"
              arrow
              onClick={() => void requestChallenge()}
              disabled={busy || !principalDid}
            >
              Request challenge
            </Button>
          </div>
        </>
      )}
      {step === 'signin' && nonce && (
        <>
          <p className="text-body-sm text-ink-2 mb-2">
            Sign this nonce with your principal DID private key (via the sidecar CLI), then
            paste the base64url signature.
          </p>
          <Pre>{nonce}</Pre>
          <div className="mt-4">
            <Label>Signature</Label>
            <Textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="base64url signature"
            />
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              arrow
              onClick={() => void verifySignature()}
              disabled={busy || !signature}
            >
              Verify
            </Button>
          </div>
        </>
      )}
      {step === 'handoff' && (
        <>
          <Label>Handoff bundle (paste JSON)</Label>
          <Textarea
            value={handoff}
            onChange={(e) => setHandoff(e.target.value)}
            placeholder='{"agent_did": "did:web:...", "principal_did": "did:key:z...", ...}'
          />
          <div className="mt-4">
            <Button variant="primary" arrow onClick={() => void submitHandoff()} disabled={busy || !handoff}>
              Provision agent
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
