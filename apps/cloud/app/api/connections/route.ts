/**
 * GET /api/connections — paginated, filterable list of the caller tenant's
 * connections (slice 10b).
 *
 * Query params:
 *   - agentDid  (optional) — restrict to one of the tenant's agents
 *   - status    (active | revoked | suspended | all, default active)
 *   - cursor    (opaque base64url — previous-page tail marker)
 *   - limit     (default 25, clamped to [1, 100])
 *
 * Pagination is cursor-based on (created_at DESC, connection_id DESC). Offset
 * pagination is skipped because it drifts as new connections land between
 * page fetches.
 *
 * Composite-PK aware: every predicate joins `tenant_id` via
 * `tenantDb.tenantId`, which is the single-point isolation invariant
 * established by TenantDb (see packages/cloud-db/src/tenant-db.ts). We use
 * `tenantDb.raw` here because the composite-key cursor math is specific to
 * this read path and not shared with anything else.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { connections, type ConnectionRow } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_CHOICES = new Set<string>(['active', 'revoked', 'suspended', 'all']);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CursorShape {
  t: string;
  c: string;
}

function encodeCursor(createdAt: Date, connectionId: string): string {
  const payload: CursorShape = { t: createdAt.toISOString(), c: connectionId };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { at: Date; connectionId: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as CursorShape;
    const at = new Date(parsed.t);
    if (!Number.isFinite(at.getTime()) || typeof parsed.c !== 'string' || !parsed.c) {
      return null;
    }
    return { at, connectionId: parsed.c };
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

function summariseRow(row: ConnectionRow): Record<string, unknown> {
  const cedar = Array.isArray(row.cedarPolicies) ? (row.cedarPolicies as unknown[]) : [];
  const obligations = Array.isArray(row.obligations) ? (row.obligations as unknown[]) : [];
  return {
    connectionId: row.connectionId,
    agentDid: row.agentDid,
    peerDid: row.peerDid,
    purpose: row.purpose ?? null,
    label: row.label ?? null,
    status: row.status,
    scopesCount: cedar.length,
    obligationsCount: obligations.length,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    revokeReason: row.revokeReason ?? null,
  };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const url = new URL(req.url);
    const agentDid = (url.searchParams.get('agentDid') ?? '').trim();
    const statusRaw = (url.searchParams.get('status') ?? 'active').toLowerCase();
    const status = STATUS_CHOICES.has(statusRaw) ? statusRaw : 'active';
    const rawCursor = url.searchParams.get('cursor');
    const limit = coerceLimit(url.searchParams.get('limit'));

    const clauses = [eq(connections.tenantId, tenantDb.tenantId)];
    if (agentDid) clauses.push(eq(connections.agentDid, agentDid));
    if (status !== 'all') clauses.push(eq(connections.status, status));
    if (rawCursor) {
      const parsed = decodeCursor(rawCursor);
      if (parsed) {
        const earlier = lt(connections.createdAt, parsed.at);
        const sameInstantBefore = and(
          eq(connections.createdAt, parsed.at),
          lt(connections.connectionId, parsed.connectionId),
        );
        const combined = or(earlier, sameInstantBefore);
        if (combined) clauses.push(combined);
      }
    }

    const rows = await tenantDb.raw
      .select()
      .from(connections)
      .where(and(...clauses))
      .orderBy(desc(connections.createdAt), desc(connections.connectionId))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.createdAt, last.connectionId) : null;

    return NextResponse.json({
      connections: page.map(summariseRow),
      nextCursor,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
