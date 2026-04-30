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
  effectiveMaxAgents,
} from '@kybernesis/arp-cloud-db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { setSession, getSession } from '@/lib/session';
import { getBillingContext, updateSubscriptionQuantity } from '@/lib/billing';

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
  const subQty = tenantRow?.subscriptionQuantity ?? 1;
  const existingAgents = await tenantDb.listAgents();

  // Free tier hard-cap: refuse the second agent. Upgrade to Pro to provision
  // more — Pro auto-scales subscription quantity per agent.
  if (plan === 'free') {
    const cap = effectiveMaxAgents('free', subQty);
    if (cap !== null && existingAgents.length >= cap) {
      return NextResponse.json(
        {
          error: 'plan_agent_limit_reached',
          plan,
          max: cap,
          hint: 'upgrade_to_pro',
        },
        { status: 402 },
      );
    }
  }
  // Pro tier: no hard cap; we bump Stripe quantity post-insert. Refuse Pro
  // tenants that haven't completed checkout (no subscription = no billing).
  if (plan === 'pro' && !tenantRow?.stripeSubscriptionId) {
    return NextResponse.json(
      { error: 'pro_subscription_required', hint: 'complete_checkout_first' },
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

  // Pro tier: keep the Stripe subscription quantity in sync with the
  // provisioned agent count. The user is auto-charged the pro-rated $5
  // for the new slot. If Stripe isn't configured (dev), we still bump
  // the column so dev UX matches.
  if (plan === 'pro') {
    const newQty = existingAgents.length + 1;
    if (tenantRow?.stripeSubscriptionId) {
      try {
        const stripeQty = await updateSubscriptionQuantity(
          getBillingContext(),
          tenantRow.stripeSubscriptionId,
          newQty,
        );
        await tenantDb.updateTenant({
          subscriptionQuantity: stripeQty ?? newQty,
        });
      } catch (err) {
        // Don't block the agent insert on a Stripe failure — the webhook
        // reconciles on the next subscription.updated event.
        console.error('stripe_quantity_bump_failed', {
          tenantId,
          error: (err as Error).message,
        });
      }
    } else {
      await tenantDb.updateTenant({ subscriptionQuantity: newQty });
    }
  }

  // Refresh session cookie with the tenantId.
  await setSession(session.principalDid, tenantId, session.nonce);

  return NextResponse.json({ ok: true, agentDid: bundle.agent_did, tenantId });
}

function deriveName(did: string): string {
  const host = did.split(':')[2] ?? 'agent';
  const first = host.split('.')[0] ?? 'agent';
  return first.charAt(0).toUpperCase() + first.slice(1);
}
