import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { RuntimeClient } from '@/lib/runtime-client';

export const runtime = 'nodejs';

interface VerifyBody {
  response: unknown;
  nickname?: string | null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || !body.response) {
    return NextResponse.json({ error: 'missing_response' }, { status: 400 });
  }
  try {
    const result = await new RuntimeClient().webauthnRegisterVerify({
      response: body.response,
      nickname: typeof body.nickname === 'string' ? body.nickname : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'register_verify_failed', reason: (err as Error).message },
      { status: 502 },
    );
  }
}
