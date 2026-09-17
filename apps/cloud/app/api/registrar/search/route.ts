/**
 * GET /api/registrar/search?q=<name>
 *
 * Availability + our price for a `.agent` name. Session-authed and
 * rate-limited per tenant (the upstream lookup is 60/min/IP, so we stay
 * well under it per user). Never returns upstream detail.
 */

import { NextResponse } from 'next/server';
import { AuthError, requireTenantDb } from '@/lib/tenant-context';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { posthog } from '@/lib/posthog';
import { RegistrarError, searchName } from '@/lib/registrar';
import { headlessFromEnv, registrarEnv } from '@/lib/registrar-server';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  try {
    const { tenantDb } = await requireTenantDb();
    const q = new URL(req.url).searchParams.get('q') ?? '';
    if (q.trim().length === 0) {
      return NextResponse.json({ error: 'bad_request', message: 'q is required' }, { status: 400 });
    }
    const rl = await checkRateLimit({
      bucket: `registrar-search:tenant:${tenantDb.tenantId}`,
      windowSeconds: 60,
      limit: 30,
    });
    if (!rl.ok) return rateLimitedResponse(rl.retryAfter);

    const result = await searchName({ query: q, headless: headlessFromEnv(), env: registrarEnv() });
    return NextResponse.json({
      sld: result.sld,
      domain: result.domain,
      available: result.available,
      reason: result.reason,
      price_cents_per_year: result.priceCentsPerYear,
      max_years: result.maxYears,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof RegistrarError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    posthog.captureException(err);
    console.error('[registrar/search]', err);
    return NextResponse.json(
      { error: 'registry_unavailable', message: 'Name registry is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
