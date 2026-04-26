/**
 * GET /api/pairing/scope-catalog-list — returns the full scope catalog
 * + bundle presets so the AcceptClient's bidirectional ScopePickerModal
 * can render the audience-side picker without round-tripping per scope.
 *
 * Session-authed; the catalog is the same data that drives the issuer's
 * /pair scope picker.
 */

import { NextResponse } from 'next/server';
import { BUNDLES } from '@kybernesis/arp-scope-catalog';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { getScopeCatalog } from '@/lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await requireTenantDb();
    const catalog = getScopeCatalog().slice();
    const bundles = BUNDLES.map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      scopes: b.scopes.map((s) => ({
        id: s.id,
        params: (s.params ?? {}) as Record<string, unknown>,
      })),
      needsParams: b.scopes.some(
        (s) =>
          s.params != null &&
          Object.values(s.params).some((v) => v === '<user-picks>'),
      ),
    }));
    return NextResponse.json({ catalog, bundles });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
