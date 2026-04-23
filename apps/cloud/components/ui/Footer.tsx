import type * as React from 'react';
import { Container } from './Container';
import { Link } from './Link';
import { BrandMark } from './Nav';
import { Button } from './Button';
import { Input } from './Input';
import { cn } from './lib/cn';

export type FooterColumn = {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
};

export type FooterProps = {
  tagline?: string;
  subtitle?: string;
  columns?: FooterColumn[];
  newsletter?: FooterNewsletterProps;
  legal?: {
    copy: string;
    links?: Array<{ label: string; href: string }>;
    status?: string;
  };
  className?: string;
};

export function Footer({
  tagline,
  subtitle,
  columns = [],
  newsletter,
  legal,
  className,
}: FooterProps): React.JSX.Element {
  return (
    <footer className={cn('bg-paper text-ink border-t border-rule', className)}>
      <Container>
        {newsletter && <FooterNewsletter {...newsletter} />}

        <div className="grid grid-cols-2 md:grid-cols-[2fr_repeat(5,_1fr)] gap-4 pt-14 pb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-baseline gap-2.5 mb-3.5">
              <BrandMark size={14} className="translate-y-[2px]" />
              <span className="font-display font-semibold text-[14px] tracking-[0.04em]">
                ARP
              </span>
            </div>
            {tagline && (
              <p className="text-body-sm text-ink-2 max-w-[32ch] leading-[1.5]">
                {tagline}
              </p>
            )}
            {subtitle && (
              <p className="mt-2 font-mono text-kicker tracking-[0.1em] uppercase text-muted">
                {subtitle}
              </p>
            )}
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h6 className="font-mono text-kicker uppercase text-muted mb-3.5 font-medium">
                {column.title}
              </h6>
              <ul className="space-y-1 list-none p-0 m-0">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      variant="plain"
                      external={link.external}
                      className="block text-body-sm py-1"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {legal && (
          <div className="grid grid-cols-12 gap-4 border-t border-rule pt-5 pb-7 font-mono text-[11px] tracking-[0.1em] uppercase">
            <div className="col-span-12 md:col-span-4 text-muted">{legal.copy}</div>
            {legal.links && (
              <div className="col-span-12 md:col-span-5 flex flex-wrap gap-5">
                {legal.links.map((link) => (
                  <Link key={link.label} href={link.href} variant="plain">
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
            {legal.status && (
              <div className="col-span-12 md:col-span-3 md:text-right text-muted">
                {legal.status}
              </div>
            )}
          </div>
        )}
      </Container>
    </footer>
  );
}

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
