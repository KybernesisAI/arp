import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-elevated text-foreground-secondary border border-border-subtle',
        accent: 'bg-accent-500/15 text-accent-300 border border-accent-500/30',
        success: 'bg-success-500/15 text-success-500 border border-success-500/30',
        warn: 'bg-warn-500/15 text-warn-500 border border-warn-500/30',
        danger: 'bg-danger-500/15 text-danger-500 border border-danger-500/30',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({
  className,
  variant,
  children,
  ...props
}: BadgeProps): React.JSX.Element {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
