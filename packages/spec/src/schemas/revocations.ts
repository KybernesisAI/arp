import { z } from 'zod';
import { DidUriSchema } from './did-document.js';

/**
 * Revocation list served at `{owner-subdomain}/revocations.json`.
 *
 * Source: ARP-tld-integration-spec-v2.md §6.5.
 *
 * The `signature` field covers the JCS canonicalization of the document with
 * `signature` omitted. Verifiers reconstruct that exact bytes before verifying.
 */

export const ConnectionRevocationSchema = z.object({
  type: z.literal('connection'),
  id: z.string().min(1).describe('Connection ID (e.g. "conn_7a3f...")'),
  revoked_at: z.string().datetime({ offset: true }),
  reason: z
    .string()
    .optional()
    .describe('Machine-readable reason code (e.g. "user_requested")'),
});

export const KeyRevocationSchema = z.object({
  type: z.literal('key'),
  fingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{8,}$/i, {
      message: 'must be "sha256:<hex>" (>= 8 hex chars)',
    })
    .describe('SHA-256 of the public key'),
  revoked_at: z.string().datetime({ offset: true }),
  reason: z.string().optional(),
});

export const RevocationEntrySchema = z.discriminatedUnion('type', [
  ConnectionRevocationSchema,
  KeyRevocationSchema,
]);

export const RevocationSignatureSchema = z.object({
  alg: z.literal('EdDSA'),
  kid: z
    .string()
    .min(1)
    .describe('Signing key reference (e.g. "did:key:z6Mk…#key-1")'),
  value: z.string().min(1).describe('Base64url-encoded signature bytes'),
});

export const RevocationsSchema = z.object({
  issuer: DidUriSchema.describe('Principal DID issuing the list'),
  updated_at: z.string().datetime({ offset: true }),
  revocations: z.array(RevocationEntrySchema),
  signature: RevocationSignatureSchema,
});

export type ConnectionRevocation = z.infer<typeof ConnectionRevocationSchema>;
export type KeyRevocation = z.infer<typeof KeyRevocationSchema>;
export type RevocationEntry = z.infer<typeof RevocationEntrySchema>;
export type RevocationSignature = z.infer<typeof RevocationSignatureSchema>;
export type Revocations = z.infer<typeof RevocationsSchema>;
