import type * as React from 'react';
import { cn } from './lib/cn';

type Tone = 'surface' | 'raised' | 'elevated';

const toneMap: Record<Tone, string> = {
  surface: 'bg-surface',
  raised: 'bg-surface-raised',
  elevated: 'bg-surface-elevated',
};

export type SectionProps = React.HTMLAttributes<HTMLElement> & {
  tone?: Tone;
  /**
   * Vertical rhythm. `default` = 4rem top/bottom on mobile, 6rem on lg.
   * `compact` = 2.5rem/4rem. `hero` = 5rem/8rem.
   */
  spacing?: 'default' | 'compact' | 'hero';
  as?: 'section' | 'div' | 'header' | 'footer' | 'main';
};

const spacingMap = {
  default: 'py-section-sm lg:py-section',
  compact: 'py-10 lg:py-16',
  hero: 'py-20 lg:py-32',
};

export function Section({
  tone = 'surface',
  spacing = 'default',
  as: As = 'section',
  className,
  children,
  ...props
}: SectionProps): React.JSX.Element {
  const Component = As as React.ElementType;
  return (
    <Component className={cn(toneMap[tone], spacingMap[spacing], className)} {...props}>
      {children}
    </Component>
  );
}
