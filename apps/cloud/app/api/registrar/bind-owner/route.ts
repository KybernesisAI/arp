/**
 * POST /api/registrar/bind-owner  (AgentID S2 / T6)
 *
 * Self-hosted owner binding. The browser signs the representation JWT with
 * the session's principal key (see FinishSetupButton) and posts it here. We
 * verify the signature against the supplied public key, check the JWT binds
 * THIS tenant's principal to THIS tenant's name, upsert `registrar_bindings`
 * (registrar = 'agentid'), and flip the registration to `active`.
 *
 * The JWT is then served by the gateway at
 * `https://<sld>.agent.arp.run/representation.jwt` (the URL the identity's
 * DID document already advertises). No DNS involved.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as ed25519 from '@noble/ed25519';
import { and, eq } from 'drizzle-orm';
import { registrarBindings } from '@kybernesis/arp-cloud-db';
import { base64urlDecode, multibaseEd25519ToRaw } from '@kybernesis/arp-transport';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const OWNER_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.agent$/;

const Body = z.object({
  domain: z.string().transform((d) => d.trim().toLowerCase()).refine((d) => DOMAIN_REGEX.test(d), 'invalid domain'),
  owner_label: z
    .string()
    .transform((o) => o.trim().toLowerCase())
    .refine((o) => OWNER_LABEL_REGEX.test(o), 'invalid owner label')
    .optional()
    .default('owner'),
  public_key_multibase: z.string().startsWith('z').min(2),
  signed_representation_jwt: z.string().refine((s) => s.split('.').length === 3, 'not a compact JWS'),
});

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.');
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(base64urlDecode(payload)).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantDb, session } = await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    }
    const { domain, owner_label, public_key_multibase, signed_representation_jwt } = parsed.data;
    const agentDid = `did:web:${domain}`;

    // The name must be this tenant's: either a purchase or a minted identity.
    const registration = await tenantDb.getRegistrationByDomain(domain);
    const agent = await tenantDb.getAgent(agentDid);
    if (!agent && !registration) {
      return NextResponse.json({ error: 'not_your_name', message: 'This name is not on your account.' }, { status: 403 });
    }
    if (registration && !['registered', 'owner_pending', 'active'].includes(registration.status)) {
      return NextResponse.json(
        { error: 'not_registered_yet', message: 'Finish registration before verifying ownership.' },
        { status: 409 },
      );
    }

    // JWT claims: sub = the name's DID, iss = this tenant's principal (raw or cloud alias).
    const payload = decodeJwtPayload(signed_representation_jwt);
    const iss = typeof payload?.['iss'] === 'string' ? (payload['iss'] as string) : null;
    const sub = typeof payload?.['sub'] === 'string' ? (payload['sub'] as string) : null;
    const alias = `did:web:cloud.arp.run:u:${tenantDb.tenantId}`;
    if (!iss || !sub || sub !== agentDid || (iss !== alias && iss !== session.principalDid)) {
      return NextResponse.json({ error: 'jwt_claims_mismatch', message: 'The ownership proof does not match this name and account.' }, { status: 400 });
    }

    // Signature: EdDSA over `<header>.<payload>` with the supplied key.
    const [h, p, sig] = signed_representation_jwt.split('.') as [string, string, string];
    let ok = false;
    try {
      const pub = multibaseEd25519ToRaw(public_key_multibase);
      ok = await ed25519.verifyAsync(base64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`), pub);
    } catch {
      ok = false;
    }
    if (!ok) {
      return NextResponse.json({ error: 'bad_signature', message: 'The ownership proof could not be verified.' }, { status: 400 });
    }

    const db = tenantDb.raw;
    const existing = await db
      .select({ id: registrarBindings.id })
      .from(registrarBindings)
      .where(and(eq(registrarBindings.domain, domain), eq(registrarBindings.ownerLabel, owner_label)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(registrarBindings)
        .set({
          tenantId: tenantDb.tenantId,
          registrar: 'agentid',
          principalDid: iss,
          publicKeyMultibase: public_key_multibase,
          representationJwt: signed_representation_jwt,
        })
        .where(eq(registrarBindings.id, existing[0].id));
    } else {
      await db.insert(registrarBindings).values({
        tenantId: tenantDb.tenantId,
        domain,
        ownerLabel: owner_label,
        registrar: 'agentid',
        principalDid: iss,
        publicKeyMultibase: public_key_multibase,
        representationJwt: signed_representation_jwt,
      });
    }
    if (registration) {
      await tenantDb.updateRegistration(registration.id, { status: 'active', ownerLabel: owner_label });
    }
    track({
      distinctId: session.principalDid,
      event: 'agentid_owner_verified',
      properties: { tenant_id: tenantDb.tenantId, domain, owner_label },
    });
    return NextResponse.json({ ok: true, domain, owner_label, agent_did: agentDid, status: registration ? 'active' : 'bound' });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[registrar/bind-owner]', err);
    return NextResponse.json({ error: 'internal', message: 'Ownership could not be saved. Please try again.' }, { status: 500 });
  }
}
