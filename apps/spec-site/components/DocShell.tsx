'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';

import { cn } from '@/lib/cn';

export type DocNavItem = {
  title: string;
  href: string;
  description?: string;
};

export type DocNavGroup = {
  kicker: string;
  items: DocNavItem[];
};

export type DocShellProps = {
  groups: DocNavGroup[];
  children: React.ReactNode;
};

export function DocShell({ groups, children }: DocShellProps): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-12">
      <aside className="col-span-12 border-b border-rule pb-8 lg:col-span-3 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
        <nav aria-label="Documentation">
          {groups.map((group) => (
            <div key={group.kicker} className="mb-8">
              <h2 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                {group.kicker}
              </h2>
              <ul className="mt-3 space-y-1">
                {group.items.map((item) => {
                  const active = item.href === pathname;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'block border-l-2 pl-3 py-1 font-sans text-body-sm transition-colors duration-fast ease-arp',
                          active
                            ? 'border-ink bg-paper-2 font-medium text-ink'
                            : 'border-transparent text-ink-2 hover:border-rule hover:text-ink',
                        )}
                      >
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="col-span-12 lg:col-span-9 lg:pl-8">
        <article className="arp-prose max-w-3xl">{children}</article>
      </main>
    </div>
  );
}
