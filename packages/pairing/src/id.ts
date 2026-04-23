import { randomBytes } from 'node:crypto';

/**
 * Base64url-without-padding encoding over a fresh byte sequence — used to
 * mint proposal and connection identifiers.
 */
function urlSafe(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** `prop_<10 chars>` — 60-bit random body. */
export function newProposalId(): string {
  return `prop_${urlSafe(8)}`;
}

/** `conn_<10 chars>` — 60-bit random body. */
export function newConnectionId(): string {
  return `conn_${urlSafe(8)}`;
}
