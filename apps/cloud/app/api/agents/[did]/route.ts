import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ did: string }> },
): Promise<NextResponse> {
  try {
    const { did } = await ctx.params;
    const { tenantDb } = await requireTenantDb();
    const agent = await tenantDb.getAgent(decodeURIComponent(did));
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const connections = await tenantDb.listConnections({ agentDid: agent.did });
    return NextResponse.json({
      agent: {
        did: agent.did,
        name: agent.agentName,
        description: agent.agentDescription,
        lastSeenAt: agent.lastSeenAt,
        createdAt: agent.createdAt,
      },
      connections: connections.map((c) => ({
        connectionId: c.connectionId,
        peerDid: c.peerDid,
        purpose: c.purpose,
        status: c.status,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        lastMessageAt: c.lastMessageAt,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ did: string }> },
): Promise<NextResponse> {
  try {
    const { did } = await ctx.params;
    const { tenantDb } = await requireTenantDb();
    const target = decodeURIComponent(did);
    const agent = await tenantDb.getAgent(target);
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await tenantDb.deleteAgent(target);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
