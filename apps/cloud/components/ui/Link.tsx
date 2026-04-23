import type * as React from 'react';
import NextLink from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/cn';

export const linkVariants = cva(
  'inline-flex items-center gap-1 transition-colors duration-ease-out ease-out-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm',
  {
    variants: {
      variant: {
        default: 'text-accent-400 hover:text-accent-300',
        muted: 'text-foreground-muted hover:text-foreground-primary',
        subtle: 'text-foreground-subtle hover:text-foreground-muted',
        unstyled: 'text-inherit',
      },
      underline: {
        always: 'underline underline-offset-4',
        hover: 'hover:underline underline-offset-4',
        never: 'no-underline',
      },
    },
    defaultVariants: {
      variant: 'default',
      underline: 'hover',
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
  underline,
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
        className={cn(linkVariants({ variant, underline }), className)}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink
      href={href}
      className={cn(linkVariants({ variant, underline }), className)}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
