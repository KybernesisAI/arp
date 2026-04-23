/**
 * POST /api/agents — provision a tenant (if absent) + an agent from a
 * handoff bundle. Implements Phase-7 Task 7 (onboarding).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HandoffBundleSchema } from '@kybernesis/arp-spec';
import {
  tenants,
  toTenantId,
  withTenant,
  PLAN_LIMITS,
} from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { setSession, getSession } from '@/lib/session';

export const runtime = 'nodejs';

const Body = z.object({
  handoff: HandoffBundleSchema,
});

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = await getDb();
  if (!session.tenantId) return NextResponse.json({ agents: [] });
  const tenantDb = withTenant(db, toTenantId(session.tenantId));
  const rows = await tenantDb.listAgents();
  return NextResponse.json({
    agents: rows.map((a) => ({
      did: a.did,
      name: a.agentName,
      description: a.agentDescription,
      publicKeyMultibase: a.publicKeyMultibase,
      lastSeenAt: a.lastSeenAt,
      wellKnownUrls: {
        did: `/agent/${encodeURIComponent(a.did)}/.well-known/did.json`,
      },
    })),
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_handoff', issues: parsed.error.issues }, { status: 400 });
  }
  const bundle = parsed.data.handoff;
  if (bundle.principal_did !== session.principalDid) {
    return NextResponse.json({ error: 'handoff_principal_mismatch' }, { status: 403 });
  }

  const db = await getDb();

  // Find-or-create tenant.
  let tenantId = session.tenantId;
  if (!tenantId) {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.principalDid, session.principalDid))
      .limit(1);
    tenantId = rows[0]?.id ?? null;
    if (!tenantId) {
      const inserted = await db
        .insert(tenants)
        .values({ principalDid: session.principalDid, plan: 'free', status: 'active' })
        .returning({ id: tenants.id });
      tenantId = inserted[0]?.id ?? null;
    }
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_create_failed' }, { status: 500 });
  }

  const tenantDb = withTenant(db, toTenantId(tenantId));
  const tenantRow = await tenantDb.getTenant();
  const plan = tenantRow?.plan ?? 'free';
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
  const agents = await tenantDb.listAgents();
  if (limits.maxAgents !== null && agents.length >= limits.maxAgents) {
    return NextResponse.json(
      { error: 'plan_agent_limit_reached', plan, max: limits.maxAgents },
      { status: 402 },
    );
  }

  const agentOrigin = (bundle.well_known_urls.arp as string)
    .replace(/\/\.well-known\/arp\.json$/, '')
    .replace(/\/+$/, '');
  // The cloud hosts the DIDComm endpoint — we serve it from the gateway.
  const didcommUrl = `${agentOrigin}/didcomm`;

  const wkDid = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: bundle.agent_did,
    controller: bundle.principal_did,
    verificationMethod: [
      {
        id: `${bundle.agent_did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: bundle.agent_did,
        publicKeyMultibase: bundle.public_key_multibase,
      },
    ],
    authentication: [`${bundle.agent_did}#key-1`],
    assertionMethod: [`${bundle.agent_did}#key-1`],
    keyAgreement: [`${bundle.agent_did}#key-1`],
    service: [
      {
        id: `${bundle.agent_did}#didcomm`,
        type: 'DIDCommMessaging',
        serviceEndpoint: didcommUrl,
        accept: ['didcomm/v2'],
      },
    ],
    principal: {
      did: bundle.principal_did,
      representationVC: `${agentOrigin}/.well-known/representation.jwt`,
    },
  };
  const wkCard = {
    did: bundle.agent_did,
    name: deriveName(bundle.agent_did),
    description: 'Cloud-hosted ARP agent',
    endpoints: {
      didcomm: didcommUrl,
      pairing: `${agentOrigin}/pair`,
    },
    supported_scopes: [],
    vc_requirements: [],
    agent_origin: agentOrigin,
  };
  const wkArp = { agent_origin: agentOrigin };

  await tenantDb.createAgent({
    did: bundle.agent_did,
    principalDid: bundle.principal_did,
    agentName: deriveName(bundle.agent_did),
    agentDescription: 'Cloud-hosted ARP agent',
    publicKeyMultibase: bundle.public_key_multibase,
    handoffJson: bundle as unknown as Record<string, unknown>,
    wellKnownDid: wkDid as unknown as Record<string, unknown>,
    wellKnownAgentCard: wkCard as unknown as Record<string, unknown>,
    wellKnownArp: wkArp as unknown as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  });

  // Refresh session cookie with the tenantId.
  await setSession(session.principalDid, tenantId, session.nonce);

  return NextResponse.json({ ok: true, agentDid: bundle.agent_did, tenantId });
}

function deriveName(did: string): string {
  const host = did.split(':')[2] ?? 'agent';
  const first = host.split('.')[0] ?? 'agent';
  return first.charAt(0).toUpperCase() + first.slice(1);
}
