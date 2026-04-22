/**
 * Deterministic pseudo-random helpers for property-based tests.
 *
 * We don't pull in fast-check for Phase 1 — the schemas are tightly scoped
 * and a small seeded generator + 10–20 samples per suite covers the space
 * without adding a dep.
 */

export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomLabel(rng: () => number, minLen = 3, maxLen = 12): string {
  const len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    const idx = Math.floor(rng() * letters.length);
    out += letters[idx];
  }
  return out;
}

export function randomDidWeb(rng: () => number, tld = 'agent'): string {
  return `did:web:${randomLabel(rng)}.${tld}`;
}

/**
 * Produces a z-prefixed base58btc string long enough to satisfy the multibase
 * regex in `@kybernesis/arp-spec`. Content is not a real key — these tests
 * validate shape only.
 */
export function randomMultibaseKey(rng: () => number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const len = 44;
  let out = 'z';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return out;
}

export function randomHttps(rng: () => number, path: string): string {
  return `https://${randomLabel(rng)}.${randomLabel(rng)}.agent${path}`;
}
