/**
 * PATCH + DELETE /api/webauthn/credentials/:id — Phase 9e credential management.
 *
 * Session-authed; tenant-scoped via TenantDb. Exposes the minimal surface
 * needed for the dashboard /settings page:
 *
 *   PATCH  — rename (nickname only; counter, public key, transports are
 *            never user-editable).
 *   DELETE — remove a registered passkey. REFUSES to remove the last
 *            credential on the tenant — the user would be locked out
 *            (v2 identity rotation can recover via recovery phrase, but
 *            the UX is a cliff; we guard up front).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import {
  countCredentialsForTenant,
  deleteCredentialForTenant,
  renameCredentialForTenant,
} from '@/lib/webauthn';

export const runtime = 'nodejs';

const PatchBody = z.object({
  nickname: z.string().trim().min(1).max(64).nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 });
    }

    const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'bad_request', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const updated = await renameCredentialForTenant(
      tenantDb.tenantId,
      id,
      parsed.data.nickname,
    );
    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      id: updated.id,
      nickname: updated.nickname,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'bad_id' }, { status: 400 });
    }

    // Refuse to remove the last credential on the tenant. The tenant still
    // has the browser-held did:key + recovery phrase, but removing the last
    // passkey means the only sign-in path is "import recovery phrase into
    // a new browser" — which is a cliff. Force the user to register a
    // replacement passkey first.
    const total = await countCredentialsForTenant(tenantDb.tenantId);
    if (total <= 1) {
      return NextResponse.json(
        { error: 'cannot_delete_last_credential' },
        { status: 400 },
      );
    }

    const removed = await deleteCredentialForTenant(tenantDb.tenantId, id);
    if (!removed) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
