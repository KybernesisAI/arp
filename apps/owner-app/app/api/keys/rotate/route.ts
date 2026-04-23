import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const e = env();
  const res = await fetch(`${e.ARP_RUNTIME_URL}/admin/keys/rotate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${e.ARP_ADMIN_TOKEN}` },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
