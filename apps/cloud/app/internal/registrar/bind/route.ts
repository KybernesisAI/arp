/**
 * POST /internal/registrar/bind — v2.1 TLD registrar callback receiver.
 *
 * A PSK-gated server-to-server endpoint. A registrar (Headless or any future
 * v2.1-conformant registrar) posts here after publishing the
 * `_principal.<owner>.<domain>` TXT record + hosting the representation JWT,
 * so we can mirror the binding into our tenant DB and reconcile the
 * `/onboard` flow.
 *
 * Auth: Bearer <ARP_CLOUD_REGISTRAR_PSK>. Constant-time compared. In
 * production the PSK rotates at launch; interim value is delivered
 * out-of-band to the registrar (v2.1 §7).
 *
 * Tenant scoping: unscoped insert. The registrar callback is not a user
 * session; it arrives on behalf of a principal who may or may not already
 * have a tenant row. When the principal DID already maps to a tenant we link
 * the binding; otherwise `tenant_id` stays NULL and the next login
 * reconciles.
 */

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { registrarBindings, tenants } from '@kybernesis/arp-cloud-db';
import { getDb } from '@/lib/db';
import {
  checkDualRateLimit,
  clientIpFromRequest,
  rateLimitedResponse,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

const DID_REGEX = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;
const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const OWNER_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const REGISTRAR_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

const Body = z.object({
  domain: z.string().refine((d) => DOMAIN_REGEX.test(d.toLowerCase()), {
    message: 'invalid domain',
  }),
  owner_label: z.string().refine((o) => OWNER_LABEL_REGEX.test(o.toLowerCase()), {
    message: 'invalid owner_label',
  }),
  principal_did: z.string().regex(DID_REGEX),
  public_key_multibase: z.string().startsWith('z').min(2),
  representation_jwt: z
    .string()
    .refine((s) => s.split('.').length === 3, { message: 'not a compact JWS' }),
  // Optional: registrar identifier. Defaults to 'headless' (the only v2.1
  // registrar as of Phase 9b launch). Future slices can switch to a
  // per-registrar PSK map.
  registrar: z
    .string()
    .regex(REGISTRAR_REGEX)
    .optional(),
});

function verifyPsk(req: Request): boolean {
  const expected = process.env['ARP_CLOUD_REGISTRAR_PSK'];
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return false;
  const supplied = (match[1] ?? '').trim();
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  // Rate-limit BEFORE PSK check so a flood of wrong-PSK attempts counts
  // toward the attacker's IP budget. 60/min burst, 600/hour sustained —
  // registrars legitimately bulk-register during domain campaigns, so this
  // is looser than the browser-facing routes.
  const ip = clientIpFromRequest(req);
  const limitResult = await checkDualRateLimit(
    `registrar-bind:ip:${ip}`,
    { windowSeconds: 60, limit: 60 },
    { windowSeconds: 3600, limit: 600 },
  );
  if (!limitResult.ok) {
    return rateLimitedResponse(limitResult.retryAfter);
  }
  if (!verifyPsk(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const registrar = (body.registrar ?? 'headless').toLowerCase();
  const domain = body.domain.toLowerCase();
  const ownerLabel = body.owner_label.toLowerCase();

  const db = await getDb();

  // Resolve tenant by principal DID. Nullable; the callback may land
  // before the user has completed /onboard.
  //
  // Two lookup paths:
  //   1. Cloud-managed alias `did:web:cloud.arp.run:u:<uuid>` — the UUID
  //      IS the tenant id; look up by primary key directly so the
  //      registrar-side principal DID format doesn't have to match the
  //      tenants table's stored principal_did (which is the user's
  //      browser-held did:key).
  //   2. Otherwise fall back to exact-match on principal_did string —
  //      that path catches sidecar-hosted agents where the bound
  //      principal IS the tenant's stored DID.
  let tenantId: string | null = null;
  const cloudAliasMatch = body.principal_did.match(
    /^did:web:cloud\.arp\.run:u:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );
  if (cloudAliasMatch) {
    const candidateId = cloudAliasMatch[1]!;
    const byId = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, candidateId))
      .limit(1);
    tenantId = byId[0]?.id ?? null;
  }
  if (!tenantId) {
    const tenantRows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.principalDid, body.principal_did))
      .limit(1);
    tenantId = tenantRows[0]?.id ?? null;
  }

  // Upsert on (domain, owner_label). A re-bind (e.g. owner rotates to a new
  // principal DID) overwrites previous values. Explicit SET list — a naked
  // `set: {}` clause would be a no-op.
  const rows = await db
    .insert(registrarBindings)
    .values({
      domain,
      ownerLabel,
      registrar,
      principalDid: body.principal_did,
      publicKeyMultibase: body.public_key_multibase,
      representationJwt: body.representation_jwt,
      tenantId,
    })
    .onConflictDoUpdate({
      target: [registrarBindings.domain, registrarBindings.ownerLabel],
      set: {
        registrar,
        principalDid: body.principal_did,
        publicKeyMultibase: body.public_key_multibase,
        representationJwt: body.representation_jwt,
        tenantId,
      },
    })
    .returning({ id: registrarBindings.id });

  const id = rows[0]?.id;
  if (!id) {
    return NextResponse.json({ error: 'bind_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tenant_id: tenantId, binding_id: id });
}
