'use client';

import type * as React from 'react';
import { useState } from 'react';
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
      <div style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Account created</h2>
        <p style={{ color: '#cbd5e1' }}>
          Your agent-owner identity is live and your tenant is provisioned.
        </p>
        {agentDid && (
          <p>
            Agent <code>{agentDid}</code> is now connected to ARP Cloud.
          </p>
        )}
        {tenantId && (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Tenant ID: <code>{tenantId}</code>
          </p>
        )}
        <a href="/dashboard" style={ctaStyle}>
          Go to dashboard →
        </a>
      </div>
    );
  }

  return (
    <>
      <div style={panelStyle}>
        {error && (
          <p style={{ color: '#f87171' }} data-testid="onboarding-error">
            Error: {error}
          </p>
        )}

        {stage === 'idle' && (
          <>
            <h2 style={headingStyle}>Get started with ARP Cloud</h2>
            <p style={{ color: '#cbd5e1' }}>
              Create your agent-owner identity. Your keys stay in this browser; we never see
              them.
            </p>
            <button
              style={ctaStyle}
              onClick={() => void handleGenerate()}
              data-testid="create-account-btn"
            >
              Create your account
            </button>
          </>
        )}

        {stage === 'generating' && (
          <p>Your identity is being generated securely in your browser…</p>
        )}

        {(stage === 'show_identity' || stage === 'show_phrase' || stage === 'name_agent' ||
          stage === 'creating_tenant' || stage === 'creating_agent') && principal && (
          <>
            <h2 style={headingStyle}>Your agent-owner identity</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              This is the identifier other agents will use to verify actions authorised by
              you.
            </p>
            <pre style={preStyle} data-testid="principal-did">
              {principal.did}
            </pre>
          </>
        )}

        {(stage === 'show_identity' || stage === 'show_phrase') && phrase && (
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ ...headingStyle, fontSize: '1rem' }}>Save your recovery phrase</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Write these 12 words down offline. If you lose this browser, this phrase is the
              only way to recover your account.
            </p>
            {!phraseRevealed && (
              <button
                style={secondaryCtaStyle}
                onClick={() => {
                  setPhraseRevealed(true);
                  setStage('show_phrase');
                }}
                data-testid="reveal-phrase-btn"
              >
                Reveal recovery phrase
              </button>
            )}
            {phraseRevealed && (
              <>
                <pre style={preStyle} data-testid="recovery-phrase">
                  {phrase}
                </pre>
                <label style={checkboxLabelStyle}>
                  <input
                    type="checkbox"
                    checked={phraseSaved}
                    onChange={(e) => setPhraseSaved(e.target.checked)}
                    data-testid="phrase-saved-checkbox"
                  />
                  I have saved my recovery phrase somewhere safe.
                </label>
                <button
                  style={{
                    ...ctaStyle,
                    marginTop: '0.5rem',
                    opacity: phraseSaved ? 1 : 0.5,
                    cursor: phraseSaved ? 'pointer' : 'not-allowed',
                  }}
                  disabled={!phraseSaved}
                  onClick={() => void handleContinueToName()}
                  data-testid="name-agent-btn"
                >
                  Name your agent
                </button>
              </>
            )}
          </div>
        )}

        {(stage === 'name_agent' || stage === 'creating_tenant' || stage === 'creating_agent') && (
          <div style={{ marginTop: '1.5rem' }}>
            <label style={labelStyle} htmlFor="agent-name">
              Agent name (your agent's subdomain)
            </label>
            <input
              id="agent-name"
              style={inputStyle}
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="my-agent"
              data-testid="agent-name-input"
              disabled={stage !== 'name_agent'}
            />
            <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              Lowercase letters, numbers, and hyphens.
            </p>
            <button
              style={ctaStyle}
              disabled={stage !== 'name_agent' || agentName.length === 0}
              onClick={() => void handleCreateAgent()}
              data-testid="create-agent-btn"
            >
              {stage === 'creating_tenant' && 'Creating tenant…'}
              {stage === 'creating_agent' && 'Provisioning agent…'}
              {stage === 'name_agent' && 'Create agent'}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button
          style={linkStyle}
          onClick={() => setAdvancedOpen((v) => !v)}
          data-testid="advanced-toggle"
        >
          {advancedOpen ? '▾' : '▸'} I already run a sidecar — migrate it
        </button>
        {advancedOpen && (
          <div style={{ ...panelStyle, marginTop: '0.75rem' }}>
            <AdvancedHandoffFlow onReset={() => void clearPrincipalKey()} />
          </div>
        )}
      </div>
    </>
  );
}

function AdvancedHandoffFlow({ onReset: _onReset }: { onReset: () => void }): React.JSX.Element {
  // Legacy three-step flow kept for sovereign users who already have a
  // sidecar keypair. They paste their principal DID, sign the challenge
  // externally (via the sidecar CLI), paste the signature, then paste the
  // handoff bundle.
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
        <h3 style={{ ...headingStyle, fontSize: '1rem' }}>Sidecar migrated</h3>
        <p>
          Agent <code>{agentDid}</code> is now connected to ARP Cloud.
        </p>
        <a href="/dashboard" style={ctaStyle}>
          Go to dashboard →
        </a>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ ...headingStyle, fontSize: '1rem' }}>Migrate an existing sidecar</h3>
      <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
        Sign a challenge with your sidecar's principal key, then paste your handoff bundle.
      </p>
      {error && <p style={{ color: '#f87171' }}>Error: {error}</p>}
      {step === 'signin' && !nonce && (
        <>
          <label style={labelStyle}>Principal DID</label>
          <input
            style={inputStyle}
            value={principalDid}
            onChange={(e) => setPrincipalDid(e.target.value)}
            placeholder="did:key:z6Mk… or did:web:…"
            data-testid="advanced-principal-did-input"
          />
          <button
            style={ctaStyle}
            onClick={() => void requestChallenge()}
            disabled={busy || !principalDid}
          >
            Request challenge
          </button>
        </>
      )}
      {step === 'signin' && nonce && (
        <>
          <p>
            Sign this nonce with your principal DID's private key (via the sidecar CLI), then
            paste the base64url signature.
          </p>
          <pre style={preStyle}>{nonce}</pre>
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="base64url signature"
          />
          <button
            style={ctaStyle}
            onClick={() => void verifySignature()}
            disabled={busy || !signature}
          >
            Verify
          </button>
        </>
      )}
      {step === 'handoff' && (
        <>
          <label style={labelStyle}>Handoff bundle (paste JSON)</label>
          <textarea
            style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace' }}
            value={handoff}
            onChange={(e) => setHandoff(e.target.value)}
            placeholder='{"agent_did": "did:web:...", "principal_did": "did:key:z...", ...}'
          />
          <button style={ctaStyle} onClick={() => void submitHandoff()} disabled={busy || !handoff}>
            Provision agent
          </button>
        </>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: '1.5rem',
  border: '1px solid #334155',
  borderRadius: '0.5rem',
  backgroundColor: '#1e293b',
};
const headingStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  marginTop: 0,
  marginBottom: '0.5rem',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  color: '#94a3b8',
  marginBottom: '0.5rem',
};
const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.875rem',
  color: '#cbd5e1',
  marginBottom: '0.75rem',
};
const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginBottom: '1rem',
  padding: '0.5rem 0.75rem',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: '0.375rem',
};
const ctaStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.625rem 1rem',
  backgroundColor: '#3b82f6',
  color: '#0f172a',
  borderRadius: '0.375rem',
  border: 'none',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
};
const secondaryCtaStyle: React.CSSProperties = {
  ...ctaStyle,
  backgroundColor: 'transparent',
  color: '#60a5fa',
  border: '1px solid #3b82f6',
};
const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: '0.875rem',
  padding: 0,
  textDecoration: 'underline',
};
const preStyle: React.CSSProperties = {
  padding: '0.75rem',
  backgroundColor: '#0f172a',
  borderRadius: '0.375rem',
  overflowX: 'auto',
  fontSize: '0.875rem',
  marginBottom: '1rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};
