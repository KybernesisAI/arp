import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { createPostgresAudit, createSilentLogger } from '@kybernesis/arp-cloud-runtime';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ did: string }> },
): Promise<NextResponse> {
  try {
    const { did } = await ctx.params;
    const { tenantDb } = await requireTenantDb();
    const agent = await tenantDb.getAgent(decodeURIComponent(did));
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const url = new URL(req.url);
    const connectionId = url.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'missing_connection_id' }, { status: 400 });
    }
    const audit = createPostgresAudit({ tenantDb, logger: createSilentLogger() });
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const entries = await audit.list(agent.did, connectionId, { limit });
    const verification = await audit.verify(agent.did, connectionId);
    return NextResponse.json({ connection_id: connectionId, entries, verification });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
