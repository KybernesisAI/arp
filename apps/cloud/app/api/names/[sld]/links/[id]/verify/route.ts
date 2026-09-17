/**
 * POST /api/names/[sld]/links/[id]/verify  { proof? }
 * nostr / kybernesis: `proof` is the signed event / statement.
 * runtime / web: no body; we fetch the verification document.
 * On success the link is marked verified and the identity document rebuilt.
 * (AgentID S3 / L3)
 */

import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { LinkError, rebuildWellKnown, verifyLinkProof } from '@/lib/links';
import { posthog, track } from '@/lib/posthog';
import { serializeLink } from '../../route';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ sld: string; id: string }> }): Promise<Response> {
  try {
    const { sld: sldRaw, id } = await ctx.params;
    const sld = decodeURIComponent(sldRaw).toLowerCase().replace(/\.agent$/, '');
    const { tenantDb, session } = await requireTenantDb();
    const agentDid = `did:web:${sld}.agent`;
    const link = await tenantDb.getLink(id);
    if (!link || link.agentDid !== agentDid) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (link.status === 'revoked') return NextResponse.json({ error: 'revoked', message: 'This link was removed. Add it again to verify.' }, { status: 409 });
    const body = (await req.json().catch(() => ({}))) as { proof?: unknown };
    let proof: Record<string, unknown>;
    try {
      proof = await verifyLinkProof(link, body.proof);
    } catch (err) {
      if (err instanceof LinkError) {
        const status = err.code === 'unreachable' ? 502 : 400;
        return NextResponse.json({ error: err.code, message: err.message }, { status });
      }
      throw err;
    }
    const updated = await tenantDb.updateLink(id, { status: 'verified', proofJson: proof, verifiedAt: new Date() });
    await rebuildWellKnown(tenantDb, agentDid);
    track({
      distinctId: session.principalDid,
      event: 'agentid_link_verified',
      properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, kind: link.kind },
    });
    return NextResponse.json({ ok: true, link: serializeLink(updated ?? link) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[names/links verify]', err);
    return NextResponse.json({ error: 'internal', message: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
