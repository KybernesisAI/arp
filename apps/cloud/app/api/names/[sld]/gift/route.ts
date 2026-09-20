/**
 * /api/names/[sld]/gift — give a name to someone else.
 *
 *   POST   { message? }  → create a gift link (cancels any earlier pending one)
 *   GET                  → the pending link's metadata (never the token)
 *   DELETE               → cancel the pending link
 *
 * Owner session only. The link itself is returned once, at creation.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { cancelGift, createGift, GiftError, pendingGiftFor } from '@/lib/name-gifts';
import { posthog, track } from '@/lib/posthog';

export const runtime = 'nodejs';

const SLD = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const Body = z.object({ message: z.string().max(280).optional() });

function sldFrom(raw: string): string | null {
  const sld = decodeURIComponent(raw).toLowerCase().replace(/\.agent$/, '');
  return SLD.test(sld) ? sld : null;
}

function baseUrlFrom(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

function fail(err: unknown, where: string): Response {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof GiftError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  posthog.captureException(err);
  console.error(`[names/gift ${where}]`, err);
  return NextResponse.json({ error: 'internal', message: 'Something went wrong. Please try again.' }, { status: 500 });
}

export async function POST(req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { tenantDb, session, db } = await requireTenantDb();
    const sld = sldFrom((await ctx.params).sld);
    if (!sld) return NextResponse.json({ error: 'bad_request', message: 'Not a valid name.' }, { status: 400 });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    const { row, url } = await createGift({ db, fromTenantId: tenantDb.tenantId, sld, message: parsed.data.message ?? null, baseUrl: baseUrlFrom(req) });
    track({ distinctId: session.principalDid, event: 'agentid_name_gift_created', properties: { tenant_id: tenantDb.tenantId, domain: row.domain } });
    return NextResponse.json({ ok: true, url, domain: row.domain, expires_at: row.expiresAt.toISOString() });
  } catch (err) {
    return fail(err, 'POST');
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { tenantDb, db } = await requireTenantDb();
    const sld = sldFrom((await ctx.params).sld);
    if (!sld) return NextResponse.json({ error: 'bad_request', message: 'Not a valid name.' }, { status: 400 });
    const row = await pendingGiftFor(db, tenantDb.tenantId, `${sld}.agent`);
    return NextResponse.json({ pending: row ? { created_at: row.createdAt.toISOString(), expires_at: row.expiresAt.toISOString(), message: row.message } : null });
  } catch (err) {
    return fail(err, 'GET');
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ sld: string }> }): Promise<Response> {
  try {
    const { tenantDb, session, db } = await requireTenantDb();
    const sld = sldFrom((await ctx.params).sld);
    if (!sld) return NextResponse.json({ error: 'bad_request', message: 'Not a valid name.' }, { status: 400 });
    const cancelled = await cancelGift(db, tenantDb.tenantId, sld);
    if (cancelled) track({ distinctId: session.principalDid, event: 'agentid_name_gift_cancelled', properties: { tenant_id: tenantDb.tenantId, domain: `${sld}.agent` } });
    return NextResponse.json({ ok: true, cancelled });
  } catch (err) {
    return fail(err, 'DELETE');
  }
}
