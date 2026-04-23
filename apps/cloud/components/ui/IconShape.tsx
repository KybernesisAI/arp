import type * as React from 'react';
import { cn } from './lib/cn';

export type IconShapeVariant =
  | 'frame'
  | 'grid9'
  | 'bars'
  | 'stripe'
  | 'blades'
  | 'diamond'
  | 'revoke';

export type IconShapeProps = {
  variant: IconShapeVariant;
  /** Foreground color override — defaults to the ambient text color. */
  color?: 'ink' | 'paper' | 'blue' | 'red' | 'yellow' | 'currentColor';
  /** Accent color for multi-tone icons. */
  accent?: 'ink' | 'paper' | 'blue' | 'red' | 'yellow';
  size?: number;
  className?: string;
};

const bg: Record<NonNullable<IconShapeProps['color']>, string> = {
  ink: 'bg-ink',
  paper: 'bg-paper',
  blue: 'bg-signal-blue',
  red: 'bg-signal-red',
  yellow: 'bg-signal-yellow',
  currentColor: 'bg-current',
};

/**
 * Abstract decorative marks used on feature cards. No emojis, no SVG icon
 * library — just hard-edged geometric shapes that match the reference
 * design vocabulary.
 */
export function IconShape({
  variant,
  color = 'currentColor',
  accent = 'yellow',
  size = 48,
  className,
}: IconShapeProps): React.JSX.Element {
  const dim = { width: size, height: size };
  if (variant === 'frame') {
    return (
      <span
        className={cn('relative inline-block border-2 border-current', className)}
        style={dim}
        aria-hidden="true"
      >
        <span className="absolute inset-2 border-2 border-current" />
        <span className={cn('absolute inset-4 border-2', colorBorder(accent))} />
      </span>
    );
  }
  if (variant === 'grid9') {
    return (
      <span
        className={cn('inline-grid grid-cols-3 gap-[3px]', className)}
        style={dim}
        aria-hidden="true"
      >
        {Array.from({ length: 9 }).map((_, i) => {
          const isCenter = i === 4;
          const isCorner = i === 5;
          return (
            <span
              key={i}
              className={cn(
                isCenter ? 'bg-ink' : isCorner ? bg[accent] : bg[color],
              )}
            />
          );
        })}
      </span>
    );
  }
  if (variant === 'bars') {
    return (
      <span
        className={cn('relative inline-flex flex-col justify-between p-1.5 border-2 border-current', className)}
        style={dim}
        aria-hidden="true"
      >
        <span className="block h-1 w-[70%] bg-current" />
        <span className={cn('block h-1 w-[50%]', bg[accent])} />
        <span className="block h-1 w-[30%] bg-current" />
      </span>
    );
  }
  if (variant === 'stripe') {
    return (
      <span
        className={cn('relative inline-block border-2 border-current', className)}
        style={dim}
        aria-hidden="true"
      >
        <span className={cn('absolute left-0 right-0 top-[30%] h-1.5', bg[accent])} />
      </span>
    );
  }
  if (variant === 'blades') {
    return (
      <span
        className={cn('inline-flex items-end gap-[3px]', className)}
        style={dim}
        aria-hidden="true"
      >
        <span className="block flex-1 bg-current" style={{ height: '30%' }} />
        <span className="block flex-1 bg-current" style={{ height: '60%' }} />
        <span className="block flex-1 bg-current" style={{ height: '45%' }} />
        <span className={cn('block flex-1', bg.blue)} style={{ height: '80%' }} />
        <span className="block flex-1 bg-current" style={{ height: '55%' }} />
        <span className={cn('block flex-1', bg.red)} style={{ height: '90%' }} />
      </span>
    );
  }
  if (variant === 'diamond') {
    return (
      <span
        className={cn('relative inline-block border-2 border-current', className)}
        style={dim}
        aria-hidden="true"
      >
        <span
          className={cn('absolute inset-[20%] rotate-45 origin-center', bg[accent])}
        />
      </span>
    );
  }
  // revoke — circle with a slash.
  return (
    <span
      className={cn(
        'relative inline-block rounded-full border-2 border-current',
        className,
      )}
      style={dim}
      aria-hidden="true"
    >
      <span
        className={cn('absolute inset-y-1/2 left-2 right-2 h-0.5 rotate-45', bg[accent])}
      />
    </span>
  );
}

function colorBorder(tone: NonNullable<IconShapeProps['accent']>): string {
  return tone === 'ink'
    ? 'border-ink'
    : tone === 'paper'
      ? 'border-paper'
      : tone === 'blue'
        ? 'border-signal-blue'
        : tone === 'red'
          ? 'border-signal-red'
          : 'border-signal-yellow';
}
