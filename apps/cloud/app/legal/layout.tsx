// LEGAL-REVIEW-PENDING — layout wraps the three skeleton legal pages so
// the same editorial container + noindex metadata applies uniformly.
import type { Metadata } from 'next';
import type * as React from 'react';
import { Container, Link, Nav } from '@/components/ui';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const LEGAL_NAV = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'DPA', href: '/legal/dpa' },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Nav
        brandSub="// legal"
        links={[
          { label: 'ARP', href: 'https://arp.run', external: true },
          { label: 'Cloud', href: 'https://cloud.arp.run', external: true },
          { label: 'Spec', href: 'https://spec.arp.run', external: true },
        ]}
      />
      <main className="flex-1 py-12 lg:py-16">
        <Container>
          <div className="grid grid-cols-12 gap-4">
            <aside className="col-span-12 md:col-span-3">
              <nav aria-label="Legal" className="sticky top-24">
                <h2 className="mb-3 font-mono text-kicker uppercase text-muted">
                  LEGAL
                </h2>
                <ul className="list-none p-0">
                  {LEGAL_NAV.map((item) => (
                    <li key={item.href} className="border-t border-rule py-2">
                      <Link href={item.href} variant="mono">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
            <article className="col-span-12 md:col-span-9 space-y-6">
              {children}
            </article>
          </div>
        </Container>
      </main>
      <footer className="border-t border-rule bg-paper py-6 font-mono text-kicker uppercase text-muted">
        <Container>
          <div className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-12 md:col-span-6">
              <b className="text-ink font-medium">ARP</b> · LEGAL — DRAFT /
              PENDING COUNSEL REVIEW
            </div>
            <div className="col-span-12 md:col-span-6 md:text-right">
              © 2026 KYBERNESIS
            </div>
          </div>
        </Container>
      </footer>
    </div>
  );
}
