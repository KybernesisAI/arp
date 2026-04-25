import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

const Body = z.object({
  new_principal_did: z.string().min(1),
  new_public_key_multibase: z.string().min(1),
});

/**
 * Phase-10/10d HKDF v1→v2 rotation. Session-authed proxy for the
 * sidecar's `POST /admin/identity/rotate`. The browser derives the new
 * key locally (via `principal-key-browser::rotateToV2`), submits the new
 * DID + multibase, and the sidecar promotes the new principal while
 * keeping the old verification method published in the DID doc for the
 * 90-day grace window.
 */
export async function POST(req: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  try {
    const result = await new RuntimeClient().rotateIdentity({
      new_principal_did: parsed.data.new_principal_did,
      new_public_key_multibase: parsed.data.new_public_key_multibase,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'rotate_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
