import type * as React from 'react';
import { getSession } from '@/lib/session';
import { AppShell } from '@/components/app/AppShell';
import { PlateHead } from '@/components/ui';
import { GiftClient } from './GiftClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /gift — accept a name someone gave you.
 *
 * The gift token rides in the URL fragment (`#<token>`), so the server never
 * sees it and a server-side redirect would drop it. Like /pair/accept, the
 * auth gate lives on the client: GiftClient reads the hash, previews the
 * gift, and bounces to login/onboarding with `?next=/gift#<token>` when the
 * visitor is not signed in yet.
 */
export default async function GiftPage(): Promise<React.JSX.Element> {
  const session = await getSession();
  return (
    <AppShell>
      <PlateHead plateNum="G.01" kicker="// A NAME FOR YOU" title="You've been given a name." />
      <GiftClient principalDid={session?.principalDid ?? null} hasTenant={Boolean(session?.tenantId)} />
    </AppShell>
  );
}
