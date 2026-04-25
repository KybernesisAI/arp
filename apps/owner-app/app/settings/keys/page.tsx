import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnerAppShell } from '@/components/OwnerAppShell';
import { env } from '@/lib/env';
import { getSession } from '@/lib/session';
import { KeysPanel } from './KeysPanel';

export const dynamic = 'force-dynamic';

export default async function KeysPage() {
  if (!(await getSession())) redirect('/login');
  const e = env();
  return (
    <OwnerAppShell>
      <div className="mb-4">
        <Link href="/settings" className="text-xs">
          ← Settings
        </Link>
        <h2 className="mt-2 font-display text-h3 font-medium text-ink">Keys</h2>
      </div>
      <KeysPanel agentDid={e.ARP_AGENT_DID} />
    </OwnerAppShell>
  );
}
