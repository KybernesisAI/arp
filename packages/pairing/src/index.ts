/**
 * @kybernesis/arp-pairing — pairing protocol implementation.
 *
 * Flow:
 *   1. Issuer (principal) runs `createPairingProposal` → compiles scope
 *      selections, signs canonical bytes, returns a `PairingProposal`.
 *   2. Issuer calls `buildInvitationUrl` to serialize it onto a QR / deep link.
 *   3. Audience (counterparty principal) calls `parseInvitationUrl` to decode
 *      it, reviews it (consent UI), then `countersignProposal` to add their
 *      signature and project out a `ConnectionToken`.
 *   4. Either side calls `verifyConnectionToken` / `verifyPairingProposal`
 *      with a DID resolver to validate the dual signatures + expiry.
 */

export { createPairingProposal, type CreatePairingProposalInput } from './create.js';
export { buildInvitationUrl, parseInvitationUrl } from './url.js';
export {
  countersignProposal,
  type CountersignInput,
  type ConnectionTokenWithProposal,
} from './countersign.js';
export {
  verifyConnectionToken,
  verifyPairingProposal,
  type DidResolver,
  type VerifyOptions,
  type VerifyResult,
} from './verify.js';
export {
  canonicalBytes,
  payloadFromProposal,
  payloadFromToken,
  canonicalAmendmentBytes,
  payloadFromAmendment,
  type CanonicalConnectionPayload,
  type CanonicalAudienceAmendmentPayload,
} from './canonical.js';
export {
  createSignedAmendment,
  verifyAmendment,
  type CreateAmendmentInput,
} from './amendment.js';
export { signBytes, verifyBytes, type KeyPair } from './signing.js';
export { newConnectionId, newProposalId } from './id.js';
export {
  PairingProposalSchema,
  ScopeSelectionSchema,
  SignatureEntrySchema,
  AudienceAmendmentSchema,
  type PairingProposal,
  type ScopeSelection,
  type SignatureEntry,
  type AudienceAmendment,
} from './types.js';
