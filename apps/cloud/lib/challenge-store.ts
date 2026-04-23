/**
 * In-process challenge store for principal-DID sign-in. Mirrors the owner
 * app; in production the cloud moves this to Redis or a DB-backed
 * nonce table — flagged as deployment-prep work.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface Record {
  principalDid: string;
  issuedAt: number;
}

const store = new Map<string, Record>();

export function issueChallenge(principalDid: string, nonce: string): void {
  cleanup();
  store.set(nonce, { principalDid, issuedAt: Date.now() });
}

export function consumeChallenge(nonce: string): Record | null {
  cleanup();
  const record = store.get(nonce);
  if (!record) return null;
  store.delete(nonce);
  return record;
}

function cleanup(): void {
  const cutoff = Date.now() - CHALLENGE_TTL_MS;
  for (const [nonce, r] of store.entries()) {
    if (r.issuedAt < cutoff) store.delete(nonce);
  }
}
