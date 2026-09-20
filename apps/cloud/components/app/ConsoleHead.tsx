import type * as React from 'react';
import { Kicker } from '@/app/lander/ui';

/**
 * Page header for console pages in the lander language. Drop-in for the
 * Swiss `PlateHead` (same props; the plate number is not shown, the `// `
 * prefix on kickers is stripped).
 */
export function ConsoleHead({ kicker, title, className = '', actions }: { plateNum?: string; kicker: string; title: React.ReactNode; className?: string; actions?: React.ReactNode }): React.JSX.Element {
  return (
    <header className={`mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between ${className}`}>
      <div>
        <Kicker>{kicker.replace(/^\/\/\s*/, '').replace(/\s*·\s*/g, ' · ')}</Kicker>
        <h1 className="mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-zinc-950 sm:text-[44px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
