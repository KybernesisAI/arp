import type * as React from 'react';
import { redirect } from 'next/navigation';
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
 * cannot read it from `req.url`. A thin server component checks the session
 * and hands off to the `AcceptClient` component which:
 *   1. Reads `window.location.hash`.
 *   2. Decodes + renders the consent screen via
 *      `@kybernesis/arp-consent-ui::renderProposalConsent`.
 *   3. On approve, countersigns with the browser principal key + POSTs to
 *      `/api/pairing/accept`.
 */
export default async function AcceptInvitationPage(): Promise<React.JSX.Element> {
  const session = await getSession();
  if (!session) {
    // Preserve the URL fragment across the sign-in round-trip. Redirect to
    // the cloud login page with `next=/pair/accept` so the fragment survives
    // the redirect (hash persists across window.location changes within the
    // same origin).
    redirect('/cloud/login?next=/pair/accept');
  }
  if (!session.tenantId) {
    redirect('/onboarding');
  }

  return (
    <AppShell>
      <PlateHead
        plateNum="P.02"
        kicker="// CONNECTION INVITE · REVIEW + ACCEPT"
        title="Review pairing invitation"
      />
      <AcceptClient principalDid={session.principalDid} />
    </AppShell>
  );
}
