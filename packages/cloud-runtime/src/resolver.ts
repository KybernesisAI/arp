/**
 * Cloud-aware peer resolver.
 *
 * Cloud-managed agents (provisioned via cloud.arp.run) have their public
 * keys stored in this server's own `agents` table — and their `.agent`
 * hostnames typically don't resolve via public DNS, so the standard
 * did:web HTTPS resolver can't reach their `/.well-known/did.json`.
 *
 * This resolver checks the local `agents` table first. On miss, it
 * falls back to whatever resolver the caller passed in (production:
 * `createResolver().resolveDidWeb`, which goes out to public DNS for
 * non-cloud peers).
 */

import { eq } from 'drizzle-orm';
import { agents, type CloudDbClient } from '@kybernesis/arp-cloud-db';
import type { PeerResolver } from './dispatch.js';

export function createCloudAwareResolver(
  db: CloudDbClient,
  fallback: PeerResolver,
): PeerResolver {
  return {
    async resolveDid(did) {
      try {
        const rows = await db
          .select({ wellKnownDid: agents.wellKnownDid })
          .from(agents)
          .where(eq(agents.did, did))
          .limit(1);
        const row = rows[0];
        if (row?.wellKnownDid) {
          return row.wellKnownDid as Awaited<ReturnType<PeerResolver['resolveDid']>>;
        }
      } catch {
        // fall through to public did:web
      }
      return fallback.resolveDid(did);
    },
  };
}
