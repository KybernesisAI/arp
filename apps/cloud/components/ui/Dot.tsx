import type * as React from 'react';
import { cn } from './lib/cn';

export type DotProps = {
  tone?: 'red' | 'green' | 'yellow' | 'ink' | 'blue';
  pulse?: boolean;
  size?: number;
  className?: string;
};

const toneMap: Record<NonNullable<DotProps['tone']>, string> = {
  red: 'bg-signal-red',
  green: 'bg-signal-green',
  yellow: 'bg-signal-yellow',
  ink: 'bg-ink',
  blue: 'bg-signal-blue',
};

export function Dot({
  tone = 'green',
  pulse = false,
  size = 8,
  className,
}: DotProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block rounded-full',
        toneMap[tone],
        pulse && 'animate-pulse',
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
