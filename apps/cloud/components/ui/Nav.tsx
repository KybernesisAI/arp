import type * as React from 'react';
import NextLink from 'next/link';
import { Container } from './Container';
import { cn } from './lib/cn';

export type NavProps = {
  brand: React.ReactNode;
  items?: Array<{ label: string; href: string; external?: boolean }>;
  cta?: React.ReactNode;
  className?: string;
};

export function Nav({ brand, items = [], cta, className }: NavProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border-subtle bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70',
        className,
      )}
    >
      <Container width="wide" className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <NextLink href="/" className="flex items-center gap-2 text-body font-semibold text-foreground-primary">
            {brand}
          </NextLink>
          {items.length > 0 && (
            <nav className="hidden md:flex items-center gap-6">
              {items.map((item) => (
                <NavItem key={`${item.label}-${item.href}`} {...item} />
              ))}
            </nav>
          )}
        </div>
        {cta && <div className="flex items-center gap-3">{cta}</div>}
      </Container>
    </header>
  );
}

export function NavItem({
  label,
  href,
  external,
}: {
  label: string;
  href: string;
  external?: boolean;
}): React.JSX.Element {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-body-sm text-foreground-muted hover:text-foreground-primary transition-colors"
      >
        {label}
      </a>
    );
  }
  return (
    <NextLink
      href={href}
      className="text-body-sm text-foreground-muted hover:text-foreground-primary transition-colors"
    >
      {label}
    </NextLink>
  );
}

export function Brand({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span>{children}</span>
    </span>
  );
}

/**
 * Wordmark glyph — a simple square + accent dot. Placeholder for a real logo
 * wired in Phase 9.
 */
export function BrandMark(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent-500/15 text-accent-400"
    >
      <span className="absolute inset-1.5 rounded-sm border border-accent-400" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-accent-400" />
    </span>
  );
}
