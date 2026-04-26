/**
 * POST /api/connections/:id/resume — un-suspend a paused connection.
 *
 * Symmetric counterpart to /suspend. Flips `connections.status` from
 * 'suspended' → 'active' and appends a chained audit entry with
 * decision='resume'. Idempotent: resuming an already-active connection
 * is a no-op 200.
 *
 * Cannot resume a revoked connection — revocation is permanent. To
 * re-establish, generate a fresh pairing invitation.
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
      bucket: `connection-resume:tenant:${tenantDb.tenantId}`,
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
    const reason = parsed.data.reason ?? 'owner_resumed';

    const conn = await tenantDb.getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (conn.status === 'revoked') {
      return NextResponse.json(
        { error: 'cannot_resume_revoked' },
        { status: 409 },
      );
    }
    if (conn.status === 'active') {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        connectionId: id,
      });
    }

    const now = new Date();
    await tenantDb.updateConnectionStatus(id, 'active', reason);

    // Append audit entry so the hash chain stays continuous.
    const latest = await tenantDb.latestAudit(conn.agentDid, id);
    const seq = latest ? latest.seq + 1 : 0;
    const prevHash = latest ? latest.selfHash : GENESIS_PREV_HASH;
    const msgId = makeLocalMsgId(id, now.getTime(), 'resume');
    const base = {
      seq,
      timestamp: now.toISOString(),
      msg_id: msgId,
      decision: 'resume',
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
        decision: 'resume',
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
      alreadyActive: false,
      resumedAt: now.toISOString(),
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
