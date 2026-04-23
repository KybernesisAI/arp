/**
 * Principal key resolution. In production we look up a principal DID in
 * the DID resolution system (did:web/did:key/...). For dev + tests the
 * `ARP_CLOUD_PRINCIPAL_FIXTURES` env var maps principal_did → public key
 * multibase. Falls back to the DID doc if present.
 *
 * Phase 8.5: `did:key:z...` DIDs carry their public key in the DID string
 * itself. `decodeDidKeyPublicKey` does the inline extraction so that the
 * verify route can accept browser-generated principals without any prior
 * registration step.
 *
 * Format:
 *   ARP_CLOUD_PRINCIPAL_FIXTURES="did:key:z6Mk...=z6Mk...;did:web:...=z..."
 */

import { multibaseEd25519ToRaw } from '@kybernesis/arp-transport';

export function publicKeyForPrincipal(did: string): Uint8Array | null {
  const raw = process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] ?? '';
  if (!raw) return null;
  for (const entry of raw.split(';')) {
    const [didKey, mb] = entry.split('=');
    if (!didKey || !mb) continue;
    if (didKey.trim() === did) {
      try {
        return multibaseEd25519ToRaw(mb.trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Decode the 32-byte Ed25519 public key embedded in a `did:key:z...` DID.
 * Returns null if the DID is not a did:key or the multibase payload is not a
 * valid Ed25519 multikey.
 */
export function decodeDidKeyPublicKey(did: string): Uint8Array | null {
  if (!did.startsWith('did:key:')) return null;
  const multibase = did.slice('did:key:'.length);
  if (!multibase.startsWith('z')) return null;
  try {
    return multibaseEd25519ToRaw(multibase);
  } catch {
    return null;
  }
}

export function registerPrincipalForTests(did: string, publicKeyMultibase: string): () => void {
  const prev = process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] ?? '';
  const next = prev ? `${prev};${did}=${publicKeyMultibase}` : `${did}=${publicKeyMultibase}`;
  process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] = next;
  return () => {
    process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] = prev;
  };
}
