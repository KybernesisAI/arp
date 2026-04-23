/**
 * In-process challenge store. Nonces minted by `/api/auth/challenge` live
 * here until they're consumed by `/api/auth/verify` or expire.
 *
 * A single-process Next.js dev server (and the sidecar-bundled prod server)
 * can get away with in-memory state — each node owns one sidecar. Phase 7
 * Cloud replaces this with a Redis-backed store.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface ChallengeRecord {
  principalDid: string;
  issuedAt: number;
}

const store = new Map<string, ChallengeRecord>();

export function issueChallenge(principalDid: string, nonce: string): void {
  cleanup();
  store.set(nonce, { principalDid, issuedAt: Date.now() });
}

export function consumeChallenge(nonce: string): ChallengeRecord | null {
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
