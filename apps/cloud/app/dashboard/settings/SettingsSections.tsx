'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Badge, Button, Card, Code, FieldError } from '@/components/ui';
import {
  exportRecoveryPhrase,
  principalKeyVersion,
  rotateToV2,
  signWithV1,
  signWithV2,
} from '@/lib/principal-key-browser';
import { registerPasskey } from '@/lib/principal-key-passkey';

export interface CredentialView {
  id: string;
  nickname: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export function SettingsSections({
  credentials,
  currentPrincipalDid,
  hasPreviousDid,
  v1DeprecatedAt,
}: {
  credentials: CredentialView[];
  currentPrincipalDid: string;
  hasPreviousDid: boolean;
  v1DeprecatedAt: string | null;
}): React.JSX.Element {
  return (
    <div className="space-y-14">
      <PasskeysSection initial={credentials} />
      <RotateSection
        currentPrincipalDid={currentPrincipalDid}
        hasPreviousDid={hasPreviousDid}
        v1DeprecatedAt={v1DeprecatedAt}
      />
      <RecoveryPhraseSection />
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. Passkeys

function PasskeysSection({
  initial,
}: {
  initial: CredentialView[];
}): React.JSX.Element {
  const [creds, setCreds] = useState<CredentialView[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rename(id: string, nickname: string | null): Promise<void> {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/webauthn/credentials/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `rename_failed_${res.status}`);
      }
      const body = (await res.json()) as { id: string; nickname: string | null };
      setCreds((rows) =>
        rows.map((r) => (r.id === body.id ? { ...r, nickname: body.nickname } : r)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!confirm('Remove this passkey? This cannot be undone.')) return;
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/webauthn/credentials/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `delete_failed_${res.status}`);
      }
      setCreds((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function addNew(): Promise<void> {
    setError(null);
    try {
      const result = await registerPasskey();
      setCreds((rows) => [
        ...rows,
        {
          id: result.id,
          nickname: null,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
        <h2 className="font-display font-medium text-h3">
          Passkeys <span className="text-muted font-mono text-body-sm ml-2">{creds.length}</span>
        </h2>
        <Button
          variant="default"
          size="sm"
          onClick={() => void addNew()}
          data-testid="add-passkey-settings-btn"
        >
          Add passkey
        </Button>
      </header>

      {error && <FieldError className="mb-4">Error: {error}</FieldError>}

      {creds.length === 0 ? (
        <Card tone="paper-2" padded>
          <p className="text-body text-ink-2">
            No passkeys registered. Add one to replace recovery-phrase sign-in
            with Touch ID / Face ID / Windows Hello.
          </p>
        </Card>
      ) : (
        <ul className="list-none p-0 m-0 border-t border-rule">
          {creds.map((c) => (
            <PasskeyRow
              key={c.id}
              cred={c}
              busy={busyId === c.id}
              disableDelete={creds.length <= 1}
              onRename={(name) => void rename(c.id, name)}
              onDelete={() => void remove(c.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PasskeyRow({
  cred,
  busy,
  disableDelete,
  onRename,
  onDelete,
}: {
  cred: CredentialView;
  busy: boolean;
  disableDelete: boolean;
  onRename: (nickname: string | null) => void;
  onDelete: () => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cred.nickname ?? '');

  function commit(): void {
    setEditing(false);
    const trimmed = draft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== cred.nickname) onRename(next);
  }

  return (
    <li className="grid grid-cols-12 gap-4 py-4 border-b border-rule items-baseline">
      <div className="col-span-12 md:col-span-4">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(cred.nickname ?? '');
                setEditing(false);
              }
            }}
            className="bg-paper-2 border border-rule px-2 py-1 text-body-sm w-full"
            data-testid={`cred-rename-input-${cred.id}`}
          />
        ) : (
          <button
            type="button"
            className="text-left font-display font-medium text-h5 hover:opacity-70"
            onClick={() => setEditing(true)}
            data-testid={`cred-rename-btn-${cred.id}`}
          >
            {cred.nickname ?? <em className="text-muted not-italic">(unnamed)</em>}
          </button>
        )}
      </div>
      <div className="col-span-12 md:col-span-5 font-mono text-kicker uppercase text-muted">
        CREATED {formatDate(cred.createdAt)}
        {cred.lastUsedAt && (
          <>
            {' · LAST USED '}
            {formatDate(cred.lastUsedAt)}
          </>
        )}
      </div>
      <div className="col-span-12 md:col-span-3 md:text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={busy || disableDelete}
          data-testid={`cred-delete-btn-${cred.id}`}
          title={
            disableDelete
              ? 'Add another passkey before removing the last one'
              : 'Remove this passkey'
          }
        >
          {busy ? '…' : 'Remove'}
        </Button>
      </div>
    </li>
  );
}

// ----------------------------------------------------------------------
// 2. Identity rotation

function RotateSection({
  currentPrincipalDid,
  hasPreviousDid,
  v1DeprecatedAt,
}: {
  currentPrincipalDid: string;
  hasPreviousDid: boolean;
  v1DeprecatedAt: string | null;
}): React.JSX.Element {
  const [stage, setStage] = useState<'idle' | 'pending' | 'done' | 'error'>(
    hasPreviousDid ? 'done' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const graceDaysLeft = daysUntilGraceExpiry(v1DeprecatedAt);

  async function rotate(): Promise<void> {
    setError(null);
    setStage('pending');
    try {
      const version = await principalKeyVersion();
      if (version !== 'v1') {
        throw new Error('no_v1_key_to_rotate');
      }
      const { oldDid, newDid, newPublicKeyMultibase } = await rotateToV2();
      const issuedAt = Date.now();
      const challenge = new TextEncoder().encode(
        `arp-rotate-v1:${oldDid}:${newDid}:${issuedAt}`,
      );
      const [sigOld, sigNew] = await Promise.all([
        signWithV1(challenge),
        signWithV2(challenge),
      ]);
      const res = await fetch('/api/tenants/rotate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oldPrincipalDid: oldDid,
          newPrincipalDid: newDid,
          newPublicKeyMultibase,
          signatureOld: toBase64Url(sigOld),
          signatureNew: toBase64Url(sigNew),
          issuedAt,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `rotate_failed_${res.status}`);
      }
      setStage('done');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
        <h2 className="font-display font-medium text-h3">Identity rotation</h2>
        {hasPreviousDid ? (
          <Badge tone="blue">ROTATED</Badge>
        ) : (
          <Badge tone="yellow">V1 · ROTATION AVAILABLE</Badge>
        )}
      </header>

      <div className="grid grid-cols-12 gap-4 items-baseline">
        <div className="col-span-12 md:col-span-8 space-y-4">
          <div>
            <div className="font-mono text-kicker uppercase text-muted">// CURRENT DID</div>
            <div className="mt-2 flex items-baseline gap-3">
              <Code className="text-[13px] break-all" data-testid="current-did-short">
                {revealed
                  ? currentPrincipalDid
                  : `did:key:…${currentPrincipalDid.slice(-8)}`}
              </Code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevealed((r) => !r)}
                data-testid="reveal-did-btn"
              >
                {revealed ? 'Hide' : 'Reveal'}
              </Button>
            </div>
          </div>

          {hasPreviousDid && graceDaysLeft !== null && graceDaysLeft > 0 && (
            <p className="text-body-sm text-ink-2" data-testid="grace-window">
              Rotation complete. The previous DID remains valid for
              signature verification for{' '}
              <strong>{graceDaysLeft} day{graceDaysLeft === 1 ? '' : 's'}</strong>.
              After that, only the current DID verifies.
            </p>
          )}

          {!hasPreviousDid && (
            <p className="text-body-sm text-ink-2">
              Phase 9d introduced a stronger seed derivation (HKDF-SHA256).
              Rotating changes your principal DID; your tenant, connections,
              and audit history carry forward. The old DID stays valid for
              90 days so pre-rotation audit signatures still verify.
            </p>
          )}
        </div>
        <div className="col-span-12 md:col-span-4 md:text-right">
          <Button
            variant="primary"
            onClick={() => void rotate()}
            disabled={stage === 'pending' || hasPreviousDid}
            data-testid="rotate-identity-btn"
          >
            {stage === 'pending'
              ? 'Rotating…'
              : hasPreviousDid
                ? 'Already rotated'
                : 'Rotate identity key'}
          </Button>
        </div>
      </div>

      {error && (
        <FieldError className="mt-4" data-testid="rotate-error">
          Error: {error}
        </FieldError>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// 3. Recovery phrase

function RecoveryPhraseSection(): React.JSX.Element {
  const [stage, setStage] = useState<'locked' | 'confirm' | 'revealed' | 'error'>('locked');
  const [canary, setCanary] = useState('');
  const [phrase, setPhrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onConfirm(): Promise<void> {
    setError(null);
    if (canary.trim().toUpperCase() !== 'SHOW ME') {
      setError('Type exactly "SHOW ME" to reveal the recovery phrase.');
      return;
    }
    try {
      const p = await exportRecoveryPhrase();
      setPhrase(p);
      setStage('revealed');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  async function copy(): Promise<void> {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Copy failed; select the text manually.');
    }
  }

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-rule">
        <h2 className="font-display font-medium text-h3">Recovery phrase</h2>
        <Badge tone="red">SENSITIVE</Badge>
      </header>

      <p className="text-body-sm text-ink-2 mb-4">
        Your 12-word recovery phrase is the ONLY way to restore this account
        if you lose access to every registered passkey and browser. Write it
        down; store it offline; do not screenshot.
      </p>

      {stage === 'locked' && (
        <Button
          variant="default"
          onClick={() => setStage('confirm')}
          data-testid="reveal-phrase-start-btn"
        >
          Reveal recovery phrase…
        </Button>
      )}

      {stage === 'confirm' && (
        <div className="space-y-3">
          <label className="block font-mono text-kicker uppercase text-muted">
            TYPE <code className="text-ink">SHOW ME</code> TO CONFIRM
          </label>
          <input
            autoFocus
            value={canary}
            onChange={(e) => setCanary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onConfirm();
            }}
            className="bg-paper-2 border border-rule px-3 py-2 font-mono w-full md:w-72"
            data-testid="reveal-phrase-canary-input"
          />
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={() => void onConfirm()}
              data-testid="reveal-phrase-confirm-btn"
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStage('locked');
                setCanary('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage === 'revealed' && phrase && (
        <div className="space-y-4">
          <Code
            className="block whitespace-pre-wrap break-words p-4 bg-paper-2 border border-rule"
            data-testid="recovery-phrase-value"
          >
            {phrase}
          </Code>
          <div className="flex gap-3 items-center">
            <Button
              variant="default"
              size="sm"
              onClick={() => void copy()}
              data-testid="copy-phrase-btn"
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPhrase(null);
                setStage('locked');
                setCanary('');
              }}
              data-testid="hide-phrase-btn"
            >
              Hide
            </Button>
          </div>
        </div>
      )}

      {error && (
        <FieldError className="mt-4" data-testid="recovery-phrase-error">
          {error}
        </FieldError>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// helpers

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function daysUntilGraceExpiry(v1DeprecatedAt: string | null): number | null {
  if (!v1DeprecatedAt) return null;
  const deprecatedMs = Date.parse(v1DeprecatedAt);
  if (Number.isNaN(deprecatedMs)) return null;
  const graceEndMs = deprecatedMs + 90 * 24 * 60 * 60 * 1000;
  const diff = graceEndMs - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function toBase64Url(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
