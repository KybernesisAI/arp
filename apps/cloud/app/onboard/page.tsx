/**
 * GET /onboard?domain=<sld>&registrar=<name>&callback=<url-encoded-url>
 *
 * v2.1 TLD integration spec §4 Option A entry point. A registrar (Headless or
 * any other speaking v2.1) redirects the buyer's browser here after they pick
 * "Use AgentID account" in the owner-binding step. We run the same
 * browser-held `did:key` onboarding as `/onboarding`, then on success redirect
 * back to the registrar's callback with the principal DID + signed
 * representation JWT.
 *
 * Public, unauthenticated surface. Rate-limited in production (Task 8 hard rule).
 * Server-side persistence in `onboarding_sessions` lets a tab-closed mid-flow
 * user reconcile on next login without losing the registrar context.
 */

import type * as React from 'react';
import { headers } from 'next/headers';
import { getDb } from '@/lib/db';
import { onboardingSessions } from '@kybernesis/arp-cloud-db';
import { checkDualRateLimit } from '@/lib/rate-limit';
import { AuthShell } from '@/components/app/AuthShell';
import { Kicker } from '@/app/lander/ui';
import OnboardRedirectForm from './OnboardRedirectForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DOMAIN_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REGISTRAR_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const ONE_HOUR_MS = 60 * 60 * 1000;

interface ValidatedParams {
  domain: string;
  registrar: string;
  callback: string;
}

interface ParamError {
  field: 'domain' | 'registrar' | 'callback';
  reason: string;
}

function validateParams(
  sp: Record<string, string | string[] | undefined>,
): ValidatedParams | ParamError {
  const pick = (k: string): string | null => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };
  const domainRaw = pick('domain');
  const registrarRaw = pick('registrar');
  const callbackRaw = pick('callback');
  if (!domainRaw) return { field: 'domain', reason: 'missing' };
  if (!DOMAIN_REGEX.test(domainRaw.toLowerCase())) {
    return { field: 'domain', reason: 'not a valid domain label' };
  }
  if (!registrarRaw) return { field: 'registrar', reason: 'missing' };
  if (!REGISTRAR_REGEX.test(registrarRaw)) {
    return { field: 'registrar', reason: 'must match [a-z0-9][a-z0-9._-]{0,63}' };
  }
  if (!callbackRaw) return { field: 'callback', reason: 'missing' };
  let cb: URL;
  try {
    cb = new URL(callbackRaw);
  } catch {
    return { field: 'callback', reason: 'not a valid URL' };
  }
  if (cb.protocol !== 'https:' && cb.protocol !== 'http:') {
    return { field: 'callback', reason: 'must be http(s)://' };
  }
  return {
    domain: domainRaw.toLowerCase(),
    registrar: registrarRaw.toLowerCase(),
    callback: cb.toString(),
  };
}

async function createSession(params: ValidatedParams): Promise<string> {
  const db = await getDb();
  const rows = await db
    .insert(onboardingSessions)
    .values({
      domain: params.domain,
      registrar: params.registrar,
      callbackUrl: params.callback,
      expiresAt: new Date(Date.now() + ONE_HOUR_MS),
    })
    .returning({ id: onboardingSessions.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create onboarding session');
  return id;
}

function clientIpFromHeaders(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

const OTHER = { label: 'Log in', href: '/cloud/login' };

function Head({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <header className="mb-10 max-w-[60ch]">
      <Kicker>{kicker}</Kicker>
      <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">{title}</h1>
      <div className="mt-4 space-y-3 text-[16px] text-zinc-600">{children}</div>
    </header>
  );
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;

  // Rate-limit: 10/min burst, 100/hour sustained. Keyed by client IP
  // (x-forwarded-for; Vercel sets this). Keeps automated scrapers from
  // hammering the onboarding_sessions table. Happens before param validation
  // so malformed bursts also count.
  const ip = clientIpFromHeaders(await headers());
  const limitResult = await checkDualRateLimit(
    `onboard:ip:${ip}`,
    { windowSeconds: 60, limit: 10 },
    { windowSeconds: 3600, limit: 100 },
  );
  if (!limitResult.ok) {
    return (
      <AuthShell other={OTHER}>
        <Head kicker="Finish setup" title="Too many attempts.">
          <p>
            We are pacing new accounts to keep things running smoothly. Please wait about{' '}
            {limitResult.retryAfter} seconds and try again.
          </p>
        </Head>
      </AuthShell>
    );
  }

  const validated = validateParams(sp);

  if ('reason' in validated) {
    return (
      <AuthShell other={OTHER}>
        <Head kicker="Finish setup" title="This setup link is not valid.">
          <p>
            Go back to where you bought your name and try the setup step again. If this keeps
            happening, tell them the link they sent is incomplete.
          </p>
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-500">
            Detail · {validated.field} · {validated.reason}
          </p>
        </Head>
      </AuthShell>
    );
  }

  const sessionId = await createSession(validated);

  return (
    <AuthShell other={OTHER}>
      <Head kicker="Finish setup" title={`Finish setting up ${validated.domain}.`}>
        <p>
          You chose to use an AgentID account for your new name. We will create your account in this
          browser, then send a signed confirmation back so your name can be finished.
        </p>
        <p>Your key stays in this browser. We never see it.</p>
      </Head>
      <OnboardRedirectForm
        sessionId={sessionId}
        domain={validated.domain}
        registrar={validated.registrar}
        callback={validated.callback}
      />
    </AuthShell>
  );
}
