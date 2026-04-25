import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await new RuntimeClient().listWebauthnCredentials();
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: 'list_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
