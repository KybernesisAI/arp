import type { ConnectionToken, DidDocument } from '@kybernesis/arp-spec';
import {
  canonicalBytes,
  payloadFromProposal,
  payloadFromToken,
} from './canonical.js';
import { verifyBytes } from './signing.js';
import type { PairingProposal, SignatureEntry } from './types.js';

/**
 * Narrow DID-resolver interface consumed by the pairing verifier. Callers
 * can pass `@kybernesis/arp-resolver`'s `Resolver` via a thin adapter, or a
 * purpose-built in-memory resolver for tests.
 */
export interface DidResolver {
  resolve(
    did: string,
  ): Promise<
    { ok: true; value: DidDocument } | { ok: false; reason: string }
  >;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export interface VerifyOptions {
  resolver: DidResolver;
  /** Clock override (ms since epoch). Default `Date.now()`. */
  now?: () => number;
  /** Skip the expiry check — useful when verifying archival tokens. */
  allowExpired?: boolean;
}

/**
 * Verify a ConnectionToken end-to-end:
 * - expiry has not passed (unless `allowExpired`)
 * - at least two sigs
 * - issuer principal key signed the canonical bytes
 * - audience's agent DID doc points to a principal whose key signed the canonical bytes
 *
 * Canonical bytes = JCS of the token's connection-payload (the nine fields
 * excluding `sigs`). The same canonicalization is used for proposals, so a
 * proposal's sigs carry across verbatim into the token's sigs.
 */
export async function verifyConnectionToken(
  token: ConnectionToken,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  if (!opts.allowExpired) {
    const now = opts.now ?? (() => Date.now());
    const exp = Date.parse(token.expires);
    if (Number.isFinite(exp) && exp <= now()) {
      return { ok: false, reason: 'token expired' };
    }
  }
  if (Object.keys(token.sigs).length < 2) {
    return { ok: false, reason: 'token must carry ≥2 signatures' };
  }

  const bytes = canonicalBytes(payloadFromToken(token));
  return verifySigMap(
    token.sigs,
    bytes,
    token.audience,
    token.issuer,
    opts.resolver,
  );
}

/**
 * Verify a dual-signed PairingProposal (both issuer + audience sigs present).
 */
export async function verifyPairingProposal(
  proposal: PairingProposal,
  opts: VerifyOptions,
): Promise<VerifyResult> {
  if (!opts.allowExpired) {
    const now = opts.now ?? (() => Date.now());
    const exp = Date.parse(proposal.expires_at);
    if (Number.isFinite(exp) && exp <= now()) {
      return { ok: false, reason: 'proposal expired' };
    }
  }
  const bytes = canonicalBytes(payloadFromProposal(proposal));
  return verifySigMap(
    proposal.sigs,
    bytes,
    proposal.audience,
    proposal.issuer,
    opts.resolver,
  );
}

async function verifySigMap(
  sigs: Record<string, string | SignatureEntry>,
  bytes: Uint8Array,
  audienceAgentDid: string,
  issuerPrincipalDid: string,
  resolver: DidResolver,
): Promise<VerifyResult> {
  const audienceAgentDoc = await resolver.resolve(audienceAgentDid);
  if (!audienceAgentDoc.ok) {
    return {
      ok: false,
      reason: `cannot resolve audience agent: ${audienceAgentDoc.reason}`,
    };
  }
  // Agent documents (did:web) carry a principal binding; did:key documents
  // do not. Connection tokens can only be issued for agents, so a missing
  // principal is a configuration error (not a did:key audience).
  const audiencePrincipal = audienceAgentDoc.value.principal;
  if (!audiencePrincipal) {
    return {
      ok: false,
      reason: `audience agent ${audienceAgentDid} has no principal binding`,
    };
  }
  const audiencePrincipalDid = audiencePrincipal.did;

  const required = [issuerPrincipalDid, audiencePrincipalDid];

  for (const signerDid of required) {
    const raw = sigs[signerDid];
    if (raw === undefined) {
      return { ok: false, reason: `missing signature from ${signerDid}` };
    }
    const { entry, matchKid } = normalize(raw);
    const doc = await resolver.resolve(signerDid);
    if (!doc.ok) {
      return {
        ok: false,
        reason: `cannot resolve signer ${signerDid}: ${doc.reason}`,
      };
    }
    const verdict = await verifyBytes(bytes, entry, doc.value, { matchKid });
    if (!verdict.ok) {
      return { ok: false, reason: `${signerDid}: ${verdict.reason}` };
    }
  }
  return { ok: true };
}

/**
 * Coerce either bare-base64url strings (ConnectionToken shape) or full
 * SignatureEntry objects (PairingProposal shape) into a SignatureEntry plus
 * a flag indicating whether kid matching should be strict.
 */
function normalize(
  raw: string | SignatureEntry,
): { entry: SignatureEntry; matchKid: boolean } {
  if (typeof raw === 'string') {
    // The ConnectionToken wire format stores only the sig value. We have no
    // kid to match against, so the byte-verifier must try every VM in the
    // DID doc.
    return {
      entry: { alg: 'EdDSA', kid: '', value: raw },
      matchKid: false,
    };
  }
  return { entry: raw, matchKid: true };
}
