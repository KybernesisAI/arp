import type * as React from 'react';
import { cn } from './lib/cn';
import { ButtonLink } from './Button';

export type PricingCardProps = {
  tier: string;
  name: string;
  price: string;
  /** Small period text — e.g. `/ mo`. */
  cadence?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  popularLabel?: string;
  footnote?: string;
};

export function PricingCard({
  tier,
  name,
  price,
  cadence,
  description,
  features,
  ctaLabel,
  ctaHref,
  highlighted = false,
  popularLabel = 'Most popular',
  footnote,
}: PricingCardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 p-7 min-h-[460px]',
        highlighted ? 'bg-signal-blue text-white' : 'bg-paper text-ink',
      )}
    >
      {highlighted && (
        <span className="absolute top-0 right-0 bg-signal-yellow text-ink font-mono text-kicker uppercase px-3 py-1.5 border-l border-b border-ink">
          {popularLabel}
        </span>
      )}
      <div
        className={cn(
          'font-mono text-kicker uppercase',
          highlighted ? 'text-white/85' : 'text-muted',
        )}
      >
        {tier}
      </div>
      <h3 className="text-[2rem] font-display font-medium tracking-[-0.015em] leading-none">
        {name}
      </h3>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-[3.5rem] font-display font-medium tracking-[-0.03em] leading-none">
          {price}
        </span>
        {cadence && (
          <span
            className={cn(
              'font-mono text-body-sm',
              highlighted ? 'text-white/80' : 'text-muted',
            )}
          >
            {cadence}
          </span>
        )}
      </div>
      <p
        className={cn(
          'text-body-sm mt-1',
          highlighted ? 'text-white/85' : 'text-ink-2',
        )}
      >
        {description}
      </p>
      <ul className="mt-4 flex-1 list-none p-0 m-0">
        {features.map((feature) => (
          <li
            key={feature}
            className={cn(
              'grid grid-cols-[18px_1fr] gap-2 items-baseline py-2 text-body-sm border-b',
              highlighted ? 'border-white/25' : 'border-rule/30',
            )}
          >
            <span
              className={cn(
                'font-mono',
                highlighted ? 'text-white/70' : 'text-muted',
              )}
              aria-hidden="true"
            >
              ›
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {footnote && (
        <p
          className={cn(
            'text-kicker font-mono uppercase mt-3',
            highlighted ? 'text-white/70' : 'text-muted',
          )}
        >
          {footnote}
        </p>
      )}
      <ButtonLink
        href={ctaHref}
        variant={highlighted ? 'accent' : 'default'}
        size="md"
        arrow
        className="mt-6 w-full justify-between"
      >
        {ctaLabel}
      </ButtonLink>
    </div>
  );
}
