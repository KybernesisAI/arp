import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import NextLink from 'next/link';
import { cn } from './lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border uppercase tracking-[0.1em] font-mono font-medium transition-colors duration-fast ease-arp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:
          'bg-signal-blue text-white border-signal-blue hover:bg-ink hover:border-ink',
        default:
          'bg-paper text-ink border-rule hover:bg-ink hover:text-paper',
        ghost:
          'bg-transparent text-ink border-rule hover:bg-ink hover:text-paper',
        inverse:
          'bg-transparent text-paper border-paper hover:bg-paper hover:text-ink',
        solid:
          'bg-ink text-paper border-ink hover:bg-signal-blue hover:border-signal-blue',
        accent:
          'bg-signal-yellow text-ink border-signal-yellow hover:bg-ink hover:text-paper hover:border-ink',
      },
      size: {
        sm: 'h-9 px-3 text-[11px]',
        md: 'h-11 px-5 text-[11.5px]',
        lg: 'h-14 px-6 text-[12px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

type ArrowOption = boolean | 'up-right' | 'right';

type ButtonBase = VariantProps<typeof buttonVariants> & {
  className?: string;
  /**
   * Render a trailing arrow glyph to match the reference CTA treatment.
   * `true` / `'right'` → `→`, `'up-right'` → `↗`. Default: none.
   */
  arrow?: ArrowOption;
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & ButtonBase;

export function Button({
  className,
  variant,
  size,
  arrow,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
      {arrow && <span aria-hidden="true" className="opacity-80">{renderArrow(arrow)}</span>}
    </button>
  );
}

export type ButtonLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'color'> &
  ButtonBase & {
    href: string;
  };

export function ButtonLink({
  className,
  variant,
  size,
  arrow,
  href,
  children,
  ...props
}: ButtonLinkProps): React.JSX.Element {
  const isExternal = /^https?:\/\//i.test(href);
  const content = (
    <>
      {children}
      {arrow && <span aria-hidden="true" className="opacity-80">{renderArrow(arrow)}</span>}
    </>
  );
  if (isExternal) {
    return (
      <a
        className={cn(buttonVariants({ variant, size }), className)}
        href={href}
        target={props.target ?? '_blank'}
        rel={props.rel ?? 'noopener noreferrer'}
        {...props}
      >
        {content}
      </a>
    );
  }
  return (
    <NextLink className={cn(buttonVariants({ variant, size }), className)} href={href}>
      {content}
    </NextLink>
  );
}

function renderArrow(arrow: ArrowOption): string {
  if (arrow === 'up-right') return '↗';
  return '→';
}
