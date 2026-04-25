'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  isPasskeySupported,
  registerPasskey,
} from '@/lib/principal-key-passkey';

interface CredentialRow {
  id: string;
  credential_id: string;
  nickname: string | null;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
}

/**
 * Settings-page passkey panel. Lists registered credentials, allows
 * inline rename + delete (last-credential guard surfaced via 409 from
 * the sidecar), and lets the user register a new passkey from this
 * device. Mirrors the cloud `PasskeysSection` UX.
 */
export function PasskeySection(): React.JSX.Element {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/auth/webauthn/credentials');
      if (!res.ok) throw new Error(`list_failed_${res.status}`);
      const body = (await res.json()) as { credentials: CredentialRow[] };
      setRows(body.credentials);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isPasskeySupported();
      if (cancelled) return;
      setSupported(ok);
      if (ok) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const onRegister = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const startRename = useCallback((row: CredentialRow) => {
    setRenaming(row.id);
    setRenameDraft(row.nickname ?? '');
  }, []);

  const commitRename = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const trimmed = renameDraft.trim();
        const res = await fetch(`/api/auth/webauthn/credentials/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nickname: trimmed.length > 0 ? trimmed : null }),
        });
        if (!res.ok) throw new Error(`rename_failed_${res.status}`);
        setRenaming(null);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [renameDraft, refresh],
  );

  const onDelete = useCallback(
    async (row: CredentialRow) => {
      const label = row.nickname ?? row.credential_id.slice(0, 12);
      if (!window.confirm(`Remove passkey ${label}?`)) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/auth/webauthn/credentials/${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
        });
        if (res.status === 409) {
          throw new Error('Cannot remove your only passkey. Register another first.');
        }
        if (!res.ok) throw new Error(`delete_failed_${res.status}`);
        await refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  if (!supported) {
    return (
      <p className="text-xs text-arp-muted">
        Passkeys aren&apos;t available in this browser. You can still sign in
        with your did:key recovery phrase.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-xs text-arp-muted">No passkeys registered yet.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                {renaming === row.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      autoFocus
                      data-testid={`passkey-rename-input-${row.id}`}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void commitRename(row.id)}
                      data-testid={`passkey-rename-save-${row.id}`}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="font-semibold text-ink">
                      {row.nickname ?? `passkey · ${row.credential_id.slice(0, 12)}…`}
                    </div>
                    <div className="text-arp-muted">
                      added {new Date(row.created_at).toLocaleDateString()}
                      {row.last_used_at &&
                        ` · last used ${new Date(row.last_used_at).toLocaleDateString()}`}
                    </div>
                  </>
                )}
              </div>
              {renaming !== row.id && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => startRename(row)}
                    data-testid={`passkey-rename-${row.id}`}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void onDelete(row)}
                    disabled={busy}
                    data-testid={`passkey-delete-${row.id}`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void onRegister()}
        disabled={busy}
        data-testid="passkey-register-btn"
      >
        {busy ? 'Working…' : 'Add a passkey'}
      </button>
      {error && (
        <p className="text-xs text-arp-danger" data-testid="passkey-error">
          {error}
        </p>
      )}
    </div>
  );
}
