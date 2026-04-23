import type * as React from 'react';
import { cn } from './lib/cn';

export type PlateHeadProps = {
  plateNum: string;
  kicker: string;
  /** Title text, or a node if you want to inline emphasis spans. */
  title: React.ReactNode;
  className?: string;
};

/**
 * Editorial plate header: number · kicker · title laid out on the 12-column
 * grid with a 1 px bottom rule. Matches the reference landing design.
 */
export function PlateHead({
  plateNum,
  kicker,
  title,
  className,
}: PlateHeadProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'grid grid-cols-12 gap-4 items-end pb-6 mb-12 border-b border-rule',
        className,
      )}
    >
      <div className="col-span-12 md:col-span-1 font-mono text-kicker uppercase text-ink">
        {plateNum}
      </div>
      <div className="col-span-12 md:col-span-4 font-mono text-kicker uppercase text-muted">
        {kicker}
      </div>
      <h2 className="col-span-12 md:col-span-7 text-h1 font-display font-medium text-ink">
        {title}
      </h2>
    </header>
  );
}

/** Yellow-underline emphasis word for headlines. */
export function Underline({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="arp-underline">{children}</span>;
}

/** Colored italic-free emphasis span for headlines ("in English" etc). */
export function Emphasis({
  children,
  tone = 'red',
}: {
  children: React.ReactNode;
  tone?: 'red' | 'blue' | 'yellow';
}): React.JSX.Element {
  const cls =
    tone === 'red'
      ? 'text-signal-red'
      : tone === 'blue'
        ? 'text-signal-blue'
        : 'text-signal-yellow';
  return <span className={cn('not-italic', cls)}>{children}</span>;
}
