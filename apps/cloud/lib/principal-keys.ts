/**
 * Principal key resolution. In production we look up a principal DID in
 * the DID resolution system (did:web/did:key/...). For dev + tests the
 * `ARP_CLOUD_PRINCIPAL_FIXTURES` env var maps principal_did → public key
 * multibase. Falls back to the DID doc if present.
 *
 * Format:
 *   ARP_CLOUD_PRINCIPAL_FIXTURES="did:web:ian.self.xyz=zABC;did:web:nick.self.xyz=zDEF"
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

export function registerPrincipalForTests(did: string, publicKeyMultibase: string): () => void {
  const prev = process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] ?? '';
  const next = prev ? `${prev};${did}=${publicKeyMultibase}` : `${did}=${publicKeyMultibase}`;
  process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] = next;
  return () => {
    process.env['ARP_CLOUD_PRINCIPAL_FIXTURES'] = prev;
  };
}
