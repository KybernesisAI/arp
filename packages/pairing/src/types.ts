import { z } from 'zod';
import { DID_URI_REGEX } from '@kybernesis/arp-spec';
import { ObligationSchema } from './obligation-schema.js';

/**
 * A single scope selection — one entry in a pairing proposal. `params` carries
 * the user-supplied values for the scope's declared parameters (merged with
 * any defaults). These are what the audience re-compiles at countersign time
 * and what the consent UI surfaces in plain English.
 */
export const ScopeSelectionSchema = z.object({
  id: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type ScopeSelection = z.infer<typeof ScopeSelectionSchema>;

/** One signature entry on the proposal/token. */
export const SignatureEntrySchema = z.object({
  /** base64url raw 64-byte Ed25519 signature over canonical bytes. */
  value: z.string().min(1),
  /** The DID#fragment identifying the verificationMethod that signed. */
  kid: z.string().min(1),
  /** Always EdDSA in v0. */
  alg: z.literal('EdDSA'),
});

export type SignatureEntry = z.infer<typeof SignatureEntrySchema>;

export const DidUriSchema = z.string().regex(DID_URI_REGEX);

/**
 * PairingProposal — the wire artifact shared out-of-band (QR, deep link,
 * pasted URL). Once both principals sign, the same JSON can be projected
 * into a ConnectionToken (see `toConnectionToken`).
 *
 * Canonical bytes for signing = JCS(proposal with `sigs` removed).
 */
export const PairingProposalSchema = z.object({
  proposal_id: z
    .string()
    .regex(/^prop_[A-Za-z0-9_-]{8,}$/, {
      message: 'proposal_id must start with "prop_" and have ≥8 body chars',
    }),
  connection_id: z
    .string()
    .regex(/^conn_[A-Za-z0-9_-]{4,}$/, {
      message: 'connection_id must start with "conn_" and have ≥4 body chars',
    }),
  issuer: DidUriSchema.describe('Principal DID authoring the proposal'),
  subject: DidUriSchema.describe('Agent DID the token runs under (issuer side)'),
  audience: DidUriSchema.describe('Counterparty agent DID'),
  purpose: z.string().min(1),
  scope_selections: z.array(ScopeSelectionSchema).min(1),
  cedar_policies: z
    .array(z.string().min(1))
    .min(1)
    .describe('Compiled by the issuer; audience re-compiles to verify'),
  obligations: z.array(ObligationSchema).default([]),
  scope_catalog_version: z.string().min(1),
  required_vcs: z.array(z.string()).default([]),
  expires_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
  /**
   * When set, this proposal replaces the connection at this id. The
   * acceptor's /api/pairing/accept transitions the old row to
   * `superseded` and the new row inherits its place. Used by the
   * connection-edit / re-countersign flow (Phase 4 Task 7) — issuer
   * mutates scopes/obligations, signs a fresh proposal carrying the
   * old connection_id here, peer reviews + countersigns to commit.
   * The new proposal MUST have a different connection_id from the one
   * it replaces (otherwise both would address the same row).
   */
  replaces: z
    .string()
    .regex(/^conn_[A-Za-z0-9_-]{4,}$/, {
      message: 'replaces must be a connection_id of the form conn_…',
    })
    .optional(),
  /**
   * Signer-label → signature map. Labels are principal DIDs so verification
   * can route directly to the correct DID doc. At invitation time only the
   * issuer entry is present; after countersign both are.
   */
  sigs: z.record(z.string().min(1), SignatureEntrySchema),
});

export type PairingProposal = z.infer<typeof PairingProposalSchema>;
