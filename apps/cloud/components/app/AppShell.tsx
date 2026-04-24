import type * as React from 'react';
import { Container, Nav } from '@/components/ui';
import { LogoutButton } from './LogoutButton';

/**
 * Authenticated app shell — top bar with brand, a couple of app links, and
 * an "About ARP" outbound link. Content is rendered inside a standard
 * container with vertical padding.
 */
export function AppShell({
  children,
  showMainActions = true,
}: {
  children: React.ReactNode;
  showMainActions?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brandSub="// app.arp.run"
        links={
          showMainActions
            ? [
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'Connections', href: '/connections' },
                { label: 'Pair', href: '/pair' },
                { label: 'Billing', href: '/billing' },
                { label: 'Docs', href: 'https://arp.run', external: true },
              ]
            : [{ label: 'About ARP', href: 'https://arp.run', external: true }]
        }
        cta={showMainActions ? <LogoutButton /> : undefined}
      />
      <main className="flex-1 py-12 lg:py-16">
        <Container>{children}</Container>
      </main>
      <footer className="border-t border-rule bg-paper py-6 font-mono text-kicker uppercase text-muted">
        <Container>
          <div className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-12 md:col-span-6">
              <b className="text-ink font-medium">ARP CLOUD</b> &nbsp;·&nbsp; HOSTED RUNTIME
            </div>
            <div className="col-span-12 md:col-span-6 md:text-right">
              <a href="/legal/terms" className="text-muted hover:text-ink">TERMS</a>
              {' · '}
              <a href="/legal/privacy" className="text-muted hover:text-ink">PRIVACY</a>
              {' · '}
              <a href="/legal/dpa" className="text-muted hover:text-ink">DPA</a>
              {' · '}
              <a
                href="https://status.arp.run"
                className="text-muted hover:text-ink"
              >
                STATUS
              </a>
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
