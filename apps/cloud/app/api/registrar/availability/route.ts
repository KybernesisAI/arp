/**
 * GET /api/registrar/availability?q=<name>   (public)
 *
 * Name availability for the lander's hero search. No session: rate-limited
 * per client IP (the upstream lookup is 60/min/IP, we stay well under).
 * Returns the same shape as the authenticated search, minus tenant context.
 */

import { NextResponse } from 'next/server';
import { RegistrarError, searchName } from '@/lib/registrar';
import { headlessFromEnv, registrarEnv } from '@/lib/registrar-server';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams.get('q') ?? '';
    if (q.trim().length === 0) return NextResponse.json({ error: 'bad_request', message: 'q is required' }, { status: 400 });
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0]!.trim();
    const rl = await checkRateLimit({ bucket: `registrar-availability:ip:${ip}`, windowSeconds: 60, limit: 20 });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);
    const result = await searchName({ query: q, headless: headlessFromEnv(), env: registrarEnv() });
    return NextResponse.json(
      { sld: result.sld, domain: result.domain, available: result.available, reason: result.reason, price_cents_per_year: result.priceCentsPerYear },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    if (err instanceof RegistrarError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    posthog.captureException(err);
    console.error('[registrar/availability]', err);
    return NextResponse.json({ error: 'registry_unavailable', message: 'Name registry is temporarily unavailable.' }, { status: 503 });
  }
}
