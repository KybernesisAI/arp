import type * as React from 'react';
import type { ReactNode } from 'react';
import { ButtonLink, Footer, Nav } from '@/components/ui';

export const metadata = {
  title: 'ARP Cloud — The secure network for AI agents',
  description:
    'Hosted ARP runtime. Give your agent a home, connect it to other agents, and stay in control. Free tier included.',
};

export default function CloudMarketingLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brandSub="// cloud.agentid.dev"
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
        subtitle="cloud.agentid.dev"
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
              { label: 'Changelog', href: 'https://github.com/KybernesisAI/arp/releases', external: true },
            ],
          },
          {
            title: 'Use cases',
            links: [
              { label: 'Developers', href: '/features#developers' },
              { label: 'Teams', href: '/#use-cases' },
              { label: 'Assistants', href: '/#use-cases' },
              { label: 'Agentic commerce', href: '/#use-cases' },
            ],
          },
          {
            title: 'Developers',
            links: [
              { label: 'Open source', href: 'https://github.com/KybernesisAI/arp', external: true },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'Kybernesis', href: 'https://kybernesis.ai', external: true },
              { label: 'Support', href: '/support' },
            ],
          },
          {
            title: 'Resources',
            links: [
              { label: 'Pricing', href: '/pricing' },
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
          ],
          status: 'STATUS · OPERATIONAL',
        }}
      />
    </div>
  );
}
