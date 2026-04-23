import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import NextLink from 'next/link';
import { cn } from './lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-md transition-colors duration-ease-out ease-out-snap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-700',
        secondary:
          'bg-transparent text-foreground-primary border border-border hover:border-border-strong hover:bg-surface-elevated',
        ghost: 'bg-transparent text-foreground-primary hover:bg-surface-elevated',
        link: 'bg-transparent text-accent-400 hover:text-accent-300 underline-offset-4 hover:underline',
        danger: 'bg-danger-500 text-white hover:bg-danger-500/90',
      },
      size: {
        sm: 'h-8 px-3 text-body-sm',
        md: 'h-10 px-4 text-body-sm',
        lg: 'h-12 px-6 text-body',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export type ButtonLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof buttonVariants> & {
    href: string;
  };

export function ButtonLink({
  className,
  variant,
  size,
  href,
  children,
  ...props
}: ButtonLinkProps): React.JSX.Element {
  const isExternal = /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a
        className={cn(buttonVariants({ variant, size }), className)}
        href={href}
        target={props.target ?? '_blank'}
        rel={props.rel ?? 'noopener noreferrer'}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <NextLink className={cn(buttonVariants({ variant, size }), className)} href={href}>
      {children}
    </NextLink>
  );
}
