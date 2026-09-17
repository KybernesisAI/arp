/** DELETE /api/names/[sld]/links/[id] — revoke a link and rebuild the identity document. (AgentID S3 / L3) */

import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { rebuildWellKnown } from '@/lib/links';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ sld: string; id: string }> }): Promise<Response> {
  try {
    const { sld: sldRaw, id } = await ctx.params;
    const sld = decodeURIComponent(sldRaw).toLowerCase().replace(/\.agent$/, '');
    const { tenantDb, session } = await requireTenantDb();
    const agentDid = `did:web:${sld}.agent`;
    const link = await tenantDb.getLink(id);
    if (!link || link.agentDid !== agentDid) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await tenantDb.updateLink(id, { status: 'revoked', revokedAt: new Date() });
    await rebuildWellKnown(tenantDb, agentDid);
    track({
      distinctId: session.principalDid,
      event: 'agentid_link_revoked',
      properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, kind: link.kind },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[names/links DELETE]', err);
    return NextResponse.json({ error: 'internal', message: 'The link could not be removed.' }, { status: 500 });
  }
}
