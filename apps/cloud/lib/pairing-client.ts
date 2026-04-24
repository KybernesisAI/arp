/**
 * Browser-safe pairing primitives for the cloud app.
 *
 * @kybernesis/arp-pairing's signing.ts imports from the root
 * `@kybernesis/arp-transport` entry, which transitively pulls in
 * `better-sqlite3` + node:fs (mailbox + keystore). Turbopack can't bundle
 * those for a client component — see CLAUDE.md §14. The browser subpath
 * (`@kybernesis/arp-transport/browser`) exposes only base64url + multibase
 * helpers, so we re-implement the handful of pairing functions the cloud
 * /pair flow needs on top of that subpath + the `canonicalize` (JCS) lib
 * + @noble/ed25519.
 *
 * Protocol-package isolation: packages/pairing remains untouched
 * (invariant 4 — consume-only for slice 10a). The server-side imports
 * `@kybernesis/arp-pairing` normally; only client components route
 * through this file.
 *
 * The canonical-bytes serialisation + sig layout here mirrors
 * `@kybernesis/arp-pairing::{canonicalBytes, createPairingProposal,
 * countersignProposal}` exactly — verified by the same Zod schema
 * (`PairingProposalSchema`) parsing the output on both sides.
 */

import canonicalizeFn from 'canonicalize';
import * as ed25519 from '@noble/ed25519';
import { base64urlEncode } from '@kybernesis/arp-transport/browser';
import type {
  PairingProposal,
  ScopeSelection,
  SignatureEntry,
} from '@kybernesis/arp-pairing';

const canonicalize = canonicalizeFn as (value: unknown) => string;

interface UnsignedProposal {
  proposal_id: string;
  connection_id: string;
  issuer: string;
  subject: string;
  audience: string;
  purpose: string;
  scope_selections: ScopeSelection[];
  cedar_policies: string[];
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  scope_catalog_version: string;
  required_vcs: string[];
  expires_at: string;
  created_at: string;
}

export interface CompiledBundle {
  policies: string[];
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
}

export interface KeyPair {
  privateKey: Uint8Array;
  kid: string;
}

/**
 * Build a signed PairingProposal in the browser. Mirrors
 * `@kybernesis/arp-pairing::createPairingProposal` but consumes a
 * pre-compiled cedar bundle (the server does the bundle compilation in
 * /api/pairing/scope-catalog → client posts the template id list and
 * receives back both the ScopeTemplates AND the compiled bundle).
 */
export async function createSignedProposalClient(args: {
  issuer: string;
  subject: string;
  audience: string;
  purpose: string;
  scopeSelections: ScopeSelection[];
  compiled: CompiledBundle;
  expiresAt: string;
  scopeCatalogVersion: string;
  requiredVcs?: string[];
  issuerKey: KeyPair;
  now?: () => Date;
  ids?: { proposalId?: string; connectionId?: string };
}): Promise<PairingProposal> {
  const now = args.now ?? (() => new Date());
  const proposalId = args.ids?.proposalId ?? newProposalId();
  const connectionId = args.ids?.connectionId ?? newConnectionId();
  const unsigned: UnsignedProposal = {
    proposal_id: proposalId,
    connection_id: connectionId,
    issuer: args.issuer,
    subject: args.subject,
    audience: args.audience,
    purpose: args.purpose,
    scope_selections: args.scopeSelections.map((s) => ({
      id: s.id,
      params: s.params ?? {},
    })),
    cedar_policies: args.compiled.policies,
    obligations: args.compiled.obligations,
    scope_catalog_version: args.scopeCatalogVersion,
    required_vcs: args.requiredVcs ?? [],
    expires_at: args.expiresAt,
    created_at: now().toISOString(),
  };
  const bytes = canonicalBytesOf(unsigned);
  const sig = await signBytesClient(bytes, args.issuerKey);
  const proposal: PairingProposal = {
    ...unsigned,
    sigs: { [args.issuer]: sig },
  };
  return proposal;
}

/**
 * Add the audience's signature to an already-issued proposal. Mirrors
 * `@kybernesis/arp-pairing::countersignProposal`.
 *
 * Phase 10a does NOT re-compile the cedar bundle client-side — the server
 * re-compiles on accept and rejects any forgery via the
 * `cedar_policy_mismatch` guard in /api/pairing/accept. So this helper
 * only signs the canonical bytes + attaches the sig.
 */
export async function countersignProposalClient(args: {
  proposal: PairingProposal;
  counterpartyKey: KeyPair;
  counterpartyDid: string;
}): Promise<PairingProposal> {
  const bytes = canonicalBytesOf(args.proposal);
  const sig = await signBytesClient(bytes, args.counterpartyKey);
  const sigs: Record<string, SignatureEntry> = {
    ...args.proposal.sigs,
    [args.counterpartyDid]: sig,
  };
  return { ...args.proposal, sigs };
}

function canonicalBytesOf(
  proposal: UnsignedProposal | PairingProposal,
): Uint8Array {
  // Mirrors packages/pairing/src/canonical.ts::payloadFromProposal. The
  // signing payload excludes proposal_id + scope_selections + created_at
  // + required_vcs — those are proposal-only metadata.
  const payload = {
    connection_id: proposal.connection_id,
    issuer: proposal.issuer,
    subject: proposal.subject,
    audience: proposal.audience,
    purpose: proposal.purpose,
    cedar_policies: proposal.cedar_policies,
    obligations: proposal.obligations,
    scope_catalog_version: proposal.scope_catalog_version,
    expires: proposal.expires_at,
  };
  const json = canonicalize(payload);
  return new TextEncoder().encode(json);
}

async function signBytesClient(
  bytes: Uint8Array,
  key: KeyPair,
): Promise<SignatureEntry> {
  if (key.privateKey.length !== 32) {
    throw new Error('Ed25519 private key must be 32 raw bytes');
  }
  const sig = await ed25519.signAsync(bytes, key.privateKey);
  return { alg: 'EdDSA', kid: key.kid, value: base64urlEncode(sig) };
}

function newProposalId(): string {
  return `prop_${rand(12)}`;
}

function newConnectionId(): string {
  return `conn_${rand(12)}`;
}

function rand(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, len + 4);
}
