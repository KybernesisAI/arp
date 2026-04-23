import type * as React from 'react';
import { cn } from './lib/cn';
import { Card, type CardProps } from './Card';

export type FeatureCardProps = {
  idx?: string;
  category?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  tone?: CardProps['tone'];
  className?: string;
};

/**
 * Editorial feature card: `idx` (e.g. "B.01 / 07"), a category kicker, an
 * optional icon-shape, a display title, and a body paragraph. Used inside
 * `CardMatrix` to form the 3x2 benefits grid in the reference design.
 */
export function FeatureCard({
  idx,
  category,
  title,
  description,
  icon,
  tone = 'paper',
  className,
}: FeatureCardProps): React.JSX.Element {
  const onAccent = tone === 'blue' || tone === 'red' || tone === 'ink';
  return (
    <Card tone={tone} className={cn('min-h-[280px] gap-3 justify-between', className)}>
      <div className="flex items-start justify-between gap-3">
        {idx && (
          <span
            className={cn(
              'font-mono text-kicker uppercase',
              onAccent ? 'text-white/90' : 'text-muted',
            )}
          >
            {idx}
          </span>
        )}
        {category && (
          <span
            className={cn(
              'font-mono text-kicker uppercase',
              onAccent ? 'text-white' : 'text-ink',
            )}
          >
            {category}
          </span>
        )}
      </div>
      {icon && <div className="my-2">{icon}</div>}
      <h3 className="text-h3 font-display font-medium max-w-[18ch]">{title}</h3>
      <p
        className={cn(
          'text-body-sm max-w-[44ch] flex-1',
          onAccent ? 'text-white/90' : 'text-ink-2',
        )}
      >
        {description}
      </p>
    </Card>
  );
}
