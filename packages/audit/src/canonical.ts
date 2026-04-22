import canonicalizeFn from 'canonicalize';
import { createHash } from 'node:crypto';
import { HASH_PREFIX } from './types.js';

/**
 * RFC 8785 JCS canonicalization. The `canonicalize` default export is a
 * function but its types don't expose that cleanly — wrap it here so the
 * rest of the package is strictly typed.
 */
const canonicalize = canonicalizeFn as (value: unknown) => string;

export function jcsCanonical(value: unknown): string {
  return canonicalize(value);
}

/** SHA-256 of the JCS canonicalisation, prefixed `sha256:`. */
export function hashJcs(value: unknown): string {
  const canonical = jcsCanonical(value);
  const hex = createHash('sha256').update(canonical).digest('hex');
  return `${HASH_PREFIX}${hex}`;
}
