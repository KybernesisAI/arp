'use client';

import type * as React from 'react';
import { useState } from 'react';

type Step = 'signin' | 'handoff' | 'complete';

export default function OnboardingForm(): React.JSX.Element {
  const [step, setStep] = useState<Step>('signin');
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
      <div style={panelStyle}>
        <h2>Provisioning complete</h2>
        <p>
          Agent <code>{agentDid}</code> is now connected to ARP Cloud.
        </p>
        <p style={{ color: '#94a3b8', marginTop: '1rem' }}>
          Next: install the cloud-client on your machine.
        </p>
        <pre style={preStyle}>npx @kybernesis/arp-cloud-client init</pre>
        <a href="/dashboard" style={ctaStyle}>
          Go to dashboard →
        </a>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {error && <p style={{ color: '#f87171' }}>Error: {error}</p>}
      {step === 'signin' && !nonce && (
        <>
          <label style={labelStyle}>Principal DID</label>
          <input
            style={inputStyle}
            value={principalDid}
            onChange={(e) => setPrincipalDid(e.target.value)}
            placeholder="did:web:ian.self.xyz"
          />
          <button style={ctaStyle} onClick={() => void requestChallenge()} disabled={busy || !principalDid}>
            Request challenge
          </button>
        </>
      )}
      {step === 'signin' && nonce && (
        <>
          <p>
            Sign this nonce with your principal DID's private key, then paste the base64url signature.
          </p>
          <pre style={preStyle}>{nonce}</pre>
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="base64url signature"
          />
          <button style={ctaStyle} onClick={() => void verifySignature()} disabled={busy || !signature}>
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
            placeholder='{"agent_did":"did:web:samantha.agent", "principal_did":"did:web:ian.self.xyz", ...}'
          />
          <button style={ctaStyle} onClick={() => void submitHandoff()} disabled={busy || !handoff}>
            Provision agent
          </button>
        </>
      )}
    </div>
  );
}

const panelStyle = {
  padding: '1.5rem',
  border: '1px solid #334155',
  borderRadius: '0.5rem',
  backgroundColor: '#1e293b',
};
const labelStyle = { display: 'block', fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.5rem' };
const inputStyle = {
  display: 'block',
  width: '100%',
  marginBottom: '1rem',
  padding: '0.5rem 0.75rem',
  backgroundColor: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: '0.375rem',
};
const ctaStyle = {
  display: 'inline-block',
  padding: '0.625rem 1rem',
  backgroundColor: '#3b82f6',
  color: '#0f172a',
  borderRadius: '0.375rem',
  border: 'none',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer' as const,
};
const preStyle = {
  padding: '0.75rem',
  backgroundColor: '#0f172a',
  borderRadius: '0.375rem',
  overflowX: 'auto' as const,
  fontSize: '0.875rem',
  marginBottom: '1rem',
};
