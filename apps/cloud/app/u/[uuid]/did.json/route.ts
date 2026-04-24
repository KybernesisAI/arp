/**
 * GET /u/<uuid>/did.json — cloud-managed DID document endpoint.
 *
 * Serves the terminal DID document for `did:web:arp.cloud:u:<uuid>` principal
 * identities. The tenants table stores the browser-held did:key string as
 * `principal_did` (Phase 8.5 identity model); this route decodes the public
 * key from that string and publishes it under the cloud-managed alias so any
 * representation JWT signed with the user's browser key but issued under
 * `did:web:arp.cloud:u:<uuid>` can be resolved and verified by third parties.
 *
 * Cache headers intentionally short (5 min) so a future key rotation
 * propagates quickly. Phase-9 identity rotation (HKDF migration, slice 9c)
 * will dual-publish old + new keys during the grace window.
 */

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { tenants } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { decodeDidKeyPublicKey } from '@/lib/principal-keys';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitedResponse,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
): Promise<Response> {
  // Rate-limit: 120/min per IP. Public-read endpoint; Vercel's edge cache
  // absorbs most legitimate traffic (cache-control: public, max-age=300).
  // This protects the origin from aggressive uncached traffic.
  const ip = clientIpFromRequest(req);
  const limitResult = await checkRateLimit({
    bucket: `user-did:ip:${ip}`,
    windowSeconds: 60,
    limit: 120,
  });
  if (!limitResult.ok) {
    return rateLimitedResponse(limitResult.retryAfter);
  }

  const { uuid } = await ctx.params;
  if (!UUID_REGEX.test(uuid)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const db = await getDb();
  const rows = await db
    .select({ id: tenants.id, principalDid: tenants.principalDid })
    .from(tenants)
    .where(eq(tenants.id, uuid))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // The tenant's underlying principal key is encoded inside the did:key DID.
  // Non-did:key tenants (sidecar migrations) don't round-trip to a terminal
  // did:web alias — surface a 404 rather than synthesising a doc with no
  // verification material.
  const publicKey = decodeDidKeyPublicKey(row.principalDid);
  if (!publicKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const publicKeyMultibase = ed25519RawToMultibase(publicKey);

  const didSubject = `did:web:arp.cloud:u:${uuid}`;
  const keyId = `${didSubject}#key-1`;
  const didDoc = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: didSubject,
    controller: didSubject,
    verificationMethod: [
      {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: didSubject,
        publicKeyMultibase,
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
  };

  return new NextResponse(JSON.stringify(didDoc, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/did+json',
      'cache-control': 'public, max-age=300, must-revalidate',
    },
  });
}
