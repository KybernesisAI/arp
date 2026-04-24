/**
 * GET /onboard?domain=<sld>&registrar=<name>&callback=<url-encoded-url>
 *
 * v2.1 TLD integration spec §4 Option A entry point. A registrar (Headless or
 * any other speaking v2.1) redirects the buyer's browser here after they pick
 * "Use ARP Cloud account" in the owner-binding step. We run the same
 * browser-held `did:key` onboarding as `/onboarding`, then on success redirect
 * back to the registrar's callback with the principal DID + signed
 * representation JWT.
 *
 * Public, unauthenticated surface. Rate-limited in production (Task 8 hard rule).
 * Server-side persistence in `onboarding_sessions` lets a tab-closed mid-flow
 * user reconcile on next login without losing the registrar context.
 */

import type * as React from 'react';
import { getDb } from '@/lib/db';
import { onboardingSessions } from '@kybernesis/arp-cloud-db';
import OnboardRedirectForm from './OnboardRedirectForm';
import { PlateHead, Container, Section, Code } from '@/components/ui';

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

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  const sp = await searchParams;
  const validated = validateParams(sp);

  if ('reason' in validated) {
    return (
      <Section>
        <Container>
          <PlateHead
            plateNum="O.01"
            kicker="// ONBOARD · INVALID REQUEST"
            title="This onboarding link is malformed."
          />
          <p className="text-body text-ink-2 max-w-[640px]">
            The registrar sent a <Code>/onboard</Code> link with a bad{' '}
            <Code>{validated.field}</Code> parameter: {validated.reason}.
          </p>
          <p className="text-body text-ink-2 max-w-[640px] mt-4">
            Return to the registrar and retry. If this keeps happening, the registrar needs to
            update their v2.1 TLD integration.
          </p>
        </Container>
      </Section>
    );
  }

  const sessionId = await createSession(validated);

  return (
    <Section>
      <Container>
        <PlateHead
          plateNum="O.01"
          kicker={`// ONBOARD · ${validated.registrar.toUpperCase()} · ${validated.domain.toUpperCase()}`}
          title="Bind ARP Cloud to your new .agent domain."
        />
        <div className="max-w-[720px]">
          <p className="text-body-lg text-ink-2 mb-6">
            You clicked &quot;Use ARP Cloud account&quot; from your registrar. We&apos;ll create
            your agent-owner identity in this browser, then hand the signed binding back to your
            registrar so they can complete your domain setup.
          </p>
          <p className="text-body text-ink-2 mb-8">
            Your keys stay in this browser. We never see them.
          </p>
          <OnboardRedirectForm
            sessionId={sessionId}
            domain={validated.domain}
            registrar={validated.registrar}
            callback={validated.callback}
          />
        </div>
      </Container>
    </Section>
  );
}
