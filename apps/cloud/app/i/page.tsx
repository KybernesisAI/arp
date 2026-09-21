import type * as React from 'react';
import { ConsoleShell } from '@/components/app/ConsoleShell';
import { ShortLinkClient } from './ShortLinkClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /i#<token> — short pairing-invitation link. The token rides in the URL
 * fragment (never in server logs); the client trades it for the signed
 * invitation and continues to the normal accept screen.
 */
export default function ShortInvitationPage(): React.JSX.Element {
  return (
    <ConsoleShell active="pair">
      <ShortLinkClient />
    </ConsoleShell>
  );
}
