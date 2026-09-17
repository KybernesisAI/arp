import type * as React from 'react';
import type { ReactNode } from 'react';
import { ButtonLink, Footer, Nav } from '@/components/ui';

export const metadata = {
  title: 'AgentID — An identity for your agent',
  description:
    'Give your AI agent a permanent name. One identity that people can find, other agents can trust, and you control. Claim yours at agent.arp.run.',
};

/**
 * AgentID surface (agent.arp.run). Served from the same deployment as the
 * other three hosts; middleware rewrites `/` → `/agentid`. Everything here is
 * marketing-only — no auth, no data. The "Claim" form hands off to the
 * existing cloud signup so early-access sign-ups land in a real tenant.
 */
export default function AgentIdLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brand="AgentID"
        brandSub="// agent.arp.run"
        links={[
          { label: 'How it works', href: '/#how' },
          { label: 'What you get', href: '/#identity' },
          { label: 'Add-ons', href: '/#addons' },
          { label: 'Pricing', href: '/#pricing' },
          { label: 'Log in', href: 'https://cloud.arp.run/login', external: true },
        ]}
        cta={
          <ButtonLink href="/#claim" variant="primary" size="sm" arrow="up-right">
            Claim a name
          </ButtonLink>
        }
      />
      <main className="flex-1">{children}</main>
      <Footer
        brand="AgentID"
        tagline="A permanent name for your AI agent. Found by people, trusted by other agents, controlled by you."
        subtitle="agent.arp.run"
        columns={[
          {
            title: 'Product',
            links: [
              { label: 'Overview', href: '/' },
              { label: 'How it works', href: '/#how' },
              { label: 'What you get', href: '/#identity' },
              { label: 'Pricing', href: '/#pricing' },
            ],
          },
          {
            title: 'Add-ons',
            links: [
              { label: 'Connect', href: '/#addons' },
              { label: 'Payments', href: '/#addons' },
              { label: 'ARP Cloud', href: 'https://cloud.arp.run', external: true },
            ],
          },
          {
            title: 'Developers',
            links: [
              { label: 'Docs', href: 'https://docs.arp.run', external: true },
              { label: 'Protocol', href: 'https://arp.run', external: true },
              { label: 'GitHub', href: 'https://github.com/KybernesisAI/arp', external: true },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'Kybernesis', href: 'https://kybernesis.ai', external: true },
              { label: 'Support', href: 'https://cloud.arp.run/support', external: true },
              { label: 'Status', href: 'https://status.arp.run', external: true },
            ],
          },
          {
            title: 'Legal',
            links: [
              { label: 'Terms', href: '/legal/terms' },
              { label: 'Privacy', href: '/legal/privacy' },
            ],
          },
        ]}
        legal={{
          copy: `© ${new Date().getFullYear()} Kybernesis. AgentID is built on ARP.`,
          status: 'EARLY ACCESS',
        }}
      />
    </div>
  );
}
