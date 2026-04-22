import {
  RevocationsSchema,
  type Revocations,
  type RevocationEntry,
  type DidUri,
} from '@kybernesis/arp-spec';
import { validateOrThrow } from './util.js';

export interface BuildRevocationsInput {
  /** Issuer DID (principal). */
  issuer: DidUri;
  /** ISO 8601 timestamp. Defaults to now. */
  updatedAt?: string;
  /** Revocation entries. Defaults to empty. */
  revocations?: readonly RevocationEntry[];
  /** Signature over the JCS canonicalization of the unsigned document. */
  signature: {
    kid: string;
    /** Base64url-encoded signature bytes. */
    value: string;
  };
}

export function buildRevocations(input: BuildRevocationsInput): Revocations {
  const doc = {
    issuer: input.issuer,
    updated_at: input.updatedAt ?? new Date().toISOString(),
    revocations: input.revocations ? [...input.revocations] : [],
    signature: {
      alg: 'EdDSA' as const,
      kid: input.signature.kid,
      value: input.signature.value,
    },
  };

  return validateOrThrow('buildRevocations', RevocationsSchema, doc);
}
