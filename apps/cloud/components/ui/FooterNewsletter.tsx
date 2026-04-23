'use client';

import type * as React from 'react';
import { Button } from './Button';
import { Input } from './Input';

export type FooterNewsletterProps = {
  title: string;
  subtitle?: string;
  placeholder?: string;
  ctaLabel?: string;
};

export function FooterNewsletter({
  title,
  subtitle,
  placeholder = 'you@company.com',
  ctaLabel = 'Subscribe',
}: FooterNewsletterProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-12 gap-4 py-10 border-b border-rule items-center">
      <div className="col-span-12 md:col-span-5">
        <h4 className="text-[1.75rem] font-display font-medium tracking-[-0.015em] m-0">
          {title}
        </h4>
        {subtitle && <p className="mt-1.5 text-body-sm text-ink-2">{subtitle}</p>}
      </div>
      <form
        className="col-span-12 md:col-span-7 flex gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <Input
          type="email"
          placeholder={placeholder}
          className="flex-1 font-mono uppercase tracking-[0.08em]"
          aria-label="Email"
        />
        <Button type="submit" variant="primary" arrow>
          {ctaLabel}
        </Button>
      </form>
    </div>
  );
}
