/**
 * DID resolver adapter used by the cloud-side pairing verify path.
 *
 * Two branches:
 *   1. did:key → synthesise from the key material in the DID itself.
 *      Terminal; never hits the DB or network.
 *   2. did:web → look up the agent in the cross-tenant `agents` table. When
 *      a cloud-hosted agent is the audience we stored its synthesised
 *      DID document at provision time in `agents.well_known_did`; returning
 *      it here lets pairing verification resolve the audience's principal
 *      binding without a round-trip over HTTP.
 *
 * Out of scope for Phase 10a: verifying signatures against external
 * agent DIDs we do NOT host. Those return `cannot resolve audience agent`
 * and the accept route rejects the invitation. Incoming external pairing
 * via DIDComm lands in a later slice (see 10 gap audit §1 Notes).
 */

import { eq } from 'drizzle-orm';
import type { DidDocument } from '@kybernesis/arp-spec';
import { DidDocumentSchema } from '@kybernesis/arp-spec';
import { didKeyToDidDocument } from '@kybernesis/arp-resolver';
import type { DidResolver } from '@kybernesis/arp-pairing';
import { agents, type CloudDbClient } from '@kybernesis/arp-cloud-db';

export function createPairingResolver(db: CloudDbClient): DidResolver {
  return {
    async resolve(
      did: string,
    ): Promise<{ ok: true; value: DidDocument } | { ok: false; reason: string }> {
      if (did.startsWith('did:key:')) {
        const parsed = didKeyToDidDocument(did);
        if (!parsed.ok) return { ok: false, reason: parsed.error.message };
        return { ok: true, value: parsed.value };
      }
      if (did.startsWith('did:web:')) {
        const rows = await db
          .select({ wellKnownDid: agents.wellKnownDid })
          .from(agents)
          .where(eq(agents.did, did))
          .limit(1);
        const row = rows[0];
        if (!row) {
          return { ok: false, reason: `agent ${did} not hosted on this cloud` };
        }
        const parsed = DidDocumentSchema.safeParse(row.wellKnownDid);
        if (!parsed.success) {
          return {
            ok: false,
            reason: `stored DID document for ${did} failed schema validation`,
          };
        }
        return { ok: true, value: parsed.data };
      }
      return { ok: false, reason: `unsupported DID method for ${did}` };
    },
  };
}
