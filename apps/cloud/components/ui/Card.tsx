import type * as React from 'react';
import { cn } from './lib/cn';

/**
 * Flat, hard-edged block. Use inside a rule-gap grid (see `CardMatrix`) to
 * assemble the editorial matrix look.
 */
export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: 'paper' | 'paper-2' | 'ink' | 'blue' | 'yellow' | 'red';
  padded?: boolean;
};

const toneMap: Record<NonNullable<CardProps['tone']>, string> = {
  paper: 'bg-paper text-ink',
  'paper-2': 'bg-paper-2 text-ink',
  ink: 'bg-ink text-paper',
  blue: 'bg-signal-blue text-white',
  yellow: 'bg-signal-yellow text-ink',
  red: 'bg-signal-red text-white',
};

export function Card({
  tone = 'paper',
  padded = true,
  className,
  children,
  ...props
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 border-0',
        padded && 'p-6 md:p-7',
        toneMap[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Rule-matrix grid wrapper. Uses `bg-rule` + `gap-px` so each cell gap
 * becomes a visible 1 px hairline — the cards inside set their own
 * background.
 */
export function CardMatrix({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'grid bg-rule gap-px border border-rule',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
