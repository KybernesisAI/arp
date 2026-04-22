import { z } from 'zod';
import { DidUriSchema } from './did-document.js';

/**
 * Layer-3 signed envelope: the connection token.
 *
 * Source: ARP-policy-examples.md §3 Layer 3 (excerpt).
 *
 * Wraps one or more compiled Cedar policies, plus obligations the PDP derived
 * from the authoring scope bundle, plus the dual signatures from both sides of
 * the connection.
 */

export const ObligationSchema = z.object({
  type: z.string().min(1).describe('Obligation type (see ARP-policy-examples.md §7)'),
  params: z
    .record(z.string(), z.unknown())
    .describe('Obligation-specific parameters (structured JSON)'),
});

export const ConnectionSignaturesSchema = z
  .record(z.string(), z.string().min(1))
  .refine((sigs) => Object.keys(sigs).length >= 2, {
    message: 'connection token must carry at least 2 signatures (issuer + audience)',
  })
  .describe(
    'Map of signer label → signature (base64url). Both connection parties must sign.'
  );

export const ConnectionTokenSchema = z.object({
  connection_id: z
    .string()
    .regex(/^conn_[A-Za-z0-9_-]{4,}$/, {
      message: 'connection_id must start with "conn_" and have ≥4 body chars',
    }),
  issuer: DidUriSchema.describe('Principal DID who authored the token'),
  subject: DidUriSchema.describe('Agent DID the token runs under'),
  audience: DidUriSchema.describe('Counterparty agent DID'),
  purpose: z.string().min(1).describe('Free-text purpose label'),
  cedar_policies: z
    .array(z.string().min(1))
    .min(1)
    .describe('One or more compiled Cedar policy strings'),
  obligations: z.array(ObligationSchema).default([]),
  scope_catalog_version: z
    .string()
    .describe('Catalog version pinned at pairing time (e.g. "v1")'),
  expires: z
    .string()
    .datetime({ offset: true })
    .describe('Absolute expiry (ISO 8601)'),
  sigs: ConnectionSignaturesSchema,
});

export type Obligation = z.infer<typeof ObligationSchema>;
export type ConnectionSignatures = z.infer<typeof ConnectionSignaturesSchema>;
export type ConnectionToken = z.infer<typeof ConnectionTokenSchema>;
