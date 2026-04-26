/**
 * Audience-side amendment helpers (Phase 12 bidirectional consent).
 *
 * The amendment carries the audience's grants — what the audience
 * permits the issuer's agent to do TO them. It's signed independently
 * from the proposal so the issuer's signature stays valid; the
 * audience commits their grants by signing the amendment's canonical
 * bytes with their principal key.
 *
 * Verification on accept does both:
 *   1. issuer + audience signatures over proposal canonical (existing)
 *   2. audience signature over amendment canonical (new)
 *
 * Effective connection.cedar_policies = proposal.cedar_policies +
 * amendment.cedar_policies. PDP evaluates all of them on each inbound;
 * only the policy matching the principal+action fires, so the two
 * directions cleanly coexist.
 */

import { canonicalAmendmentBytes, payloadFromAmendment } from './canonical.js';
import { signBytes, verifyBytes, type KeyPair } from './signing.js';
import type { AudienceAmendment } from './types.js';
import type { Obligation } from './obligation-schema.js';
import type { DidDocument } from '@kybernesis/arp-spec';
import type { ScopeSelection } from './types.js';

export interface CreateAmendmentInput {
  connection_id: string;
  scope_selections: ScopeSelection[];
  cedar_policies: string[];
  obligations?: Obligation[];
  audienceKey: KeyPair;
}

/** Build + sign an audience amendment with the given key. */
export async function createSignedAmendment(
  input: CreateAmendmentInput,
): Promise<AudienceAmendment> {
  const obligations = input.obligations ?? [];
  const unsigned = {
    connection_id: input.connection_id,
    scope_selections: input.scope_selections,
    cedar_policies: input.cedar_policies,
    obligations,
  };
  const bytes = canonicalAmendmentBytes(unsigned);
  const sig = await signBytes(bytes, input.audienceKey);
  return { ...unsigned, sig };
}

/** Verify an amendment's signature against the audience's DID doc. */
export async function verifyAmendment(
  amendment: AudienceAmendment,
  audienceDidDoc: DidDocument,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bytes = canonicalAmendmentBytes(payloadFromAmendment(amendment));
  return verifyBytes(bytes, amendment.sig, audienceDidDoc);
}
