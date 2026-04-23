import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = new RuntimeClient();
  const data = await client.listConnections();
  return NextResponse.json(data);
}
