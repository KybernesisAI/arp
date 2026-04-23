import type * as React from 'react';
import { cn } from './lib/cn';

export type HeroMetaCell = {
  label: string;
  value: string;
};

export function HeroMeta({
  cells,
  className,
}: {
  cells: HeroMetaCell[];
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid grid-cols-12 gap-4 pb-4 mb-7 border-b border-rule font-mono text-kicker uppercase text-muted',
        className,
      )}
    >
      {cells.slice(0, 4).map((cell, idx) => (
        <div
          key={cell.label}
          className={cn(
            idx === 0 && 'col-span-6 md:col-span-2',
            idx === 1 && 'col-span-6 md:col-span-3',
            idx === 2 && 'col-span-6 md:col-span-3',
            idx === 3 && 'col-span-6 md:col-span-4 md:text-right',
          )}
        >
          <span className="text-ink font-medium mr-1.5">{cell.label} ·</span>
          {cell.value}
        </div>
      ))}
    </div>
  );
}

export function EyebrowTag({
  children,
  dotTone = 'red',
  className,
}: {
  children: React.ReactNode;
  dotTone?: 'red' | 'yellow' | 'green';
  className?: string;
}): React.JSX.Element {
  const dotClass =
    dotTone === 'red'
      ? 'bg-signal-red animate-pulse'
      : dotTone === 'yellow'
        ? 'bg-signal-yellow'
        : 'bg-signal-green';
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 self-start font-mono text-kicker uppercase px-2.5 py-1.5 border border-rule bg-paper-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('inline-block h-2 w-2 rounded-full', dotClass)}
      />
      {children}
    </div>
  );
}

export function HeroTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <h1
      className={cn(
        'font-display font-medium text-[clamp(40px,4.4vw,64px)] leading-[1.02] tracking-[-0.03em] m-0',
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function HeroLine({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <span className={cn('block', className)}>{children}</span>;
}

export function HeroSub({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <p
      className={cn(
        'mt-7 text-body-lg text-ink-2 max-w-[52ch]',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function HeroCTA({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('mt-7 flex flex-wrap gap-2.5', className)}>{children}</div>
  );
}

export function HeroTrust({
  items,
  className,
}: {
  items: string[];
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'mt-8 flex flex-wrap gap-6 font-mono text-kicker uppercase text-muted',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item} className="inline-flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal-green" />
          {item}
        </span>
      ))}
    </div>
  );
}
