import type * as React from 'react';
import NextLink from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/cn';

export const linkVariants = cva(
  'inline-flex items-center gap-1.5 transition-colors duration-fast ease-arp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  {
    variants: {
      variant: {
        inline: 'text-ink border-b border-transparent hover:border-ink',
        plain: 'text-ink hover:text-signal-blue',
        muted: 'text-muted hover:text-ink',
        accent: 'text-signal-blue hover:text-ink',
        mono: 'font-mono text-[11px] uppercase tracking-[0.14em] text-ink border-b border-current pb-1',
        navlink:
          'font-mono text-[11px] uppercase tracking-[0.1em] text-ink border-b border-transparent hover:border-ink pb-1',
      },
    },
    defaultVariants: {
      variant: 'inline',
    },
  },
);

type BaseLinkProps = VariantProps<typeof linkVariants> & {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
};

export function Link({
  href,
  variant,
  className,
  external,
  children,
  ...rest
}: BaseLinkProps & React.AnchorHTMLAttributes<HTMLAnchorElement>): React.JSX.Element {
  const isExternal = external ?? /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a
        href={href}
        className={cn(linkVariants({ variant }), className)}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink href={href} className={cn(linkVariants({ variant }), className)} {...rest}>
      {children}
    </NextLink>
  );
}
