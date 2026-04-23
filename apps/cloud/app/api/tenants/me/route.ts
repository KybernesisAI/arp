import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { PLAN_LIMITS } from '@kybernesis/arp-cloud-db';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const { tenantDb } = await requireTenantDb();
    const [tenant, agents] = await Promise.all([tenantDb.getTenant(), tenantDb.listAgents()]);
    if (!tenant) {
      return NextResponse.json({ error: 'no_tenant' }, { status: 404 });
    }
    return NextResponse.json({
      tenant: {
        id: tenant.id,
        principalDid: tenant.principalDid,
        displayName: tenant.displayName,
        plan: tenant.plan,
        status: tenant.status,
        limits: PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS],
      },
      agents: agents.map((a) => ({ did: a.did, name: a.agentName, lastSeenAt: a.lastSeenAt })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
