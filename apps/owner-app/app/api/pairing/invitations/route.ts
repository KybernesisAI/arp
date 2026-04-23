import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createPairingProposal,
  buildInvitationUrl,
} from '@kybernesis/arp-pairing';
import { BUNDLES } from '@kybernesis/arp-scope-catalog';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';
import { getScopeCatalog } from '@/lib/catalog';

const Body = z.object({
  issuer: z.string().min(1),
  subject: z.string().min(1),
  audience: z.string().min(1),
  purpose: z.string().min(1),
  bundleId: z.string().min(1),
  expiresDays: z.number().int().min(1).max(365),
  requiredVcs: z.array(z.string()).default([]),
  scopeCatalogVersion: z.string().min(1),
  ownerAppBaseUrl: z.string().url(),
  issuerPrivateKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const bundle = BUNDLES.find((b) => b.id === input.bundleId);
  if (!bundle) {
    return NextResponse.json({ error: 'unknown_bundle' }, { status: 400 });
  }
  const scopeSelections = bundle.scopes.map((s) => {
    const normalizedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s.params ?? {})) {
      // <user-picks> sentinels get substituted with a stable placeholder; in
      // production the UI collects these before hitting this endpoint.
      normalizedParams[k] = v === '<user-picks>' ? `<${k}>` : v;
    }
    return { id: s.id, params: normalizedParams };
  });

  const privateKey = new Uint8Array(
    Buffer.from(input.issuerPrivateKeyHex, 'hex'),
  );
  const expiresAt = new Date(
    Date.now() + input.expiresDays * 86_400_000,
  ).toISOString();

  const proposal = await createPairingProposal({
    issuer: input.issuer,
    subject: input.subject,
    audience: input.audience,
    purpose: input.purpose,
    scopeSelections,
    requiredVcs: input.requiredVcs,
    expiresAt,
    scopeCatalogVersion: input.scopeCatalogVersion,
    catalog: getScopeCatalog(),
    issuerKey: { privateKey, kid: `${input.issuer}#key-1` },
  });

  const invitationUrl = buildInvitationUrl(
    proposal,
    `${input.ownerAppBaseUrl.replace(/\/$/, '')}/pair/accept`,
  );

  const client = new RuntimeClient();
  await client.storeInvitation(proposal, invitationUrl);

  return NextResponse.json({
    connectionId: proposal.connection_id,
    proposalId: proposal.proposal_id,
    invitationUrl,
    proposal,
  });
}

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = new RuntimeClient();
  return NextResponse.json(await client.listPendingInvitations());
}
