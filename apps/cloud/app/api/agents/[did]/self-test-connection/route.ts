/**
 * POST /api/agents/[did]/self-test-connection — dev-only convenience.
 *
 * Creates a self-loop connection for a cloud-managed agent (peer ==
 * agent itself) with a permit-all Cedar policy. Idempotent: returns the
 * existing self-test connection if one already exists. Used to round-
 * trip a DIDComm message through your own agent for verification
 * without going through the full pairing handshake.
 *
 * NOT a substitute for a real connection — every real peer relationship
 * still flows through pairing/invitation. This endpoint exists purely
 * for the "send Atlas a test ping and watch the bridge → kyberbot
 * pipeline" demo.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { connections, toTenantId, withTenant } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

const SELF_TEST_LABEL = 'self-test';
const SELF_TEST_PURPOSE = 'developer self-loop for arp-send demo';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ did: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { did: didParam } = await ctx.params;
  const agentDid = decodeURIComponent(didParam);

  const db = await getDb();
  const tenantDb = withTenant(db, toTenantId(session.tenantId));
  const agent = await tenantDb.getAgent(agentDid);
  if (!agent) {
    return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
  }

  // Idempotency: if a self-test connection already exists for this
  // agent, return it instead of stacking duplicates.
  const existing = await tenantDb.raw
    .select({
      connectionId: connections.connectionId,
      status: connections.status,
    })
    .from(connections)
    .where(
      and(
        eq(connections.tenantId, session.tenantId),
        eq(connections.agentDid, agentDid),
        eq(connections.peerDid, agentDid),
        eq(connections.label, SELF_TEST_LABEL),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return NextResponse.json({
      ok: true,
      reused: true,
      connection_id: existing[0].connectionId,
      status: existing[0].status,
    });
  }

  const connectionId = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const tokenJson = {
    issuer: agentDid,
    audience: agentDid,
    connection_id: connectionId,
    scopes: ['*'],
    iat: now,
    exp: now + 365 * 24 * 3600,
  };

  await tenantDb.createConnection({
    connectionId,
    agentDid,
    peerDid: agentDid,
    label: SELF_TEST_LABEL,
    purpose: SELF_TEST_PURPOSE,
    tokenJws: 'self-test.dev.placeholder',
    tokenJson,
    cedarPolicies: ['permit(principal, action, resource);'],
    obligations: [],
    scopeCatalogVersion: 'v1',
    metadata: { selfTest: true },
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
  });

  return NextResponse.json({
    ok: true,
    reused: false,
    connection_id: connectionId,
  });
}
