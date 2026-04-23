import type * as React from 'react';
import { Card } from './Card';
import { ButtonLink } from './Button';
import { cn } from './lib/cn';

export type PricingCardProps = {
  name: string;
  price: string;
  cadence?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  footnote?: string;
};

export function PricingCard({
  name,
  price,
  cadence,
  description,
  features,
  ctaLabel,
  ctaHref,
  highlighted = false,
  footnote,
}: PricingCardProps): React.JSX.Element {
  return (
    <Card
      tone={highlighted ? 'elevated' : 'raised'}
      className={cn(
        'relative flex flex-col p-8 h-full',
        highlighted && 'ring-1 ring-accent-500/60 shadow-sm',
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-6 rounded-full bg-accent-500 px-3 py-1 text-caption font-semibold text-white">
          Recommended
        </span>
      )}
      <div className="mb-6">
        <h3 className="text-h3 font-semibold text-foreground-primary">{name}</h3>
        <p className="mt-2 text-body-sm text-foreground-muted">{description}</p>
      </div>
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-display-md font-bold text-foreground-primary">{price}</span>
          {cadence && (
            <span className="text-body-sm text-foreground-muted">{cadence}</span>
          )}
        </div>
        {footnote && <p className="mt-1 text-caption text-foreground-subtle">{footnote}</p>}
      </div>
      <ul className="mb-8 flex-1 space-y-3 text-body-sm text-foreground-secondary">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-[0.45rem] inline-block h-1.5 w-1.5 flex-none rounded-full bg-accent-400"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <ButtonLink
        href={ctaHref}
        variant={highlighted ? 'primary' : 'secondary'}
        size="md"
        className="w-full justify-center"
      >
        {ctaLabel}
      </ButtonLink>
    </Card>
  );
}
