/**
 * DELETE /api/registrar/bindings/<domain>
 *
 * Releases the tenant's claim on a `.agent` domain. After this:
 *   - The registrar_binding row is gone, so the tenant can no longer
 *     provision agents on this domain.
 *   - Existing agents already provisioned on the domain are NOT
 *     deleted — the user must delete those separately if they also
 *     want to release the cloud identities. This is intentional:
 *     unbinding a domain you no longer own (e.g., transferred to a
 *     friend) shouldn't accidentally nuke the agent's signing key
 *     before the new owner has a chance to take possession.
 *   - The `.agent` registrar (Headless Domains) is NOT notified —
 *     they own the namespace; this only removes our local claim.
 *
 * Auth: requires the calling tenant to be the binding's owner.
 */

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { registrarBindings, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { getDb } from '@/lib/db';
import { track } from '@/lib/posthog';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ domain: string }> },
): Promise<NextResponse> {
  try {
    const { domain } = await ctx.params;
    const lowerDomain = decodeURIComponent(domain).toLowerCase();
    const { session } = await requireTenantDb();
    if (!session.tenantId) {
      return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    }
    const db = await getDb();
    const tenantDb = withTenant(db, toTenantId(session.tenantId));

    const existing = await tenantDb.raw
      .select({ id: registrarBindings.id })
      .from(registrarBindings)
      .where(
        and(
          eq(registrarBindings.tenantId, session.tenantId),
          eq(registrarBindings.domain, lowerDomain),
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    await tenantDb.raw
      .delete(registrarBindings)
      .where(
        and(
          eq(registrarBindings.tenantId, session.tenantId),
          eq(registrarBindings.domain, lowerDomain),
        ),
      );

    track({
      distinctId: session.principalDid,
      event: 'registrar_binding_unbound',
      properties: {
        tenant_id: session.tenantId,
        domain: lowerDomain,
      },
    });

    return NextResponse.json({ ok: true, domain: lowerDomain });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
