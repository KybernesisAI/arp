/**
 * POST /api/agents/provision-cloud — Phase 11b cloud-managed agent
 * provisioning.
 *
 * Generates an Ed25519 keypair on the cloud side, builds an ARP-spec
 * handoff bundle pointing at the cloud-gateway's WebSocket endpoint,
 * inserts an `agents` row scoped to the caller's tenant, and returns
 * the bundle + private key + WS URL ONCE so the user can wire their
 * local agent (KyberBot, etc.) via @kybernesis/arp-cloud-client.
 *
 * Auth: tenant session cookie. The domain must already have a
 * `registrar_bindings` row owned by the same tenant — this prevents
 * users from provisioning agents under domains they don't control.
 *
 * Idempotency: if an agents row for `did:web:<domain>` already exists
 * for this tenant, returns 409 with `{ error: "already_provisioned" }`.
 * Re-provisioning would burn a fresh keypair the user didn't ask for.
 *
 * The private key is returned ONCE in the response body. Cloud does
 * NOT persist it (only the public-key multibase lands in the agents
 * row). User must save it to disk for arp-cloud-client.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import * as ed25519 from '@noble/ed25519';
import { randomBytes } from 'node:crypto';
import {
  agents,
  registrarBindings,
  toTenantId,
  withTenant,
} from '@kybernesis/arp-cloud-db';
import {
  buildDidDocument,
  buildAgentCard,
  buildArpJson,
} from '@kybernesis/arp-templates';
import { ed25519RawToMultibase, base64urlEncode } from '@kybernesis/arp-transport';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/session';
import { track } from '@/lib/posthog';

export const runtime = 'nodejs';

const Body = z.object({
  domain: z
    .string()
    .min(1)
    .refine((d) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(d), {
      message: 'invalid domain',
    }),
  agentName: z.string().min(1).max(80),
  agentDescription: z.string().max(500).optional(),
  /**
   * When true, an existing agent row for this DID is deleted before a
   * fresh keypair is generated. Use this when the user lost the original
   * handoff JSON — re-provisioning mints a new keypair and invalidates
   * the old one. The peer DID stays the same.
   */
  force: z.boolean().optional(),
});

const GATEWAY_WS_URL =
  process.env['ARP_CLOUD_GATEWAY_WS_URL'] ??
  'wss://arp-cloud-gateway-production.up.railway.app/ws';

const GATEWAY_WELL_KNOWN_HOST =
  process.env['ARP_CLOUD_GATEWAY_HOST'] ??
  'arp-cloud-gateway-production.up.railway.app';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session || !session.tenantId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { domain, agentName, agentDescription, force } = parsed.data;
  const lowerDomain = domain.toLowerCase();

  const db = await getDb();
  const tenantDb = withTenant(db, toTenantId(session.tenantId));

  // 1. Caller must own a registrar_binding for this domain. Without it
  //    we'd let users provision agents on domains they don't control.
  const ownerCheck = await tenantDb.raw
    .select({ id: registrarBindings.id })
    .from(registrarBindings)
    .where(
      and(
        eq(registrarBindings.tenantId, session.tenantId),
        eq(registrarBindings.domain, lowerDomain),
      ),
    )
    .limit(1);
  if (!ownerCheck[0]) {
    return NextResponse.json(
      { error: 'no_binding_for_domain', detail: `no registrar_bindings row for ${lowerDomain} owned by this tenant` },
      { status: 403 },
    );
  }

  // 2. Already provisioned? With force=true, delete the existing row +
  //    issue a fresh keypair (recovery path when the user lost the
  //    original handoff JSON). Without force, bail with 409 so the user
  //    knows the row exists.
  const agentDid = `did:web:${lowerDomain}`;
  const existing = await tenantDb.raw
    .select({ did: agents.did })
    .from(agents)
    .where(eq(agents.did, agentDid))
    .limit(1);
  if (existing[0]) {
    if (!force) {
      return NextResponse.json(
        { error: 'already_provisioned', agent_did: agentDid },
        { status: 409 },
      );
    }
    await tenantDb.raw.delete(agents).where(eq(agents.did, agentDid));
  }

  // 3. Generate the agent keypair.
  const agentPrivateKey = ed25519.utils.randomPrivateKey();
  const agentPublicKey = await ed25519.getPublicKeyAsync(agentPrivateKey);
  const publicKeyMultibase = ed25519RawToMultibase(agentPublicKey);

  // 4. Build the well-known docs. The endpoints point at the
  //    cloud-gateway, since cloud-managed agents serve through the
  //    gateway via WS relay.
  const gatewayOrigin = `https://${GATEWAY_WELL_KNOWN_HOST}`;
  const wellKnownUrls = {
    did: `${gatewayOrigin}/.well-known/did.json`,
    agent_card: `${gatewayOrigin}/.well-known/agent-card.json`,
    arp: `${gatewayOrigin}/.well-known/arp.json`,
  };
  const didDoc = buildDidDocument({
    agentDid,
    controllerDid: session.principalDid,
    publicKeyMultibase,
    endpoints: {
      didcomm: `${gatewayOrigin}/didcomm`,
      agentCard: wellKnownUrls.agent_card,
    },
    representationVcUrl: `${gatewayOrigin}/representation.jwt`,
  });
  const agentCard = buildAgentCard({
    name: agentName,
    did: agentDid,
    description: agentDescription ?? 'Personal agent',
    endpoints: {
      didcomm: `${gatewayOrigin}/didcomm`,
      pairing: `${gatewayOrigin}/pairing`,
    },
    agentOrigin: gatewayOrigin,
  });
  const arpJson = buildArpJson({
    agentOrigin: gatewayOrigin,
  });

  // 5. Build a handoff bundle. The cloud-managed flow doesn't publish
  //    DNS records via this endpoint (that's the registrar's job via
  //    the bind callback) — we mark the bundle's dns_records_published
  //    with the records the registrar already wrote.
  const bootstrapToken = base64urlEncode(randomBytes(32));
  const certExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const handoff = {
    agent_did: agentDid,
    principal_did: session.principalDid,
    public_key_multibase: publicKeyMultibase,
    well_known_urls: wellKnownUrls,
    dns_records_published: ['_principal TXT'] as const,
    cert_expires_at: certExpiresAt,
    bootstrap_token: bootstrapToken,
  };

  // 6. Insert the agents row. tenantId is already enforced by the
  //    earlier ownerCheck.
  await tenantDb.raw.insert(agents).values({
    did: agentDid,
    tenantId: session.tenantId,
    principalDid: session.principalDid,
    agentName,
    agentDescription: agentDescription ?? '',
    publicKeyMultibase,
    handoffJson: handoff,
    wellKnownDid: didDoc as Record<string, unknown>,
    wellKnownAgentCard: agentCard as Record<string, unknown>,
    wellKnownArp: arpJson as Record<string, unknown>,
    scopeCatalogVersion: 'v1',
    tlsFingerprint: 'cloud-hosted',
  });

  track({
    distinctId: session.principalDid,
    event: 'agent_provisioned',
    properties: {
      tenant_id: session.tenantId,
      agent_did: agentDid,
      domain: lowerDomain,
      agent_name: agentName,
      forced: force ?? false,
    },
  });

  // 7. Return everything the user needs. The private key is shown ONCE
  //    — cloud doesn't persist it.
  return NextResponse.json({
    ok: true,
    agent_did: agentDid,
    principal_did: session.principalDid,
    public_key_multibase: publicKeyMultibase,
    agent_private_key_multibase: ed25519RawToMultibase(agentPrivateKey),
    gateway_ws_url: GATEWAY_WS_URL,
    handoff,
  });
}
