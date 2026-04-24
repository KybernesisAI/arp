import Link from 'next/link';
import type * as React from 'react';

const RFCS: Array<{ id: string; title: string; status: string }> = [
  { id: 'process', title: 'RFC process', status: 'always-open' },
  { id: '0001-template', title: 'Template', status: 'template' },
  {
    id: '0002-connection-first-policy-model',
    title: 'RFC-0002: Connection-first policy model',
    status: 'accepted',
  },
  {
    id: '0003-did-pinned-tls-for-agent-endpoints',
    title: 'RFC-0003: DID-pinned TLS for agent endpoints',
    status: 'accepted',
  },
  {
    id: '0004-scope-catalog-versioning',
    title: 'RFC-0004: Scope catalog versioning',
    status: 'accepted',
  },
];

export default function RfcLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-12">
      <aside className="col-span-12 border-b border-rule pb-8 lg:col-span-3 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
        <nav aria-label="RFCs">
          <h2 className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            RFCS
          </h2>
          <ul className="mt-3 space-y-1">
            {RFCS.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.id === 'process' ? '/rfcs' : `/rfcs/${r.id}`}
                  className="block border-l-2 border-transparent pl-3 py-1 font-sans text-body-sm text-ink-2 hover:border-rule hover:text-ink"
                >
                  {r.title}
                </Link>
                <div className="pl-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {r.status}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-rule pt-4 text-body-sm">
            <a
              href="https://github.com/KybernesisAI/arp/tree/main/rfcs"
              className="text-ink hover:opacity-60"
            >
              View on GitHub →
            </a>
          </div>
        </nav>
      </aside>
      <main className="col-span-12 lg:col-span-9 lg:pl-8">
        <article className="arp-prose max-w-3xl">{children}</article>
      </main>
    </div>
  );
}
