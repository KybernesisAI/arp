import Link from 'next/link';
import { env } from '@/lib/env';
import { formatAgentName } from '@/lib/format';
import { LogoutButton } from './LogoutButton';

export function Header() {
  const e = env();
  return (
    <header className="mb-8 flex items-center justify-between border-b border-arp-border pb-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-arp-muted">
          {e.ARP_PRINCIPAL_DID}
        </div>
        <h1 className="text-xl font-semibold text-arp-text">
          {formatAgentName(e.ARP_AGENT_DID)}
        </h1>
      </div>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/">Connections</Link>
        <Link href="/pair">Pair</Link>
        <Link href="/settings">Settings</Link>
        <LogoutButton />
      </nav>
    </header>
  );
}
