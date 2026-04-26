/**
 * POST /api/connections/:id/suspend — pause a connection without losing it.
 *
 * Mirrors the revoke route's audit-chain semantics but is reversible:
 *   1. Flip `connections.status` from 'active' → 'suspended' (idempotent
 *      if already suspended).
 *   2. Append a chained audit entry with decision='suspend'.
 *   3. NO entry in `revocations` — that table is reserved for permanent
 *      revocations (a fresh pairing creates a new connection_id; resume
 *      keeps the same one).
 *
 * dispatch.ts rejects any inbound DIDComm against a non-active connection
 * with `connection_${status}`, so the suspend takes effect immediately
 * for both directions. Calling /resume flips it back.
 *
 * Rate-limited: 10/min per tenant.
 */

import { NextResponse } from 'next/server';
import canonicalizeFn from 'canonicalize';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';

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

function makeLocalMsgId(connectionId: string, nowMs: number, kind: string): string {
  return `${kind}-local:${connectionId}:${nowMs}`;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const { tenantDb } = await requireTenantDb();

    const limit = await checkRateLimit({
      bucket: `connection-suspend:tenant:${tenantDb.tenantId}`,
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
    const reason = parsed.data.reason ?? 'owner_suspended';

    const conn = await tenantDb.getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (conn.status === 'revoked') {
      return NextResponse.json(
        { error: 'cannot_suspend_revoked' },
        { status: 409 },
      );
    }
    if (conn.status === 'suspended') {
      return NextResponse.json({
        ok: true,
        alreadySuspended: true,
        suspendedAt: new Date().toISOString(),
        connectionId: id,
      });
    }

    const now = new Date();
    await tenantDb.updateConnectionStatus(id, 'suspended', reason);

    // Append audit entry so the hash chain stays continuous.
    const latest = await tenantDb.latestAudit(conn.agentDid, id);
    const seq = latest ? latest.seq + 1 : 0;
    const prevHash = latest ? latest.selfHash : GENESIS_PREV_HASH;
    const msgId = makeLocalMsgId(id, now.getTime(), 'suspend');
    const base = {
      seq,
      timestamp: now.toISOString(),
      msg_id: msgId,
      decision: 'suspend',
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
        decision: 'suspend',
        obligations: [],
        policiesFired: [],
        timestamp: now.toISOString(),
        reason,
        spendDeltaCents: 0,
      },
      { prevHash, selfHash, seq },
    );

    return NextResponse.json({
      ok: true,
      alreadySuspended: false,
      suspendedAt: now.toISOString(),
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
