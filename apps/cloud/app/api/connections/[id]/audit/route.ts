/**
 * GET /api/connections/:id/audit — paginated audit entries for a connection
 * (slice 10b).
 *
 * Query params:
 *   - direction (inbound | outbound | all, default all)
 *   - decision  (allow | deny | revoke | all, default all)
 *   - from      ISO-8601 timestamp (inclusive lower bound on entry timestamp)
 *   - to        ISO-8601 timestamp (exclusive upper bound)
 *   - cursor    opaque base64url of { s: seq, i: id } — previous tail marker
 *   - limit     default 25, clamped to [1, 100]
 *
 * Direction derivation: `audit_entries` intentionally doesn't carry a
 * direction column (keeps the hash chain compact + protocol-frozen). We
 * derive direction per-entry by looking up the matching `messages` row on
 * (tenant_id, agent_did, connection_id, msg_id). Entries without a
 * corresponding message row (revoke entries synthesise a local msg_id)
 * surface as direction `system` and are treated as outbound-local when a
 * client filters on direction=outbound.
 *
 * Tenant-scoped via `tenantDb.getConnection` (same-404 for other-tenant ids)
 * before any audit read, so the route never reveals the existence of
 * another tenant's connection.
 */

import { NextResponse } from 'next/server';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  not,
  or,
  type SQL,
} from 'drizzle-orm';
import { auditEntries, messages } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISION_CHOICES = new Set<string>(['allow', 'deny', 'revoke', 'all']);
const DIRECTION_CHOICES = new Set<string>(['inbound', 'outbound', 'all']);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CursorShape {
  s: number;
  i: string;
}

function encodeCursor(seq: number, id: bigint | string): string {
  const payload: CursorShape = { s: seq, i: String(id) };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { seq: number; id: bigint } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as CursorShape;
    const seq = Number(parsed.s);
    const id = BigInt(parsed.i);
    if (!Number.isFinite(seq)) return null;
    return { seq, id };
  } catch {
    return null;
  }
}

function coerceLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function coerceDate(raw: string | null): Date | null {
  if (raw === null || raw === '') return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const { tenantDb } = await requireTenantDb();

    // Tenant-scope check via TenantDb — 404 for missing + other-tenant.
    const conn = await tenantDb.getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const directionRaw = (url.searchParams.get('direction') ?? 'all').toLowerCase();
    const direction = DIRECTION_CHOICES.has(directionRaw) ? directionRaw : 'all';
    const decisionRaw = (url.searchParams.get('decision') ?? 'all').toLowerCase();
    const decision = DECISION_CHOICES.has(decisionRaw) ? decisionRaw : 'all';
    const from = coerceDate(url.searchParams.get('from'));
    const to = coerceDate(url.searchParams.get('to'));
    const cursorRaw = url.searchParams.get('cursor');
    const limit = coerceLimit(url.searchParams.get('limit'));

    const clauses: SQL[] = [
      eq(auditEntries.tenantId, tenantDb.tenantId),
      eq(auditEntries.agentDid, conn.agentDid),
      eq(auditEntries.connectionId, id),
    ];
    if (decision !== 'all') clauses.push(eq(auditEntries.decision, decision));
    if (from) clauses.push(gte(auditEntries.timestamp, from));
    if (to) clauses.push(lt(auditEntries.timestamp, to));

    // Pre-resolve inbound/outbound msgId sets — we need them for both
    // filtering and direction decoration below.
    const messageRows = await tenantDb.raw
      .select({ msgId: messages.msgId, direction: messages.direction })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, tenantDb.tenantId),
          eq(messages.agentDid, conn.agentDid),
          eq(messages.connectionId, id),
        ),
      );
    const inboundMsgIds = messageRows.filter((r) => r.direction === 'in').map((r) => r.msgId);
    const outboundMsgIds = messageRows.filter((r) => r.direction === 'out').map((r) => r.msgId);
    const directionByMsgId = new Map<string, 'inbound' | 'outbound'>();
    for (const m of messageRows) {
      directionByMsgId.set(m.msgId, m.direction === 'in' ? 'inbound' : 'outbound');
    }

    if (direction === 'inbound') {
      if (inboundMsgIds.length === 0) {
        return NextResponse.json({ entries: [], nextCursor: null });
      }
      clauses.push(inArray(auditEntries.msgId, inboundMsgIds));
    } else if (direction === 'outbound') {
      // Outbound includes both message-backed outbound entries AND any
      // entry whose msg_id is not in the inbound set (covers revoke-style
      // local entries that synthesise their own msg_id).
      if (inboundMsgIds.length === 0) {
        // Every entry counts — no filter needed.
      } else if (outboundMsgIds.length === 0) {
        clauses.push(not(inArray(auditEntries.msgId, inboundMsgIds)));
      } else {
        const outboundOrLocal = or(
          inArray(auditEntries.msgId, outboundMsgIds),
          not(inArray(auditEntries.msgId, inboundMsgIds)),
        );
        if (outboundOrLocal) clauses.push(outboundOrLocal);
      }
    }

    if (cursorRaw) {
      const parsed = decodeCursor(cursorRaw);
      if (parsed) {
        const earlierSeq = lt(auditEntries.seq, parsed.seq);
        const sameSeqEarlierId = and(
          eq(auditEntries.seq, parsed.seq),
          lt(auditEntries.id, parsed.id),
        );
        const combined = or(earlierSeq, sameSeqEarlierId);
        if (combined) clauses.push(combined);
      }
    }

    const rows = await tenantDb.raw
      .select()
      .from(auditEntries)
      .where(and(...clauses))
      .orderBy(desc(auditEntries.seq), desc(auditEntries.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.seq, last.id) : null;

    return NextResponse.json({
      entries: page.map((r) => ({
        id: String(r.id),
        seq: r.seq,
        msgId: r.msgId,
        direction: directionByMsgId.get(r.msgId) ?? 'system',
        decision: r.decision,
        reason: r.reason ?? null,
        obligations: Array.isArray(r.obligations) ? (r.obligations as unknown[]) : [],
        policiesFired: Array.isArray(r.policiesFired) ? (r.policiesFired as string[]) : [],
        timestamp: r.timestamp.toISOString(),
        peerDid: conn.peerDid,
        spendDeltaCents: r.spendDeltaCents,
      })),
      nextCursor,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
