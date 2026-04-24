import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/cn';
import { allSchemas } from '@/lib/schemas';

export const metadata = {
  title: 'Schema browser',
  description:
    'Every ARP JSON Schema with field-by-field documentation, example payloads, and a download link.',
};

export default function SchemaIndexPage(): React.JSX.Element {
  const schemas = allSchemas();
  return (
    <>
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 pt-16 pb-10">
          <div className="col-span-12 flex items-center gap-3">
            <span className="inline-block h-2 w-2 bg-signal-blue" />
            <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              JSON SCHEMAS / DRAFT 2020-12 · {schemas.length} DOCUMENTS
            </span>
          </div>
          <h1 className="col-span-12 mt-6 font-display text-display-md text-ink lg:col-span-10">
            Every well-known document, validated.
          </h1>
          <p className="col-span-12 mt-4 max-w-3xl font-sans text-body-lg text-ink-2 lg:col-span-8">
            ARP publishes a JSON Schema for each well-known document. Your
            implementation is conformant when every payload you serve
            validates clean against the matching schema. Browse them all,
            download the raw JSON, or link straight to a schema's stable URL.
          </p>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-page px-8 py-12">
          <ul className="grid grid-cols-1 gap-px bg-rule md:grid-cols-2">
            {schemas.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/schema/${s.id}`}
                  className={cn(
                    'block h-full bg-paper p-6 transition-colors duration-fast ease-arp',
                    'hover:bg-paper-2',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                      {s.id.toUpperCase()}
                    </span>
                    <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
                      VIEW →
                    </span>
                  </div>
                  <h2 className="mt-4 font-display text-h3 text-ink">
                    {s.title}
                  </h2>
                  <p className="mt-2 font-sans text-body-sm text-ink-2">
                    {s.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
