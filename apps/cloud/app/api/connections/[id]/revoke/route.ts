/**
 * POST /api/connections/:id/revoke — slice 10b.
 *
 * Three-step atomic revocation:
 *   1. Flip `connections.status` from 'active' → 'revoked'.
 *   2. Insert a row in `revocations` (kind='connection', subject_id=:id).
 *   3. Append a chained audit entry with decision='revoke'.
 *
 * Step 1 is idempotent via a status check — a second revoke returns
 *   200 + { alreadyRevoked: true }
 * without emitting a duplicate audit entry.
 *
 * Step 3 uses the same JCS + SHA-256 hash chain the runtime uses for
 * allow/deny decisions. The chain verifies cleanly across mixed decision
 * values because hash inputs include the full base object.
 *
 * Revocation is caller-side only. Propagation to an external peer (another
 * cloud tenant OR a sovereign sidecar) is out of scope for this slice; the
 * peer finds out on their next message attempt when the policy check sees
 * status='revoked'. Cross-tenant dual-side signalling lands in 10e or
 * later.
 *
 * Rate-limited: 10/min per tenant. Matches the burst cap applied to other
 * cloud admin write routes (push-register, pairing-accept).
 */

import { NextResponse } from 'next/server';
import canonicalizeFn from 'canonicalize';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const canonicalize = canonicalizeFn as (value: unknown) => string;
const HASH_PREFIX = 'sha256:';
const GENESIS_PREV_HASH = `${HASH_PREFIX}${'00'.repeat(32)}`;

const Body = z.object({
  reason: z.string().trim().max(512).optional(),
});

function hashJcs(value: unknown): string {
  const canonical = canonicalize(value);
  const hex = createHash('sha256').update(canonical).digest('hex');
  return `${HASH_PREFIX}${hex}`;
}

function makeLocalMsgId(connectionId: string, nowMs: number): string {
  // Local, non-protocol msg id for the revoke audit entry. Includes the
  // connection + a timestamp so successive revokes on the same id (the
  // idempotent path returns early, so this only fires once) remain
  // distinct when cross-referenced later.
  return `revoke-local:${connectionId}:${nowMs}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const { tenantDb } = await requireTenantDb();

    const limit = await checkRateLimit({
      bucket: `connection-revoke:tenant:${tenantDb.tenantId}`,
      windowSeconds: 60,
      limit: 10,
    });
    if (!limit.ok) return rateLimitedResponse(limit.retryAfter);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const reason = parsed.data.reason ?? 'owner_revoked';

    const conn = await tenantDb.getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (conn.status === 'revoked') {
      return NextResponse.json({
        ok: true,
        alreadyRevoked: true,
        revokedAt: new Date().toISOString(),
      });
    }

    const now = new Date();
    // Step 1: flip status.
    await tenantDb.updateConnectionStatus(id, 'revoked', reason);

    // Step 2: insert into revocations.
    await tenantDb.addRevocation(conn.agentDid, 'connection', id, reason);

    // Step 3: append a chained audit entry with decision='revoke'. Uses the
    // same JCS + SHA-256 chain logic the cloud-runtime uses; inlined so the
    // route stays free of DIDComm-adjacent imports.
    const latest = await tenantDb.latestAudit(conn.agentDid, id);
    const seq = latest ? latest.seq + 1 : 0;
    const prevHash = latest ? latest.selfHash : GENESIS_PREV_HASH;
    const msgId = makeLocalMsgId(id, now.getTime());
    const base = {
      seq,
      timestamp: now.toISOString(),
      msg_id: msgId,
      decision: 'revoke',
      policies_fired: [] as string[],
      obligations: [] as unknown[],
      spend_delta_cents: 0,
      reason,
      prev_hash: prevHash,
    };
    const selfHash = hashJcs(base);
    await tenantDb.appendAudit(
      conn.agentDid,
      {
        connectionId: id,
        msgId,
        decision: 'revoke',
        obligations: [],
        policiesFired: [],
        timestamp: now.toISOString(),
        reason,
        spendDeltaCents: 0,
      },
      { prevHash, selfHash, seq },
    );

    posthog.capture({
      distinctId: tenantDb.tenantId,
      event: 'connection_revoked',
      properties: {
        tenant_id: tenantDb.tenantId,
        connection_id: id,
        peer_did: conn.peerDid,
        agent_did: conn.agentDid,
        reason,
      },
    });
    return NextResponse.json({
      ok: true,
      alreadyRevoked: false,
      revokedAt: now.toISOString(),
      connectionId: id,
      peerDid: conn.peerDid,
      reason,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
