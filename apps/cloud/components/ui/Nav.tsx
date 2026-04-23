import type * as React from 'react';
import NextLink from 'next/link';
import { cn } from './lib/cn';

export type NavLink = { label: string; href: string; external?: boolean };

export type NavProps = {
  /** Optional brand subtitle (e.g. `// arp.run`). */
  brandSub?: string;
  links?: NavLink[];
  cta?: React.ReactNode;
  ticker?: React.ReactNode;
  className?: string;
};

export function Nav({
  brandSub,
  links = [],
  cta,
  ticker,
  className,
}: NavProps): React.JSX.Element {
  return (
    <nav
      className={cn(
        'sticky top-0 z-40 bg-paper border-b border-rule',
        className,
      )}
      aria-label="Primary"
    >
      <div className="mx-auto max-w-page grid grid-cols-12 gap-4 items-center px-8 py-3.5">
        <NextLink
          href="/"
          className="col-span-4 md:col-span-2 flex items-baseline gap-2.5"
        >
          <BrandMark />
          <span className="font-display font-semibold text-[14px] tracking-[0.04em]">
            ARP
          </span>
          {brandSub && (
            <span className="hidden sm:inline font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">
              {brandSub}
            </span>
          )}
        </NextLink>
        {ticker ? (
          <div className="hidden md:block md:col-span-2 overflow-hidden relative h-[18px] arp-ticker-mask">
            {ticker}
          </div>
        ) : (
          <div className="hidden md:block md:col-span-2" />
        )}
        <div className="col-span-8 md:col-span-8 flex justify-end items-center gap-3.5 flex-wrap font-mono text-[11px] tracking-[0.1em] uppercase">
          {links.map((link) => (
            <NavAnchor key={`${link.label}-${link.href}`} {...link} />
          ))}
          {cta}
        </div>
      </div>
    </nav>
  );
}

function NavAnchor({ label, href, external }: NavLink): React.JSX.Element {
  const cls =
    'py-1.5 border-b border-transparent hover:border-ink transition-colors duration-fast';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <NextLink href={href} className={cls}>
      {label}
    </NextLink>
  );
}

/**
 * Brand mark — a blue square with an inset. Matches the reference design
 * exactly (no logo image yet).
 */
export function BrandMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block bg-signal-blue translate-y-[3px]', className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-1 bg-paper" />
    </span>
  );
}
