import type * as React from 'react';
import { Card } from './Card';
import { cn } from './lib/cn';

export type FeatureCardProps = {
  title: string;
  description: string;
  icon?: React.ReactNode;
  className?: string;
};

export function FeatureCard({
  title,
  description,
  icon,
  className,
}: FeatureCardProps): React.JSX.Element {
  return (
    <Card tone="elevated" className={cn('p-6 h-full', className)}>
      {icon && <div className="mb-4 text-accent-400">{icon}</div>}
      <h3 className="text-h4 font-semibold text-foreground-primary mb-2">{title}</h3>
      <p className="text-body-sm text-foreground-muted">{description}</p>
    </Card>
  );
}
