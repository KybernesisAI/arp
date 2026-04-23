import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/cn';

const NAV_LINKS: Array<{ href: string; label: string; external?: boolean }> = [
  { href: '/spec/v0.1/overview', label: 'SPEC' },
  { href: '/docs/getting-started', label: 'DOCS' },
  { href: '/scope-catalog', label: 'SCOPES' },
  { href: '/schema', label: 'SCHEMA' },
  { href: '/rfcs', label: 'RFCS' },
];

export function SiteNav(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-page items-center justify-between px-8 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 font-mono text-kicker uppercase tracking-[0.14em] text-ink"
          aria-label="ARP — home"
        >
          <span className="inline-block h-3 w-3 bg-ink" />
          <span>ARP / SPEC</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'font-mono text-kicker uppercase tracking-[0.14em] text-ink',
                'transition-opacity duration-fast ease-arp hover:opacity-60',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="https://github.com/KybernesisAI/arp"
            className="hidden font-mono text-kicker uppercase tracking-[0.14em] text-ink sm:inline"
          >
            GITHUB →
          </Link>
          <Link
            href="https://cloud.arp.run"
            className={cn(
              'inline-flex items-center gap-2 border border-ink px-3 py-1.5',
              'font-mono text-kicker uppercase tracking-[0.14em] text-ink',
              'transition-colors duration-fast ease-arp hover:bg-ink hover:text-paper',
            )}
          >
            TRY ARP CLOUD
          </Link>
        </div>
      </div>

      <div className="border-t border-rule bg-paper-2 text-muted">
        <div className="mx-auto flex w-full max-w-page items-center justify-between px-8 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span>VERSION v0.1 — DRAFT</span>
          <span className="hidden sm:inline">LAST UPDATED 2026-04-24</span>
        </div>
      </div>
    </header>
  );
}
