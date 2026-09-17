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
import {
  registrarBindings,
  toTenantId,
  withTenant,
} from '@kybernesis/arp-cloud-db';
import { ed25519RawToMultibase } from '@kybernesis/arp-transport';
import { IdentityExistsError, mintIdentity, type MintedIdentity } from '@/lib/key-custody';
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
  // 3. Generate the agent keypair.
  // AgentID S2: shared minting path. provision-cloud keeps its historical
  // contract — the owner downloads the key once (exported custody) and runs
  // a WS bridge — while cloud-custody identities (purchase fulfilment) share
  // the same document builders.
  let minted: MintedIdentity;
  try {
    minted = await mintIdentity({
      tenantDb,
      domain: lowerDomain,
      principalDid: session.principalDid,
      agentName,
      ...(agentDescription !== undefined ? { agentDescription } : {}),
      custody: 'exported',
      runtimeKind: 'bridge',
      wellKnownOrigin: `https://${GATEWAY_WELL_KNOWN_HOST}`,
      gatewayWsUrl: GATEWAY_WS_URL,
      force: force ?? false,
    });
  } catch (err) {
    if (err instanceof IdentityExistsError) {
      return NextResponse.json(
        { error: 'already_provisioned', agent_did: err.agentDid },
        { status: 409 },
      );
    }
    throw err;
  }
  const { agentDid, publicKeyMultibase, handoff, privateKeyRaw } = minted;

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
    agent_private_key_multibase: ed25519RawToMultibase(privateKeyRaw),
    gateway_ws_url: GATEWAY_WS_URL,
    handoff,
  });
}
