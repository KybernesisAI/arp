'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  principalKeyVersion,
  rotateToV2,
  type KeyVersion,
} from '@/lib/principal-key-browser';

interface IdentityState {
  principal_did: string;
  principal_public_key_multibase: string;
  previous_principal_did: string | null;
  previous_principal_public_key_multibase: string | null;
  previous_deprecated_at: string | null;
}

/**
 * Settings → Keys panel. Two flows in one card:
 *
 * 1. Agent signing-key rotation (the legacy /admin/keys/rotate path,
 *    still 501 in v0 — kept so the operator gets a visible "restart
 *    required" hint).
 * 2. Principal HKDF v1 → v2 rotation (Phase 10/10d). Mirrors the cloud
 *    rotation flow: derive the new key in-browser from the existing v1
 *    entropy, post the new DID + multibase to `/api/keys/rotate-v2`, and
 *    let the sidecar dual-publish the previous verification method during
 *    the 90-day grace.
 */
export function KeysPanel({ agentDid }: { agentDid: string }) {
  const [legacyResponse, setLegacyResponse] = useState<string | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);

  const [identity, setIdentity] = useState<IdentityState | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [keyVersion, setKeyVersion] = useState<KeyVersion | null>(null);
  const [rotateBusy, setRotateBusy] = useState(false);
  const [rotateResult, setRotateResult] = useState<string | null>(null);

  const refreshIdentity = useCallback(async () => {
    try {
      const res = await fetch('/api/keys/identity');
      if (res.status === 502) {
        // Sidecar feature-gated off — surface a soft notice.
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        const reason = body.reason ?? '';
        if (reason.includes('rotation_disabled')) {
          setIdentity(null);
          setIdentityError(
            'Identity rotation requires a sidecar with the WebAuthn / auth store enabled.',
          );
          return;
        }
      }
      if (!res.ok) {
        setIdentity(null);
        setIdentityError(`identity_fetch_failed_${res.status}`);
        return;
      }
      const body = (await res.json()) as IdentityState;
      setIdentity(body);
      setIdentityError(null);
    } catch (err) {
      setIdentityError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshIdentity();
    void principalKeyVersion().then(setKeyVersion).catch(() => setKeyVersion(null));
  }, [refreshIdentity]);

  const rotateLegacy = useCallback(async () => {
    setLegacyBusy(true);
    try {
      const res = await fetch('/api/keys/rotate', { method: 'POST' });
      const body = await res.text();
      setLegacyResponse(`${res.status}: ${body}`);
    } finally {
      setLegacyBusy(false);
    }
  }, []);

  const rotatePrincipal = useCallback(async () => {
    setRotateBusy(true);
    setRotateResult(null);
    try {
      const result = await rotateToV2();
      const res = await fetch('/api/keys/rotate-v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          new_principal_did: result.newDid,
          new_public_key_multibase: result.newPublicKeyMultibase,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((body.reason as string) ?? `rotate_failed_${res.status}`);
      }
      setRotateResult(
        `Rotated. New DID: ${result.newDid}. Previous deprecated at ${
          (body['previous_deprecated_at'] as string | undefined) ?? 'n/a'
        }.`,
      );
      setKeyVersion('v2');
      await refreshIdentity();
    } catch (err) {
      setRotateResult((err as Error).message);
    } finally {
      setRotateBusy(false);
    }
  }, [refreshIdentity]);

  return (
    <div className="space-y-4">
      <section className="card max-w-xl space-y-3 text-sm">
        <h3 className="font-semibold">Principal identity (HKDF v1 → v2)</h3>
        {identity ? (
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="label">Current principal DID</dt>
              <dd className="break-all">
                <code>{identity.principal_did}</code>
              </dd>
            </div>
            <div>
              <dt className="label">Browser key version</dt>
              <dd>{keyVersion ?? 'unknown'}</dd>
            </div>
            {identity.previous_principal_did && (
              <>
                <div>
                  <dt className="label">Previous DID (in grace)</dt>
                  <dd className="break-all">
                    <code>{identity.previous_principal_did}</code>
                  </dd>
                </div>
                <div>
                  <dt className="label">Previous deprecated at</dt>
                  <dd>{identity.previous_deprecated_at ?? '—'}</dd>
                </div>
              </>
            )}
          </dl>
        ) : (
          <p className="text-arp-muted">{identityError ?? 'Loading identity…'}</p>
        )}
        {keyVersion === 'v1' ? (
          <p className="text-arp-muted">
            Rotation derives a fresh v2 key from your existing recovery phrase
            and tells the sidecar to publish both DIDs in the well-known DID
            doc for 90 days. Your audit history stays verifiable; new
            signatures use the v2 key.
          </p>
        ) : keyVersion === 'v2' ? (
          <p className="text-arp-muted">
            You&apos;re already on v2. No further rotation is required.
          </p>
        ) : (
          <p className="text-arp-muted">No browser-stored principal key.</p>
        )}
        {keyVersion === 'v1' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={rotatePrincipal}
            disabled={rotateBusy}
            data-testid="rotate-v2-btn"
          >
            {rotateBusy ? 'Rotating…' : 'Rotate to v2'}
          </button>
        )}
        {rotateResult && (
          <pre
            className="whitespace-pre-wrap rounded bg-arp-bg p-2 text-xs"
            data-testid="rotate-v2-result"
          >
            {rotateResult}
          </pre>
        )}
      </section>

      <section className="card max-w-xl space-y-3 text-sm">
        <h3 className="font-semibold">Agent signing key</h3>
        <p className="text-arp-muted">
          Rotates the agent signing key for <code>{agentDid}</code>. v0 returns
          <code> 501 Not Implemented</code> and expects the operator to restart
          the runtime with a fresh keystore path.
        </p>
        <button
          type="button"
          className="btn"
          onClick={rotateLegacy}
          disabled={legacyBusy}
          data-testid="rotate-btn"
        >
          {legacyBusy ? 'Rotating…' : 'Trigger rotation'}
        </button>
        {legacyResponse && (
          <pre
            className="whitespace-pre-wrap rounded bg-arp-bg p-2 text-xs"
            data-testid="rotate-response"
          >
            {legacyResponse}
          </pre>
        )}
      </section>
    </div>
  );
}
