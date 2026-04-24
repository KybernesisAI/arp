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
          { label: 'Docs', href: '#' },
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
              { label: 'Specification [TBD]', href: '#' },
              { label: 'Scope catalog [TBD]', href: '#' },
              { label: 'Changelog [TBD]', href: '#' },
            ],
          },
          {
            title: 'Developers',
            links: [
              { label: 'Documentation [TBD]', href: '#' },
              { label: 'SDK reference [TBD]', href: '#' },
              { label: 'Adapter guide [TBD]', href: '#' },
              { label: 'Testkit [TBD]', href: '#' },
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
              { label: 'Contact [TBD]', href: '#' },
            ],
          },
          {
            title: 'Legal',
            links: [
              { label: 'License (MIT)', href: 'https://github.com/KybernesisAI/arp/blob/main/LICENSE', external: true },
              { label: 'Trademark [TBD]', href: '#' },
            ],
          },
        ]}
        legal={{
          copy: '© 2026 · ARP — the open protocol for agent-to-agent software',
          links: [
            { label: 'Terms', href: '/legal/terms' },
            { label: 'Privacy', href: '/legal/privacy' },
            { label: 'DPA', href: '/legal/dpa' },
            { label: 'Status', href: 'https://status.arp.run' },
          ],
          status: 'STATUS · OPERATIONAL',
        }}
      />
    </div>
  );
}
