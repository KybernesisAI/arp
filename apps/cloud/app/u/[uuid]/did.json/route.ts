/**
 * GET /u/<uuid>/did.json — cloud-managed DID document endpoint.
 *
 * Serves the terminal DID document for `did:web:cloud.arp.run:u:<uuid>` principal
 * identities. The tenants table stores the browser-held did:key string as
 * `principal_did` (Phase 8.5 identity model); this route decodes the public
 * key from that string and publishes it under the cloud-managed alias so any
 * representation JWT signed with the user's browser key but issued under
 * `did:web:cloud.arp.run:u:<uuid>` can be resolved and verified by third parties.
 *
 * Phase 9d: during the HKDF v1 → v2 rotation grace window (90 days after
 * `v1_deprecated_at`), BOTH the current and previous keys are published so
 * historical audit-log signatures continue to verify. After day 90, the old
 * columns are cleared fire-and-forget on next read.
 */

import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
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
const GRACE_MS = 90 * 24 * 60 * 60 * 1000;

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
    .select({
      id: tenants.id,
      principalDid: tenants.principalDid,
      principalDidPrevious: tenants.principalDidPrevious,
      v1DeprecatedAt: tenants.v1DeprecatedAt,
    })
    .from(tenants)
    .where(eq(tenants.id, uuid))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const currentPublicKey = decodeDidKeyPublicKey(row.principalDid);
  if (!currentPublicKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const currentMultibase = ed25519RawToMultibase(currentPublicKey);

  // Phase 9d: evaluate rotation grace. If there's a previous DID and the
  // grace window hasn't elapsed, include it as a second verification method.
  // Past the window, clear the columns opportunistically so the doc shrinks
  // back to a single key.
  const nowMs = Date.now();
  let previousMultibase: string | null = null;
  const prevDid = row.principalDidPrevious;
  const deprecatedAt = row.v1DeprecatedAt;
  if (prevDid && deprecatedAt) {
    const elapsed = nowMs - deprecatedAt.getTime();
    if (elapsed <= GRACE_MS) {
      const prevPub = decodeDidKeyPublicKey(prevDid);
      if (prevPub) {
        previousMultibase = ed25519RawToMultibase(prevPub);
      }
    } else {
      // Grace has expired. Fire-and-forget: clear the columns so future
      // reads don't dual-publish. Do not block the response on the write.
      void db
        .update(tenants)
        .set({
          principalDidPrevious: null,
          v1DeprecatedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(tenants.id, uuid))
        .catch(() => {
          // Cleanup is best-effort; failures here must never affect the
          // request path.
        });
    }
  }

  const didSubject = `did:web:cloud.arp.run:u:${uuid}`;
  const keyId = `${didSubject}#key-1`;
  const prevKeyId = `${didSubject}#key-0`;

  const verificationMethod = [
    {
      id: keyId,
      type: 'Ed25519VerificationKey2020',
      controller: didSubject,
      publicKeyMultibase: currentMultibase,
    },
  ];
  if (previousMultibase) {
    verificationMethod.push({
      id: prevKeyId,
      type: 'Ed25519VerificationKey2020',
      controller: didSubject,
      publicKeyMultibase: previousMultibase,
    });
  }

  const authentication: string[] = [keyId];
  const assertionMethod: string[] = [keyId];
  const keyAgreement: string[] = [keyId];
  if (previousMultibase) {
    authentication.push(prevKeyId);
    assertionMethod.push(prevKeyId);
    keyAgreement.push(prevKeyId);
  }

  const didDoc = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: didSubject,
    controller: didSubject,
    verificationMethod,
    authentication,
    assertionMethod,
    keyAgreement,
  };

  return new NextResponse(JSON.stringify(didDoc, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/did+json',
      'cache-control': 'public, max-age=300, must-revalidate',
    },
  });
}
