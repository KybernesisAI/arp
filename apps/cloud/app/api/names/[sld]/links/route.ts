/**
 * GET  /api/names/[sld]/links          list this name's identity links
 * POST /api/names/[sld]/links          { kind, value, label? } → pending link + challenge
 * (AgentID S3 / L3)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AGENT_LINK_KINDS } from '@kybernesis/arp-cloud-db';
import type { AgentLinkRow } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { LinkError, challengeString, makeChallenge, normalizeLinkValue, npubFromHex } from '@/lib/links';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const SLD_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function serializeLink(l: AgentLinkRow): Record<string, unknown> {
  return {
    id: l.id,
    kind: l.kind,
    value: l.value,
    display: l.kind === 'nostr' ? npubFromHex(l.value) : l.value,
    label: l.label,
    status: l.status,
    challenge: l.status === 'pending' ? l.challenge : null,
    challenge_string: l.status === 'pending' ? challengeString(l.agentDid, l.challenge) : null,
    verified_at: l.verifiedAt?.toISOString() ?? null,
    created_at: l.createdAt.toISOString(),
  };
}

async function resolveName(sldRaw: string) {
  const sld = decodeURIComponent(sldRaw).toLowerCase().replace(/\.agent$/, '');
  if (!SLD_REGEX.test(sld)) return null;
  const { tenantDb, session } = await requireTenantDb();
  const agentDid = `did:web:${sld}.agent`;
  const agent = await tenantDb.getAgent(agentDid);
  if (!agent) return null;
  return { tenantDb, session, agentDid, sld };
}

export async function GET(_req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { sld } = await ctx.params;
    const r = await resolveName(sld);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const links = await r.tenantDb.listLinks(r.agentDid);
    return NextResponse.json({ links: links.map(serializeLink) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const Body = z.object({
  kind: z.enum(AGENT_LINK_KINDS),
  value: z.string().min(1).max(512),
  label: z.string().max(80).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { sld } = await ctx.params;
    const r = await resolveName(sld);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    let value: string;
    try {
      value = normalizeLinkValue(parsed.data.kind, parsed.data.value);
    } catch (err) {
      if (err instanceof LinkError) return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
      throw err;
    }
    const existing = (await r.tenantDb.listLinks(r.agentDid, { includeRevoked: true })).find(
      (l) => l.kind === parsed.data.kind && l.value === value,
    );
    let link: AgentLinkRow;
    if (existing) {
      // Re-adding a revoked or pending link mints a fresh challenge.
      const updated = await r.tenantDb.updateLink(existing.id, {
        status: existing.status === 'verified' ? 'verified' : 'pending',
        challenge: existing.status === 'verified' ? existing.challenge : makeChallenge(),
        revokedAt: null,
        ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      });
      link = updated ?? existing;
    } else {
      link = await r.tenantDb.createLink({
        agentDid: r.agentDid,
        kind: parsed.data.kind,
        value,
        label: parsed.data.label ?? null,
        challenge: makeChallenge(),
      });
    }
    track({
      distinctId: r.session.principalDid,
      event: 'agentid_link_added',
      properties: { tenant_id: r.tenantDb.tenantId, agent_did: r.agentDid, kind: link.kind },
    });
    return NextResponse.json({ link: serializeLink(link) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[names/links POST]', err);
    return NextResponse.json({ error: 'internal', message: 'The link could not be saved.' }, { status: 500 });
  }
}
