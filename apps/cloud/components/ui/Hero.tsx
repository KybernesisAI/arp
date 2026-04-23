import type * as React from 'react';
import { cn } from './lib/cn';

export type HeroProps = React.HTMLAttributes<HTMLDivElement> & {
  align?: 'left' | 'center';
};

export function Hero({
  align = 'left',
  className,
  children,
  ...props
}: HeroProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function HeroEyebrow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p
      className={cn(
        'text-body-sm font-medium uppercase tracking-widest text-accent-400',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function HeroHeadline({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return (
    <h1
      className={cn(
        'text-display-md md:text-display-lg font-bold text-foreground-primary max-w-3xl',
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

export function HeroSubhead({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p
      className={cn(
        'text-body-lg text-foreground-secondary max-w-2xl',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function HeroCTA({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 pt-2', className)} {...props}>
      {children}
    </div>
  );
}
