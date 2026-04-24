import type * as React from 'react';

import { ScopeViewer } from '@/components/ScopeViewer';
import { loadCatalog } from '@/lib/scope-catalog';

export const metadata = {
  title: 'Scope catalog v1',
  description:
    'The 50 reusable capability templates that make up the v1 ARP scope catalog. Search, filter by category or risk, copy YAML.',
};

export default function ScopeCatalogPage(): React.JSX.Element {
  const { scopes, manifest, yaml } = loadCatalog();

  return (
    <>
      <section className="border-t border-rule">
        <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 pt-16 pb-10">
          <div className="col-span-12 flex items-center gap-3">
            <span className="inline-block h-2 w-2 bg-signal-blue" />
            <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
              SCOPE CATALOG / v{manifest.version.replace(/^v/, '')} · {manifest.scope_count} ENTRIES
            </span>
          </div>
          <h1 className="col-span-12 mt-6 font-display text-display-md text-ink lg:col-span-10">
            Fifty reusable capability templates.
          </h1>
          <p className="col-span-12 mt-4 max-w-3xl font-sans text-body-lg text-ink-2 lg:col-span-8">
            Each scope compiles to a Cedar policy template and a consent
            string. Bundle authors pick the scopes their peer should be able
            to invoke, bind the parameter values, and ship the compiled
            bundle with their agent card.
          </p>

          <div className="col-span-12 mt-8 flex flex-wrap gap-3 font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            <span>CHECKSUM {manifest.checksum.slice(0, 23)}…</span>
            <span aria-hidden>·</span>
            <span>UPDATED {manifest.updated_at.slice(0, 10)}</span>
          </div>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="mx-auto w-full max-w-page px-8 py-12">
          <ScopeViewer scopes={scopes} yaml={yaml} />
        </div>
      </section>
    </>
  );
}
