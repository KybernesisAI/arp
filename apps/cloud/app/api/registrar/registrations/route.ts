/**
 * GET /api/registrar/registrations — the signed-in tenant's name purchases,
 * newest first. Customer-safe fields only.
 */

import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const rows = await tenantDb.listRegistrations();
    return NextResponse.json({
      registrations: rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        sld: r.sld,
        status: r.status,
        years: r.years,
        price_cents: r.priceCents,
        registered_at: r.registeredAt?.toISOString() ?? null,
        expiry_at: r.expiryAt?.toISOString() ?? null,
        owner_label: r.ownerLabel,
        error: r.error,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
