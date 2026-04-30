import type * as React from 'react';
import type { ReactNode } from 'react';
import { ButtonLink, Footer, Nav } from '@/components/ui';

export const metadata = {
  title: 'ARP — Agent Relationship Protocol',
  description:
    'ARP is the open protocol for agent-to-agent communication and permissions. MIT licensed. Reference implementations included.',
};

export default function ProjectLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brandSub="// arp.run"
        links={[
          { label: 'Protocol', href: '/architecture' },
          { label: 'About', href: '/about' },
          { label: 'Docs', href: 'https://docs.arp.run', external: true },
          { label: 'GitHub', href: 'https://github.com/KybernesisAI/arp', external: true },
        ]}
        cta={
          <ButtonLink href="https://cloud.arp.run" variant="primary" size="sm" arrow="up-right">
            Try ARP Cloud
          </ButtonLink>
        }
      />
      <main className="flex-1">{children}</main>
      <Footer
        tagline="The open protocol for agent-to-agent communication and permissions. MIT licensed."
        subtitle="arp.run"
        columns={[
          {
            title: 'Protocol',
            links: [
              { label: 'Architecture', href: '/architecture' },
              { label: 'Specification', href: 'https://spec.arp.run', external: true },
              { label: 'Scope catalog', href: 'https://docs.arp.run/docs/scope-catalog', external: true },
              { label: 'Changelog', href: 'https://github.com/KybernesisAI/arp/releases', external: true },
            ],
          },
          {
            title: 'Developers',
            links: [
              { label: 'Documentation', href: 'https://docs.arp.run', external: true },
              { label: 'SDK reference', href: 'https://docs.arp.run/docs/sdks', external: true },
              { label: 'Adapter guide', href: 'https://docs.arp.run/docs/adapters', external: true },
              { label: 'Testkit', href: 'https://github.com/KybernesisAI/arp/tree/main/packages/testkit', external: true },
            ],
          },
          {
            title: 'Community',
            links: [
              {
                label: 'GitHub',
                href: 'https://github.com/KybernesisAI/arp',
                external: true,
              },
              {
                label: 'Discussions',
                href: 'https://github.com/KybernesisAI/arp/discussions',
                external: true,
              },
              { label: 'ARP Cloud', href: 'https://cloud.arp.run', external: true },
            ],
          },
          {
            title: 'Company',
            links: [
              { label: 'About', href: '/about' },
              { label: 'Support', href: 'https://cloud.arp.run/support', external: true },
            ],
          },
          {
            title: 'Legal',
            links: [
              { label: 'License (MIT)', href: 'https://github.com/KybernesisAI/arp/blob/main/LICENSE', external: true },
              { label: 'Terms', href: '/legal/terms' },
              { label: 'Privacy', href: '/legal/privacy' },
            ],
          },
        ]}
        legal={{
          copy: '© 2026 · ARP — the open protocol for agent-to-agent software',
          links: [
            { label: 'Terms', href: '/legal/terms' },
            { label: 'Privacy', href: '/legal/privacy' },
            { label: 'DPA', href: '/legal/dpa' },
            { label: 'Support', href: 'https://cloud.arp.run/support' },
            { label: 'Status', href: 'https://status.arp.run' },
          ],
          status: 'STATUS · OPERATIONAL',
        }}
      />
    </div>
  );
}
