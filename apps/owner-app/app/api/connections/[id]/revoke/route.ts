import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    reason?: string;
  };
  const client = new RuntimeClient();
  await client.revokeConnection(id, body.reason);
  return NextResponse.json({ ok: true });
}
