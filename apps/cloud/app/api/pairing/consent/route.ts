/**
 * POST /api/pairing/consent — projection helper for /pair/accept.
 *
 * Consent rendering (`@kybernesis/arp-consent-ui::renderProposalConsent`)
 * reads the scope catalog via fs — not safe to run in a client bundle — so
 * the accept page posts the signed proposal here and gets back a `ConsentView`
 * suitable for rendering.
 *
 * Session-authed so anonymous callers can't probe the catalog.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PairingProposalSchema } from '@kybernesis/arp-pairing';
import { renderProposalConsent } from '@kybernesis/arp-consent-ui';
import { requireTenantDb, AuthError } from '@/lib/tenant-context';
import { getScopeCatalog } from '@/lib/catalog';

export const runtime = 'nodejs';

const Body = z.object({
  proposal: PairingProposalSchema,
});

export async function POST(req: Request): Promise<Response> {
  try {
    await requireTenantDb();
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    const view = renderProposalConsent(parsed.data.proposal, getScopeCatalog());
    return NextResponse.json({ view });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
