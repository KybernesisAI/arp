import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-kicker uppercase border',
  {
    variants: {
      tone: {
        muted: 'border-rule bg-paper-2 text-muted',
        ink: 'border-ink bg-ink text-paper',
        paper: 'border-rule bg-paper text-ink',
        blue: 'border-signal-blue bg-signal-blue text-white',
        red: 'border-signal-red bg-signal-red text-white',
        yellow: 'border-ink bg-signal-yellow text-ink',
      },
    },
    defaultVariants: {
      tone: 'muted',
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({
  className,
  tone,
  children,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {children}
    </span>
  );
}
