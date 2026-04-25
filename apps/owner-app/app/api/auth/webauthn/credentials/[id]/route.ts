import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

interface PatchBody {
  nickname?: string | null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: PatchBody = {};
  try {
    body = (await req.json().catch(() => ({}))) as PatchBody;
  } catch {
    /* tolerate empty */
  }
  const nickname =
    typeof body.nickname === 'string' || body.nickname === null
      ? (body.nickname as string | null)
      : null;
  try {
    const result = await new RuntimeClient().renameWebauthnCredential(id, nickname);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'rename_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await new RuntimeClient().deleteWebauthnCredential(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    const status = /409/.test(msg) ? 409 : 502;
    return NextResponse.json(
      { error: 'delete_failed', reason: msg },
      { status },
    );
  }
}
