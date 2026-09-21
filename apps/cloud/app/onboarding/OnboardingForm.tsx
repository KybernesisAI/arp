'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Card, ErrorText, Kicker, PrimaryButton, PrimaryLink, QuietLink, SecondaryButton, Tag, TextArea, TextInput } from '@/app/lander/ui';
import { getOrCreatePrincipalKey, exportRecoveryPhrase, clearPrincipalKey, type PrincipalKey } from '@/lib/principal-key-browser';

/**
 * Create account, in the lander language. Three steps on one page:
 *   1. make the key in this browser
 *   2. save the recovery phrase (must confirm)
 *   3. name a first agent (creates the account, then the agent)
 * Advanced (collapsed): migrate a self-hosted runtime by signing a challenge
 * and pasting its handoff bundle. Same stages + test ids as before.
 */

type Stage = 'idle' | 'generating' | 'show_identity' | 'show_phrase' | 'name_agent' | 'creating_tenant' | 'creating_agent' | 'done';

export default function OnboardingForm({ nextUrl }: { nextUrl?: string | null } = {}): React.JSX.Element {
  const successHref = nextUrl ?? '/dashboard';
  const successLabel = nextUrl ? 'Continue' : 'Go to your dashboard';
  const [stage, setStage] = useState<Stage>('idle');
  const [principal, setPrincipal] = useState<PrincipalKey | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentDid, setAgentDid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function copyPhrase(): Promise<void> {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* select the text by hand */
    }
  }

  async function handleCreateAgent(): Promise<void> {
    if (!principal) return;
    const trimmed = agentName.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(trimmed) || trimmed.length < 2) {
      setError('Use lowercase letters, numbers and hyphens (at least two characters).');
      return;
    }
    setError(null);
    setStage('creating_tenant');
    try {
      const tenantRes = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ principalDid: principal.did, publicKeyMultibase: principal.publicKeyMultibase, recoveryPhraseConfirmed: true }),
      });
      if (!tenantRes.ok) {
        const body = (await tenantRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `tenant_create_failed_${tenantRes.status}`);
      }
      setStage('creating_agent');
      const agentRes = await fetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentName: trimmed }) });
      if (agentRes.ok) {
        const body = (await agentRes.json()) as { agentDid?: string };
        if (body.agentDid) setAgentDid(body.agentDid);
      }
      // Agent provisioning may not be wired for this path; the account exists either way.
      setStage('done');
    } catch (err) {
      setError((err as Error).message);
      setStage('name_agent');
    }
  }

  const step = (n: number, label: string, state: 'todo' | 'now' | 'done') => (
    <div className="flex items-center gap-3">
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] ${state === 'done' ? 'bg-emerald-500 text-white' : state === 'now' ? 'bg-black text-white' : 'border border-zinc-300 text-zinc-400'}`}>{state === 'done' ? '✓' : n}</span>
      <span className={`text-[14px] ${state === 'todo' ? 'text-zinc-400' : 'text-zinc-900'}`}>{label}</span>
    </div>
  );
  const s1 = stage === 'idle' || stage === 'generating' ? 'now' : 'done';
  const s2 = stage === 'show_identity' || stage === 'show_phrase' ? 'now' : s1 === 'done' ? 'done' : 'todo';
  const s3 = stage === 'name_agent' || stage === 'creating_tenant' || stage === 'creating_agent' ? 'now' : stage === 'done' ? 'done' : 'todo';

  if (stage === 'done') {
    return (
      <Card glow="emerald">
        <Tag tone="emerald">Account created</Tag>
        <h2 className="mt-4 text-[26px] font-medium tracking-[-0.02em] text-zinc-950">You are in.</h2>
        <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">
          Your account is ready and the key is in this browser. Next: claim a .agent name, connect your agent to it, and add an email on your account page so you can sign in from other devices.
        </p>
        {agentDid && <p className="mt-2 text-[15px] text-zinc-800">First agent: <span className="font-medium">{agentDid.replace(/^did:web:/, '')}</span></p>}
        <div className="mt-6"><PrimaryLink href={successHref}>{successLabel}</PrimaryLink></div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <Kicker>Three steps</Kicker>
        <div className="mt-4 space-y-3">
          {step(1, 'Make your key', s1)}
          {step(2, 'Save the recovery phrase', s2)}
          {step(3, 'Name your first agent', s3)}
        </div>
        <p className="mt-6 text-[13px] text-zinc-500">Nothing is sent until step 3. The key never leaves this browser; we only ever see a signature.</p>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card glow={stage === 'idle' || stage === 'generating' ? 'emerald' : undefined}>
          {error && <ErrorText className="mb-4" data-testid="onboarding-error">{error}</ErrorText>}

          {stage === 'idle' && (
            <>
              <Kicker>Step 1</Kicker>
              <h2 className="mt-2 text-[22px] font-medium tracking-[-0.01em] text-zinc-950">Make your account key.</h2>
              <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">One click. It is created here, in this browser, and stays here.</p>
              <div className="mt-5"><PrimaryButton onClick={() => void handleGenerate()} data-testid="create-account-btn">Create my key</PrimaryButton></div>
            </>
          )}
          {stage === 'generating' && (
            <>
              <Kicker>Step 1</Kicker>
              <p className="mt-2 text-[15px] text-zinc-600">Making your key…</p>
            </>
          )}

          {(stage === 'show_identity' || stage === 'show_phrase') && principal && phrase && (
            <>
              <Kicker>Step 2</Kicker>
              <h2 className="mt-2 text-[22px] font-medium tracking-[-0.01em] text-zinc-950">Save your recovery phrase.</h2>
              <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">
                Twelve words. Write them down and keep them offline. If you lose this browser, they are the only way back into your account.
              </p>
              <span className="sr-only" data-testid="principal-did">{principal.did}</span>
              {!phraseRevealed ? (
                <div className="mt-5">
                  <SecondaryButton onClick={() => { setPhraseRevealed(true); setStage('show_phrase'); }} data-testid="reveal-phrase-btn">Show the 12 words</SecondaryButton>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-50 p-4 sm:grid-cols-3" data-testid="recovery-phrase">
                    {phrase.split(' ').map((w, i) => (
                      <div key={i} className="flex items-baseline gap-2 font-mono text-[13px]">
                        <span className="w-5 text-right text-zinc-400">{i + 1}</span>
                        <span className="text-zinc-900">{w}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3"><QuietLink onClick={() => void copyPhrase()}>{copied ? 'Copied' : 'Copy the words'}</QuietLink></div>
                  <label className="mt-5 flex items-start gap-3 text-[14px] text-zinc-800">
                    <input type="checkbox" checked={phraseSaved} onChange={(e) => setPhraseSaved(e.target.checked)} data-testid="phrase-saved-checkbox" className="mt-1 h-4 w-4 accent-black" />
                    I have saved these 12 words somewhere safe.
                  </label>
                  <div className="mt-5"><PrimaryButton disabled={!phraseSaved} onClick={() => void handleContinueToName()} data-testid="name-agent-btn">Continue</PrimaryButton></div>
                </>
              )}
            </>
          )}

          {(stage === 'name_agent' || stage === 'creating_tenant' || stage === 'creating_agent') && (
            <>
              <Kicker>Step 3</Kicker>
              <h2 className="mt-2 text-[22px] font-medium tracking-[-0.01em] text-zinc-950">Name your first agent.</h2>
              <p className="mt-2 max-w-[60ch] text-[15px] text-zinc-600">A short handle for now; you claim its permanent .agent name from the dashboard.</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <TextInput id="agent-name" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="my-agent" aria-label="Agent name" data-testid="agent-name-input" disabled={stage !== 'name_agent'} autoComplete="off" spellCheck={false} />
                <PrimaryButton className="shrink-0" disabled={stage !== 'name_agent' || agentName.length === 0} onClick={() => void handleCreateAgent()} data-testid="create-agent-btn">
                  {stage === 'creating_tenant' && 'Creating your account…'}
                  {stage === 'creating_agent' && 'Setting up the agent…'}
                  {stage === 'name_agent' && 'Create account'}
                </PrimaryButton>
              </div>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Lowercase letters, numbers and hyphens</p>
            </>
          )}
        </Card>

        <div>
          <QuietLink onClick={() => setAdvancedOpen((v) => !v)} data-testid="advanced-toggle">{advancedOpen ? 'Hide' : 'Advanced'}: I already run my own agent runtime</QuietLink>
          {advancedOpen && (
            <Card className="mt-3">
              <AdvancedHandoffFlow onReset={() => void clearPrincipalKey()} successHref={successHref} successLabel={successLabel} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AdvancedHandoffFlow({ onReset: _onReset, successHref, successLabel }: { onReset: () => void; successHref: string; successLabel: string }): React.JSX.Element {
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
      const res = await fetch('/api/auth/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid }) });
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
      const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalDid, nonce, signature }) });
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
      const res = await fetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handoff: parsed }) });
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
        <Tag tone="emerald">Runtime connected</Tag>
        <p className="mt-3 text-[15px] text-zinc-800">{agentDid ? agentDid.replace(/^did:web:/, '') : 'Your agent'} is now connected.</p>
        <div className="mt-4"><PrimaryLink href={successHref}>{successLabel}</PrimaryLink></div>
      </div>
    );
  }

  return (
    <div>
      <Kicker>Bring your own runtime</Kicker>
      <p className="mt-2 max-w-[60ch] text-[14px] text-zinc-600">Sign a challenge with the key your runtime holds, then paste the handoff bundle it exported.</p>
      {error && <ErrorText className="mt-3">{error}</ErrorText>}
      {step === 'signin' && !nonce && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <TextInput value={principalDid} onChange={(e) => setPrincipalDid(e.target.value)} placeholder="account identifier" className="font-mono text-[13px]" data-testid="advanced-principal-did-input" />
          <PrimaryButton className="shrink-0" onClick={() => void requestChallenge()} disabled={busy || !principalDid}>Get a challenge</PrimaryButton>
        </div>
      )}
      {step === 'signin' && nonce && (
        <div className="mt-4">
          <p className="text-[14px] text-zinc-800">Sign this exactly, then paste the signature:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-50 p-3 font-mono text-[12px] text-zinc-800">{nonce}</pre>
          <TextArea className="mt-3 font-mono text-[13px]" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="signature" rows={2} />
          <div className="mt-3"><PrimaryButton onClick={() => void verifySignature()} disabled={busy || !signature}>Verify</PrimaryButton></div>
        </div>
      )}
      {step === 'handoff' && (
        <div className="mt-4">
          <TextArea className="font-mono text-[13px]" value={handoff} onChange={(e) => setHandoff(e.target.value)} placeholder="paste the handoff bundle (JSON)" rows={5} />
          <div className="mt-3"><PrimaryButton onClick={() => void submitHandoff()} disabled={busy || !handoff}>Connect the agent</PrimaryButton></div>
        </div>
      )}
    </div>
  );
}
