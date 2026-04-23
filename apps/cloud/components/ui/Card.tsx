import type * as React from 'react';
import { cn } from './lib/cn';

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'raised' | 'elevated' | 'transparent';
  interactive?: boolean;
};

const toneMap: Record<NonNullable<CardProps['tone']>, string> = {
  raised: 'bg-surface-raised',
  elevated: 'bg-surface-elevated',
  transparent: 'bg-transparent',
};

export function Card({
  tone = 'elevated',
  interactive = false,
  className,
  children,
  ...props
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle shadow-ring',
        toneMap[tone],
        interactive &&
          'transition-colors duration-ease-out ease-out-snap hover:border-border hover:shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('px-6 pt-6 pb-2', className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn('px-6 pt-2 pb-6 border-t border-border-subtle mt-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}
