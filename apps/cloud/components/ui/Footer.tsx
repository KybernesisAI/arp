import type * as React from 'react';
import { Container } from './Container';
import { Link } from './Link';
import { cn } from './lib/cn';

export type FooterColumn = {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
};

export type FooterProps = {
  brand?: React.ReactNode;
  tagline?: string;
  columns?: FooterColumn[];
  bottom?: React.ReactNode;
  className?: string;
};

export function Footer({
  brand,
  tagline,
  columns = [],
  bottom,
  className,
}: FooterProps): React.JSX.Element {
  return (
    <footer
      className={cn(
        'border-t border-border-subtle bg-surface text-foreground-muted',
        className,
      )}
    >
      <Container width="wide" className="py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
          <div>
            {brand && <div className="mb-3 text-foreground-primary">{brand}</div>}
            {tagline && <p className="text-body-sm max-w-md">{tagline}</p>}
          </div>
          {columns.length > 0 && (
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {columns.map((column) => (
                <div key={column.title}>
                  <h4 className="mb-4 text-caption font-semibold uppercase tracking-widest text-foreground-subtle">
                    {column.title}
                  </h4>
                  <ul className="space-y-2">
                    {column.links.map((link) => (
                      <li key={`${column.title}-${link.label}`}>
                        <Link
                          href={link.href}
                          variant="muted"
                          underline="hover"
                          external={link.external}
                          className="text-body-sm"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        {bottom && (
          <div className="mt-12 flex flex-col gap-3 border-t border-border-subtle pt-6 text-caption sm:flex-row sm:items-center sm:justify-between">
            {bottom}
          </div>
        )}
      </Container>
    </footer>
  );
}
