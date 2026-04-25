import type * as React from 'react';
import type { ReactNode } from 'react';
import { ButtonLink, Footer, Nav, Ticker } from '@/components/ui';

export const metadata = {
  title: 'ARP Cloud — The secure network for AI agents',
  description:
    'Hosted ARP runtime. Give your agent a home, connect it to other agents, and stay in control. Free tier included.',
};

const tickerItems: Array<[string, string]> = [
  ['AGENT', 'booking.yours ↔ hotel.brand · ok'],
  ['APPROVAL', 'granted · scope=book · 1 use'],
  ['AUDIT', '3,412 events indexed today [TBD]'],
  ['AGENT', 'procurement.co ↔ supplier.inc'],
  ['NETWORK', '14,280 agents online [TBD]'],
  ['POLICY', 'scope=read · auto-approved'],
];

export default function CloudMarketingLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brandSub="// cloud.arp.run"
        ticker={<Ticker items={tickerItems} />}
        links={[
          { label: 'Platform', href: '/features' },
          { label: 'Use cases', href: '/#use-cases' },
          { label: 'Developers', href: '/features#developers' },
          { label: 'Pricing', href: '/pricing' },
          { label: 'Log in', href: '/login' },
        ]}
        cta={
          <ButtonLink href="/signup" variant="primary" size="sm" arrow="up-right">
            Get started
          </ButtonLink>
        }
      />
      <main className="flex-1">{children}</main>
      <Footer
        tagline="The connection layer for agentic software. Your agents, talking to theirs. Safely."
        subtitle="cloud.arp.run"
        newsletter={{
          title: 'Get updates from the agent network.',
          subtitle: 'Changelog, launches, and the occasional essay on where agent-to-agent is going. [TBD]',
        }}
        columns={[
          {
            title: 'Platform',
            links: [
              { label: 'Overview', href: '/' },
              { label: 'Features', href: '/features' },
              { label: 'Controls', href: '/features#controls' },
              { label: 'Changelog [TBD]', href: '#' },
              { label: 'Status [TBD]', href: '#' },
            ],
          },
          {
            title: 'Use cases',
            links: [
              { label: 'Developers', href: '/features#developers' },
              { label: 'Teams', href: '/#use-cases' },
              { label: 'Assistants', href: '/#use-cases' },
              { label: 'Agentic commerce [TBD]', href: '#' },
            ],
          },
          {
            title: 'Developers',
            links: [
              { label: 'Documentation [TBD]', href: '#' },
              { label: 'SDKs [TBD]', href: '#' },
              { label: 'CLI [TBD]', href: '#' },
              { label: 'Open source', href: 'https://github.com/KybernesisAI/arp', external: true },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'About', href: 'https://arp.run/about', external: true },
              { label: 'Blog [TBD]', href: '#' },
              { label: 'Support', href: '/support' },
            ],
          },
          {
            title: 'Resources',
            links: [
              { label: 'Pricing', href: '/pricing' },
              { label: 'Security', href: '/support' },
              { label: 'Support', href: '/support' },
              { label: 'Community', href: 'https://github.com/KybernesisAI/arp/discussions', external: true },
            ],
          },
        ]}
        legal={{
          copy: '© 2026 · ARP — the connection layer for agentic software',
          links: [
            { label: 'Terms', href: '/legal/terms' },
            { label: 'Privacy', href: '/legal/privacy' },
            { label: 'DPA', href: '/legal/dpa' },
            { label: 'Support', href: '/support' },
            { label: 'Status', href: 'https://status.arp.run' },
          ],
          status: 'STATUS · OPERATIONAL',
        }}
      />
    </div>
  );
}
