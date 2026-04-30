import type * as React from 'react';
import { getSession } from '@/lib/session';
import { AppShell } from '@/components/app/AppShell';
import { PlateHead } from '@/components/ui';
import { AcceptClient } from './AcceptClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /pair/accept — consume a pairing invitation URL.
 *
 * The signed proposal rides in the URL fragment (`#<b64url>`) so the server
 * cannot read it from `req.url`. CRITICAL: server-side `redirect()` STRIPS
 * the fragment (browsers don't forward hashes through 3xx hops), so the
 * auth gate has to live on the client. AcceptClient captures
 * `window.location.hash` first, then bounces to /cloud/login with the
 * hash baked into `?next=` if there's no session. After login, the user
 * lands back here with the fragment intact.
 *
 * The server-rendered shell stays minimal so it works for both signed-in
 * and signed-out visitors — AcceptClient handles all the conditional
 * UI (consent screen, login bounce, onboarding bounce, error states).
 */
export default async function AcceptInvitationPage(): Promise<React.JSX.Element> {
  const session = await getSession();

  return (
    <AppShell>
      <PlateHead
        plateNum="P.02"
        kicker="// CONNECTION INVITE · REVIEW + ACCEPT"
        title="Review pairing invitation"
      />
      <AcceptClient
        principalDid={session?.principalDid ?? null}
        hasTenant={Boolean(session?.tenantId)}
      />
    </AppShell>
  );
}
