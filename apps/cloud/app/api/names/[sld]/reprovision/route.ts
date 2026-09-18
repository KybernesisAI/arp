/**
 * POST /api/names/[sld]/reprovision  (AgentID S4 live gate)
 *
 * Re-provision a name the tenant owns into HOSTED custody: mint a fresh
 * keypair sealed in the cloud, rebuild the well-known documents on the
 * mirror, and leave the runtime unattached. This is the path for a name whose
 * key was exported (hosted delivery needs the key held for you) and for an
 * owned-but-unprovisioned name. It rotates the key, so every existing
 * connection for the name must be paired again.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { domainRegistrations, registrarBindings } from '@kybernesis/arp-cloud-db';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { env } from '@/lib/env';
import { mintIdentity, mirrorOriginFor, sealingKey } from '@/lib/key-custody';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({
  agentName: z.string().min(1).max(80).optional(),
  agentDescription: z.string().max(500).optional(),
});

const SLD = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export async function POST(req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { tenantDb, session, db } = await requireTenantDb();
    const { sld: raw } = await ctx.params;
    const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
    if (!SLD.test(sld)) return NextResponse.json({ error: 'bad_request', message: 'Not a valid name.' }, { status: 400 });
    const domain = `${sld}.agent`;
    const agentDid = `did:web:${domain}`;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });

    // The tenant must own the name: a registrar binding or an active registration.
    const [binding, registration] = await Promise.all([
      db
        .select({ id: registrarBindings.id })
        .from(registrarBindings)
        .where(and(eq(registrarBindings.tenantId, tenantDb.tenantId), eq(registrarBindings.domain, domain)))
        .limit(1),
      db
        .select({ id: domainRegistrations.id, status: domainRegistrations.status })
        .from(domainRegistrations)
        .where(and(eq(domainRegistrations.tenantId, tenantDb.tenantId), eq(domainRegistrations.domain, domain)))
        .limit(1),
    ]);
    const reg = registration[0];
    const owned = binding.length > 0 || (reg !== undefined && (reg.status === 'active' || reg.status === 'registered' || reg.status === 'owner_pending'));
    if (!owned) return NextResponse.json({ error: 'not_owned', message: 'This name is not registered to your account.' }, { status: 403 });

    const existing = await tenantDb.getAgent(agentDid);
    const mirror = mirrorOriginFor(domain, env().AGENTID_MIRROR_SUFFIX);
    const minted = await mintIdentity({
      tenantDb,
      domain,
      principalDid: session.principalDid,
      agentName: parsed.data.agentName ?? existing?.agentName ?? sld,
      agentDescription: parsed.data.agentDescription ?? existing?.agentDescription ?? '',
      custody: 'cloud',
      runtimeKind: 'none',
      domainRegistrationId: reg?.id ?? null,
      wellKnownOrigin: mirror,
      mirrorOrigin: mirror,
      sealKey: sealingKey({ ARP_CLOUD_KEY_ENCRYPTION_KEY: process.env['ARP_CLOUD_KEY_ENCRYPTION_KEY'] ?? null, vercelEnv: process.env['VERCEL_ENV'] }),
      force: true,
    });
    track({
      distinctId: session.principalDid,
      event: 'agentid_name_reprovisioned',
      properties: { tenant_id: tenantDb.tenantId, agent_did: agentDid, had_agent: existing !== null, previous_custody: existing?.keyCustody ?? null },
    });
    return NextResponse.json({ ok: true, agent_did: minted.agentDid, custody: 'cloud', rotated: existing !== null, mirror });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[names/reprovision POST]', err);
    return NextResponse.json({ error: 'internal', message: 'The name could not be re-provisioned.' }, { status: 500 });
  }
}
