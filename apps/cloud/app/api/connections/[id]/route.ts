/**
 * GET /api/connections/:id — tenant-scoped connection detail (slice 10b).
 *
 * Returns the full connection row plus a token summary (scopes, obligations,
 * audience + issuer DIDs, expiry). `tenantDb.getConnection` already filters
 * by tenant_id + connection_id (the composite PK established in slice 10a),
 * so a request for another tenant's connection — even one with the same
 * connection_id — returns the same 404 as a missing id. That symmetry is a
 * privacy property: we never leak "there is a connection by this id but it
 * belongs to someone else."
 */

import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const { tenantDb } = await requireTenantDb();
    const row = await tenantDb.getConnection(id);
    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const cedar = Array.isArray(row.cedarPolicies) ? (row.cedarPolicies as string[]) : [];
    const obligations = Array.isArray(row.obligations) ? (row.obligations as unknown[]) : [];
    const token = (row.tokenJson ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      connection: {
        connectionId: row.connectionId,
        agentDid: row.agentDid,
        peerDid: row.peerDid,
        purpose: row.purpose ?? null,
        label: row.label ?? null,
        status: row.status,
        scopeCatalogVersion: row.scopeCatalogVersion,
        cedarPolicies: cedar,
        obligations,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
        revokeReason: row.revokeReason ?? null,
        token: {
          issuer: typeof token['issuer'] === 'string' ? (token['issuer'] as string) : null,
          subject: typeof token['subject'] === 'string' ? (token['subject'] as string) : null,
          audience: typeof token['audience'] === 'string' ? (token['audience'] as string) : null,
          expires: typeof token['expires'] === 'string' ? (token['expires'] as string) : null,
        },
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
