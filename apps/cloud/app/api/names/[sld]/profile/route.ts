/**
 * /api/names/[sld]/profile — the identity profile (AgentID S6c).
 *
 *   GET  → { name, description, accent, picture, updated_at }
 *   PUT  { name?, description?, accent?, avatar? }  (avatar: data URL, or null to clear)
 *
 * Owner session only. A change rebuilds the identity document and re-signs
 * the agent card so the picture and name are published with the name.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { env } from '@/lib/env';
import { mirrorOriginFor } from '@/lib/key-custody';
import { rebuildWellKnown } from '@/lib/links';
import { ACCENT_REGEX, ProfileError, parseAvatarDataUrl, profileView } from '@/lib/agent-profile';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const SLD = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  accent: z.string().trim().regex(ACCENT_REGEX, 'Use a hex colour like #10b981.').nullable().optional(),
  avatar: z.string().max(600_000).nullable().optional(),
});

async function resolveName(raw: string) {
  const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
  if (!SLD.test(sld)) return null;
  const { tenantDb, session } = await requireTenantDb();
  const agentDid = `did:web:${sld}.agent`;
  const agent = await tenantDb.getAgent(agentDid);
  if (!agent) return null;
  return { tenantDb, session, agent, agentDid, sld, mirror: mirrorOriginFor(`${sld}.agent`, env().AGENTID_MIRROR_SUFFIX) };
}

function fail(err: unknown, where: string): Response {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ProfileError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  posthog.captureException(err);
  console.error(`[names/profile ${where}]`, err);
  return NextResponse.json({ error: 'internal', message: 'The profile could not be saved. Please try again.' }, { status: 500 });
}

export async function GET(_req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const r = await resolveName((await ctx.params).sld);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ profile: profileView(r.agent, r.mirror) });
  } catch (err) {
    return fail(err, 'GET');
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const r = await resolveName((await ctx.params).sld);
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: 'bad_request', message: issue?.message ?? 'Invalid profile.', issues: parsed.error.issues }, { status: 400 });
    }
    const b = parsed.data;
    const patch: Parameters<typeof r.tenantDb.updateAgent>[1] = { profileUpdatedAt: new Date() };
    if (b.name !== undefined) patch.agentName = b.name;
    if (b.description !== undefined) patch.agentDescription = b.description;
    if (b.accent !== undefined) patch.accent = b.accent ? b.accent.toLowerCase() : null;
    if (b.avatar === null) {
      patch.avatarData = null;
      patch.avatarMime = null;
    } else if (typeof b.avatar === 'string') {
      const img = parseAvatarDataUrl(b.avatar);
      patch.avatarData = img.base64;
      patch.avatarMime = img.mime;
    }
    await r.tenantDb.updateAgent(r.agentDid, patch);
    const rebuilt = await rebuildWellKnown(r.tenantDb, r.agentDid);
    const agent = rebuilt ?? (await r.tenantDb.getAgent(r.agentDid));
    if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    track({
      distinctId: r.session.principalDid,
      event: 'agentid_profile_updated',
      properties: { tenant_id: r.tenantDb.tenantId, agent_did: r.agentDid, fields: Object.keys(b) },
    });
    return NextResponse.json({ ok: true, profile: profileView(agent, r.mirror) });
  } catch (err) {
    return fail(err, 'PUT');
  }
}
