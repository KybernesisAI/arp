import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  countersignProposal,
  PairingProposalSchema,
} from '@kybernesis/arp-pairing';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';
import { getScopeCatalog } from '@/lib/catalog';

const Body = z.object({
  proposal: PairingProposalSchema,
  counterpartyDid: z.string().min(1),
  counterpartyPrivateKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/),
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

  const privateKey = new Uint8Array(
    Buffer.from(input.counterpartyPrivateKeyHex, 'hex'),
  );

  try {
    const { token } = await countersignProposal({
      proposal: input.proposal,
      counterpartyKey: {
        privateKey,
        kid: `${input.counterpartyDid}#key-1`,
      },
      counterpartyDid: input.counterpartyDid,
      catalog: getScopeCatalog(),
    });

    const client = new RuntimeClient();
    await client.acceptPairing(token);

    return NextResponse.json({
      ok: true,
      connectionId: token.connection_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'countersign_failed', reason: (err as Error).message },
      { status: 400 },
    );
  }
}
