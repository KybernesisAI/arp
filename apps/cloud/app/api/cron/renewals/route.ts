/**
 * GET /api/cron/renewals — daily. Sends the 30/7/1-day renewal reminders,
 * once each per period. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { sendRenewalReminders } from '@/lib/renewals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env['CRON_SECRET'];
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await sendRenewalReminders(await getDb(), { opsEmail: env().OPS_EMAIL });
  return NextResponse.json({ ok: true, ...result });
}
